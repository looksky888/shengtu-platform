package httpapi

import (
	"chatgpt2api/internal/config"
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"chatgpt2api/internal/version"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// writeBootstrapAdminNote stores one-time bootstrap credentials with restricted permissions.
// Returns the absolute path written.
func writeBootstrapAdminNote(dataDir, username, password string) (string, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dataDir, "bootstrap-admin.txt")
	body := fmt.Sprintf(
		"# Generated on first start. Delete this file after login and password change.\nusername=%s\npassword=%s\n",
		username, password,
	)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

const (
	maxLoginPageImageSize      = 10 << 20
	imageThumbnailCacheControl = "public, max-age=31536000, immutable"
	remoteMediaCacheControl    = "private, no-store"
	authSessionCookieName      = "chatgpt2api_session"
	responseImageAutoShortSide = 1024
	responseImageSizeMultiple  = 16
)

type App struct {
	config        *config.Store
	auth          *service.AuthService
	accounts      *service.AccountService
	logs          *service.LogService
	logger        *service.Logger
	proxy         *service.ProxyService
	engine        *protocol.Engine
	images        *service.ImageService
	media         *service.MediaLibrary
	mediaAdmin    *service.MediaLibrary
	mediaKey      string
	mediaMu       sync.Mutex
	billingMu     sync.RWMutex
	billingHealth creationBillingHealth
	videos        *service.VideoAssetService
	videoRefs     *service.VideoReferenceAssetService
	tasks         *service.ImageTaskService
	proxyStats    *imageProxyHealth
	apiLimiter    *apiKeyLimiter
	announce      *service.AnnouncementService
	backup        *service.BackupService
	prompts       *service.PromptFavoriteService
	cpa           *service.CPAConfig
	cpaImport     *service.CPAImportService
	register      *service.RegisterService
	credits       *service.CreditService
	imageChannels *service.ImageChannelService
	regQuota      *service.RegistrationQuotaService
	email         *service.RegistrationEmailService
	paymentAdmin  *service.PaymentAdminService
	paymentOrders *service.PaymentService
	update        *service.UpdateService
	cancel        context.CancelFunc
	rootCtx       context.Context
	closeTasks    func(context.Context) error
	closeUsage    func() error
	closeLog      func() error
	closeStorage  func() error
}

func NewApp() (*App, error) {
	cfg, err := config.NewStore()
	if err != nil {
		return nil, err
	}
	storageBackend, err := cfg.StorageBackend()
	if err != nil {
		return nil, err
	}
	closeStorage := func() error { return nil }
	if closer, ok := storageBackend.(interface{ Close() error }); ok {
		closeStorage = closer.Close
	}
	ctx, cancel := context.WithCancel(context.Background())
	logs := service.NewLogService(cfg.DataDir, storageBackend)
	logger, err := service.NewLogger(cfg.DataDir, cfg.LogLevels)
	if err != nil {
		cancel()
		_ = closeStorage()
		return nil, err
	}
	proxy := service.NewProxyService(cfg)
	accounts := service.NewAccountService(storageBackend, cfg, proxy, logs)
	if err := accounts.InitQuarantinePath(cfg.DataDir); err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, fmt.Errorf("初始化账号隔离仓失败: %w", err)
	}
	accounts.SetScheduleStrategy(service.AccountScheduleStrategy(cfg.ImageAccountSchedule()))
	auth := service.NewAuthService(storageBackend)
	if err := bootstrapAdmin(cfg, auth, logger); err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, err
	}
	warnStaleBootstrapAdminFile(cfg, logger)
	documentStore, _ := storageBackend.(storage.JSONDocumentBackend)
	media, err := service.NewMediaLibrary(ctx, cfg, storageBackend, logger)
	if err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, fmt.Errorf("初始化媒体存储: %w", err)
	}
	engine := &protocol.Engine{Accounts: accounts, Config: cfg, Storage: documentStore, Proxy: proxy, Logger: logger, Media: media}
	regQuota, err := service.NewRegistrationQuotaService(cfg.DataDir, storageBackend, service.RegistrationQuotaConfig{})
	if err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, fmt.Errorf("初始化注册设备 Secret 失败: %w", err)
	}
	email, err := service.NewRegistrationEmailService(cfg.DataDir, storageBackend, nil)
	if err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, fmt.Errorf("初始化邮箱注册服务失败: %w", err)
	}
	payment, err := service.NewPaymentAdminServiceFromBackend(cfg.DataDir, storageBackend)
	if err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, err
	}
	paymentOrders, err := service.NewPaymentServiceFromBackend(cfg.DataDir, storageBackend)
	if err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, err
	}
	imageChannels, err := service.NewImageChannelService(cfg.DataDir, storageBackend, service.ImageChannelLegacyConfig{
		ProxyEnabled: cfg.ImageProvider() == imageProviderProxyAPI, ProxyBaseURL: cfg.ImageProxyBaseURL(),
		ProxyAPIKey: cfg.ImageProxyAPIKey(), ProxyModel: cfg.ImageProxyModel(), ProxyModels: cfg.ImageProxyModels(),
		TimeoutSeconds: cfg.ImageProxyTimeoutSeconds(), MaxRetries: cfg.ImageProxyMaxRetries(), DownloadURLs: cfg.ImageProxyDownloadURLs(),
		MaxConcurrency: cfg.ImageConcurrentLimit(),
		GPTModelCosts: map[string]int{
			util.ImageModelGPT: cfg.GPTImage2CreditCost(), util.ImageModelGPT25: cfg.GPTImage25CreditCost(),
			util.ImageModelGPT25Flare: cfg.GPTImage25FlareCreditCost(), util.ImageModelGPT25Sunburst: cfg.GPTImage25SunburstCreditCost(),
		}, GrokImageCost1K: cfg.GrokImageCreditCost1K(), GrokImageCost2K: cfg.GrokImageCreditCost2K(),
	})
	if err != nil {
		cancel()
		_ = logger.Close()
		_ = closeStorage()
		return nil, fmt.Errorf("初始化生图渠道: %w", err)
	}
	images := service.NewImageService(cfg, storageBackend)
	images.BindMediaLibrary(media)
	app := &App{
		config: cfg, auth: auth, accounts: accounts, logs: logs, logger: logger, proxy: proxy, engine: engine,
		images:        images,
		media:         media,
		videos:        service.NewVideoAssetService(cfg.DataDir, storageBackend),
		videoRefs:     service.NewVideoReferenceAssetService(cfg.DataDir, storageBackend),
		proxyStats:    newImageProxyHealth(filepath.Join(cfg.DataDir, "image_proxy_health.json")),
		apiLimiter:    newAPIKeyLimiter(storageBackend, logger),
		announce:      service.NewAnnouncementService(cfg.DataDir, storageBackend),
		backup:        service.NewBackupService(cfg.RootDir, cfg.DataDir, storageBackend),
		prompts:       service.NewPromptFavoriteService(cfg.DataDir, storageBackend),
		cpa:           service.NewCPAConfig(cfg.DataDir, storageBackend),
		credits:       service.NewCreditService(cfg.DataDir, storageBackend),
		imageChannels: imageChannels,
		regQuota:      regQuota,
		email:         email,
		paymentAdmin:  payment,
		paymentOrders: paymentOrders,
		update:        newUpdateService(cfg),
		cancel:        cancel,
		rootCtx:       ctx,
		closeUsage:    logs.Close,
		closeLog:      logger.Close,
		closeStorage:  closeStorage,
	}
	app.cpaImport = service.NewCPAImportService(app.cpa, accounts, proxy)
	app.paymentOrders.BindCredits(app.credits)
	app.paymentOrders.StartRecovery(ctx, time.Minute, 50, func(summary service.PaymentRecoverySummary, err error) {
		if err != nil {
			app.logger.Warning("payment order recovery completed with failures", "scanned", summary.Scanned,
				"succeeded", summary.Succeeded, "closed", summary.Closed, "pending", summary.Pending,
				"failed", summary.Failed, "error", err.Error())
			return
		}
		app.logger.Info("payment order recovery completed", "scanned", summary.Scanned,
			"succeeded", summary.Succeeded, "closed", summary.Closed, "pending", summary.Pending)
	})
	app.paymentOrders.StartDailyReconciliation(ctx, func(run storage.PaymentReconciliationRunRecord, err error) {
		if err != nil {
			app.logger.Warning("payment bill reconciliation failed", "error", err.Error())
			return
		}
		app.logger.Info("payment bill reconciliation completed", "run_id", run.ID, "bill_date", run.BillDate,
			"bill_rows", run.BillRows, "amount_mismatches", run.AmountMismatches, "missing_local_orders", run.MissingLocalOrders,
			"missing_bill_orders", run.MissingBillOrders)
	})
	app.register = service.NewRegisterService(cfg.DataDir, accounts, storageBackend)
	app.wireImageTasks(cfg, storageBackend)
	app.startCreationBillingReconciliation(ctx, time.Minute)
	if err := app.videos.Backfill(app.tasks.VideoAssetSeeds()); err != nil && app.logger != nil {
		app.logger.Warning("video asset backfill failed", "error", err.Error())
	}
	if app.tasks != nil {
		app.closeTasks = app.tasks.Close
		app.tasks.BindRootContext(ctx)
	}
	accounts.StartLimitedWatcher(ctx, time.Duration(cfg.RefreshAccountIntervalMinute())*time.Minute)
	media.Start(ctx)
	app.backup.Start(ctx)
	app.startMediaCleanup(ctx, mediaCleanupInterval)
	return app, nil
}

const mediaCleanupInterval = time.Hour

func (a *App) startMediaCleanup(ctx context.Context, interval time.Duration) {
	if a == nil || a.config == nil {
		return
	}
	if interval <= 0 {
		interval = mediaCleanupInterval
	}
	cleanup := func() {
		if removed := a.config.CleanupOldImages(); removed > 0 && a.logger != nil {
			a.logger.Info("scheduled image cleanup completed", "removed", removed)
		}
		paymentSettings, paymentSettingsErr := a.paymentOrders.Settings()
		if paymentSettingsErr == nil && paymentSettings.CloudStorageEnabled && paymentSettings.CloudStoragePolicyStartedAt != "" && a.media != nil && a.config.MediaStorageProvider() == "r2" {
			if removed, err := a.media.CleanupExpiredRemoteMedia(ctx, a.config.ImageRetentionDays(), paymentSettings.CloudStoragePolicyStartedAt); err != nil {
				if a.logger != nil {
					a.logger.Warning("scheduled R2 image cleanup failed", "error", err.Error())
				}
			} else if removed > 0 && a.logger != nil {
				a.logger.Info("scheduled R2 image cleanup completed", "removed", removed)
			}
		}
		if a.videos == nil {
			return
		}
		removed, err := a.videos.CleanupOldVideos(a.config.VideoRetentionDays())
		if err != nil && a.logger != nil {
			a.logger.Warning("scheduled video cleanup failed", "error", err.Error())
		} else if removed > 0 && a.logger != nil {
			a.logger.Info("scheduled video cleanup completed", "removed", removed)
		}
	}
	cleanup()
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanup()
			}
		}
	}()
}

func bootstrapAdmin(cfg *config.Store, auth *service.AuthService, logger *service.Logger) error {
	bootstrap, err := auth.EnsureBootstrapAdmin(cfg.AdminUsername(), cfg.AdminPassword())
	if err != nil {
		return err
	}
	if !(bootstrap.Created && bootstrap.Generated) {
		return nil
	}
	// Never print plaintext password to stderr (log aggregators may capture it).
	if notePath, writeErr := writeBootstrapAdminNote(cfg.DataDir, bootstrap.Username, bootstrap.Password); writeErr != nil {
		logger.Warning("bootstrap admin created but credential file write failed", "username", bootstrap.Username, "error", writeErr.Error())
		fmt.Fprintf(os.Stderr, "bootstrap admin created: username=%s (write password file failed: %v)\n", bootstrap.Username, writeErr)
		return nil
	} else {
		logger.Warning("bootstrap admin password generated", "username", bootstrap.Username, "credentials_file", notePath)
		fmt.Fprintf(os.Stderr, "bootstrap admin created: username=%s credentials_file=%s\n", bootstrap.Username, notePath)
		fmt.Fprintf(os.Stderr, "read one-time password from %s then change password (file is deleted after password change)\n", notePath)
	}
	return nil
}

// warnStaleBootstrapAdminFile alerts when a leftover bootstrap credentials file is still on disk.
func warnStaleBootstrapAdminFile(cfg *config.Store, logger *service.Logger) {
	if cfg == nil {
		return
	}
	path := filepath.Join(cfg.DataDir, "bootstrap-admin.txt")
	if _, err := os.Stat(path); err != nil {
		return
	}
	if logger != nil {
		logger.Warning("bootstrap admin credentials file still present; change admin password to auto-delete", "credentials_file", path)
	}
}

func (a *App) wireImageTasks(cfg *config.Store, storageBackend storage.Backend) {
	a.tasks = service.NewStoredImageTaskService(filepath.Join(cfg.DataDir, "image_tasks.json"), storageBackend,
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			return a.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-generations", "文生图", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
				return a.runImageGenerationTask(ctx, payload)
			})
		},
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			return a.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-edits", "图生图", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
				return a.runImageEditTask(ctx, payload)
			})
		},
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			return a.runLoggedChatTask(ctx, identity, payload)
		},
		cfg.ImageRetentionDays,
		func() int {
			// Strict process-wide cap; each frozen channel may configure a lower cap.
			return cfg.ImageConcurrentLimit()
		},
		cfg.UserDefaultConcurrentLimit,
		cfg.UserDefaultRPMLimit,
	)
	a.tasks.SetTaskTimeoutGetter(func() time.Duration {
		return time.Duration(a.config.ImageTaskTimeoutSeconds()) * time.Second
	})
	a.tasks.SetWorkerPoolConfig(a.config.ImageWorkerCount(), a.config.ImageQueueCapacity())
	a.tasks.SetVideoWorkerPoolConfig(a.config.VideoWorkerCount(), a.config.VideoQueueCapacity())
	a.tasks.SetImageParallelGenerationGetter(a.config.ImageParallelGeneration)
	a.tasks.SetResponseImageHandler(func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		return a.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/response-image-generations", "Responses 作画", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
			return a.runResponsesImageGenerationTask(ctx, payload)
		})
	})
	a.tasks.SetVideoHandler(func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		return a.runLoggedVideoTask(ctx, identity, payload)
	})
	// After boot recovery marked queued/running tasks as error, refund open image charges
	// for the same deterministic ref used at deduct time (endpoint:task_id).
	a.refundInterruptedCreationTasks()
}

func (a *App) refundInterruptedCreationTasks() {
	if a == nil || a.tasks == nil || a.credits == nil {
		return
	}
	for _, task := range a.tasks.DrainRecoveredInterrupted() {
		if task == nil {
			continue
		}
		_, reason, refID := service.BillingRefForTask(task)
		if reason == "" || refID == "" || task.OwnerID == "" {
			continue
		}
		refunded, err := a.credits.RefundChargeByRef(task.OwnerID, reason, refID)
		if err != nil && a.logger != nil {
			a.logger.Warning("restart refund failed", "user_id", task.OwnerID, "task_id", task.ID, "ref_id", refID, "error", err.Error())
			continue
		}
		if refunded && a.logger != nil {
			a.logger.Info("restart refund applied", "user_id", task.OwnerID, "task_id", task.ID, "ref_id", refID)
		}
	}
}

func newUpdateService(cfg *config.Store) *service.UpdateService {
	return service.NewUpdateService(service.UpdateOptions{
		CurrentVersion: version.Get(),
		BuildType:      version.GetBuildType(),
		Repo:           cfg.UpdateRepo(),
		ProxyURL:       cfg.UpdateProxyURL(),
		GitHubToken:    cfg.UpdateGitHubToken(),
	})
}

func (a *App) Logger() *service.Logger {
	return a.logger
}
