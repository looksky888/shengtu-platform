package httpapi

import (
	"context"
	"net/http"
	"os"
	"time"

	"chatgpt2api/internal/hostupdate"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"chatgpt2api/internal/version"
)

func (a *App) handleHealth(w http.ResponseWriter, _ *http.Request) {
	status := "ok"
	degraded := []string{}
	accountsReady := true
	creditsReady := true
	if a.accounts != nil {
		accountsReady = a.accounts.StoreReady()
		if !accountsReady {
			status = "degraded"
			degraded = append(degraded, "account_pool_not_ready")
		}
	}
	if a.credits != nil {
		creditsReady = a.credits.StoreReady()
		if !creditsReady {
			status = "degraded"
			degraded = append(degraded, "credits_not_ready")
		}
	}
	payload := applicationHealthResponse{
		Status:  status,
		Version: version.Get(),
		// Ops: this process keeps pool leases / tasks / rate limits in memory.
		Deployment: healthDeployment{
			SingleWriterRequired: true,
			Note:                 "号池租约、任务队列、登录限流为进程内状态；请单实例部署或保证单写节点",
		},
		Storage: healthStorage{
			AccountPoolReady: accountsReady,
			CreditsReady:     creditsReady,
		},
	}
	if len(degraded) > 0 {
		payload.DegradedReasons = degraded
	}
	// Lightweight pool snapshot (no tokens) for ops probes.
	if a.accounts != nil {
		pool := a.accounts.PoolHealthSnapshotTyped()
		payload.AccountPool = &pool
	}
	if a.proxyStats != nil {
		proxy := a.proxyStats.Snapshot()
		payload.ImageProxy = &proxy
	}
	if a.tasks != nil {
		executors := a.tasks.ExecutorSnapshot()
		payload.TaskExecutors = &executors
		stageDurations := a.tasks.StageDurationSnapshot()
		payload.TaskStageDurations = &stageDurations
	}
	mediaMetrics := service.MediaStorageMetrics{Status: "local"}
	if a.media != nil {
		mediaMetrics = a.media.Metrics()
	}
	payload.MediaStorage = &mediaMetrics
	if a.paymentOrders != nil {
		paymentCallbacks := a.paymentOrders.CallbackHealth()
		payload.PaymentCallbacks = &paymentCallbacks
	}
	// 3.5 feature / sidecar flags (for ops probes).
	if a.config != nil {
		payload.FeaturesV35 = &healthFeaturesV35{
			ICloud:          a.config.FeatureICloud(),
			GrokNative:      true, // Grok 仅号池+runtime，无中转双轨
			GrokRegister:    a.config.FeatureGrokRegister(),
			RegisterBackend: a.config.FeatureRegisterBackend(),
			ICloudBaseURL:   a.config.ICloudPrivacyMailBaseURL(),
			GrokRuntimeURL:  a.config.GrokRuntimeBaseURL(),
		}
	}
	// Always HTTP 200 so Docker/k8s liveness does not thrash on soft degradation;
	// readiness should inspect status/degraded_reasons.
	util.WriteJSON(w, http.StatusOK, payload)
}

func (a *App) handleAdminSystem(w http.ResponseWriter, r *http.Request) {
	// RBAC: GET/POST /api/admin/system (subtree)
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}

	base := "/api/admin/system"
	switch r.URL.Path {
	case base + "/version":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		info, _ := a.update.CheckUpdate(r.Context(), false)
		util.WriteJSON(w, http.StatusOK, systemVersionResponse{
			Version: version.Get(), VersionInfo: version.GetInfo(), UpdateStatus: info,
		})
	case base + "/check-updates":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		info, err := a.update.CheckUpdate(r.Context(), r.URL.Query().Get("force") == "true")
		if err != nil {
			util.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, info)
	case base + "/update-status":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		a.writeHostUpdaterStatus(w, r)
	case base + "/update-preflight":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		a.startHostUpdaterPreflight(w, r)
	case base + "/update":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if err := a.update.EnsureAutomaticUpdateSupported(); err != nil {
			util.WriteError(w, http.StatusConflict, err.Error())
			return
		}
		if err := a.update.PerformUpdate(r.Context()); err != nil {
			util.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, systemActionResponse{Message: "更新完成，请重启服务", NeedRestart: true})
	case base + "/rollback":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if err := a.update.EnsureAutomaticUpdateSupported(); err != nil {
			util.WriteError(w, http.StatusConflict, err.Error())
			return
		}
		if err := a.update.Rollback(); err != nil {
			util.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, systemActionResponse{Message: "回滚完成，请重启服务", NeedRestart: true})
	case base + "/restart":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		// Process exits after responding; a process manager must restart it
		// (Docker restart: unless-stopped, systemd Restart=on-success/always, etc.).
		go func() {
			time.Sleep(100 * time.Millisecond)
			os.Exit(0)
		}()
		util.WriteJSON(w, http.StatusOK, systemActionResponse{
			Message:     "已发起服务重启，请确保进程管理器会重新拉起二进制",
			NeedRestart: false, Note: "os.Exit(0) 依赖外部守护（Docker/systemd）",
		})
	default:
		http.NotFound(w, r)
	}
}

func (a *App) writeHostUpdaterStatus(w http.ResponseWriter, r *http.Request) {
	if a.hostUpdater == nil {
		util.WriteJSON(w, http.StatusOK, hostUpdaterStatusResponse{Configured: false, Connected: false, Reason: a.hostUpdaterReason})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	state, err := a.hostUpdater.Status(ctx)
	if err != nil {
		util.WriteJSON(w, http.StatusOK, hostUpdaterStatusResponse{Configured: true, Connected: false, Reason: err.Error()})
		return
	}
	util.WriteJSON(w, http.StatusOK, hostUpdaterStatusResponse{Configured: true, Connected: true, State: &state})
}

func (a *App) startHostUpdaterPreflight(w http.ResponseWriter, r *http.Request) {
	if a.hostUpdater == nil {
		util.WriteError(w, http.StatusConflict, a.hostUpdaterReason)
		return
	}
	targetVersion := version.Get()
	if info, err := a.update.CheckUpdate(r.Context(), false); err == nil && info != nil && info.LatestVersion != "" {
		targetVersion = info.LatestVersion
	}
	request := hostupdate.PreflightRequest{TargetVersion: targetVersion}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	result, err := a.hostUpdater.StartPreflight(ctx, request)
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusAccepted, hostUpdaterPreflightResponse{Configured: true, Connected: true, Result: result})
}
