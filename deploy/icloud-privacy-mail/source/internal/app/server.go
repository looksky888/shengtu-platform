package app

import (
	"context"
	"embed"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

//go:embed templates/*.html
var webFS embed.FS

const mailboxCodeFreshWindow = 5 * time.Minute
const mailboxCreateMinInterval = 3 * time.Second
const mailboxCreateLimitCooldown = 2 * time.Minute
const mailboxListDefaultPageSize = 10
const mailboxListMaxPageSize = 500

var mailboxMailSyncMinInterval = 3 * time.Second
var mailboxCodeFastWait = 600 * time.Millisecond
var mailboxCodePollDebounce = 100 * time.Millisecond
var mailboxCodeLocalPollInterval = 100 * time.Millisecond
var mailboxCodeBatchSyncTimeout = 120 * time.Second
var mailboxCodeMaxClientWait = 30 * time.Second
var iCloudMailboxListAccountTimeout = 25 * time.Second
var mailWatcherPollInterval = 3 * time.Second
var mailWatcherActiveTTL = 20 * time.Minute

const (
	defaultMailWatcherFetchLimit        = 8
	defaultMailWatcherInitialFetchLimit = 20
	defaultMailWatcherLookback          = 24 * time.Hour
	mailWatcherSyncTimeout              = 90 * time.Second
)

type Server struct {
	cfg                            Config
	store                          *FileStore
	logger                         *slog.Logger
	mux                            *http.ServeMux
	icloudProtocolLogins           *appleAuthPendingStore
	appleAccountLogins             *appleAuthPendingStore
	icloudCreateMu                 sync.Mutex
	icloudCreateGates              map[string]chan struct{}
	icloudCreateLast               map[string]time.Time
	icloudCreateCooldown           map[string]time.Time
	icloudMailSyncMu               sync.Mutex
	icloudMailSyncGates            map[string]chan struct{}
	icloudMailSyncLast             map[string]time.Time
	mailboxSyncMinInterval         time.Duration
	mailboxCodeFastWait            time.Duration
	mailboxCodeMu                  sync.Mutex
	mailboxCodePollers             map[string]*mailboxCodePoller
	mailWatcherMu                  sync.Mutex
	mailWatcherCancel              context.CancelFunc
	mailWatcherWake                chan struct{}
	mailWatcherEnabled             bool
	mailWatcherInterval            time.Duration
	mailWatcherFetchLimit          int
	mailWatcherInitialFetchLimit   int
	mailWatcherLookback            time.Duration
	mailWatcherActiveUntil         map[string]time.Time
	appleAccountKeepAliveMu        sync.Mutex
	appleAccountKeepAliveCancel    context.CancelFunc
	appleAccountKeepAliveEnabled   bool
	appleAccountKeepAliveInterval  time.Duration
	schedulerMu                    sync.Mutex
	mailboxSchedulers              map[string]*mailboxSchedulerJob
	createMailboxForOwner          func(ctx context.Context, ownerID, accountID, label, note string) (Mailbox, ICloudRemoteMailbox, error)
	keepAliveAppleAccountState     func(ctx context.Context, state LoginState) (LoginState, error)
	syncMailboxMessages            func(ctx context.Context, session ICloudSession, mailbox Mailbox, after time.Time, keyword string, maxThreads int) ([]ICloudSyncedMessage, error)
	syncMailboxBatch               func(ctx context.Context, session ICloudSession, mailboxes []Mailbox, after time.Time, keyword string, maxThreads int) (map[string][]ICloudSyncedMessage, error)
	syncCodeMailboxBatch           func(ctx context.Context, state LoginState, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (map[string][]ICloudSyncedMessage, error)
	syncCodeMailboxBatchWithCursor func(ctx context.Context, state LoginState, mailboxes []Mailbox, after time.Time, keyword string, maxMessages int) (iCloudIMAPSyncResult, error)
	latestIMAPUID                  func(ctx context.Context, state LoginState) (string, error)
	checkIMAPLogin                 func(ctx context.Context, email, appPassword string) error
	updateMu                       sync.Mutex
	updateApplyMu                  sync.Mutex
	updateCache                    updateCandidate
	updateCacheAt                  time.Time
}

type createMailboxFailure struct {
	AccountID string `json:"account_id,omitempty"`
	AppleID   string `json:"apple_id,omitempty"`
	Channel   string `json:"channel,omitempty"`
	Code      string `json:"code,omitempty"`
	Error     string `json:"error"`
}

type mailboxCreateChannel string

const (
	mailboxCreateChannelAuto         mailboxCreateChannel = ""
	mailboxCreateChannelAppleAccount mailboxCreateChannel = "apple_account"
	mailboxCreateChannelICloudWeb    mailboxCreateChannel = "icloud_web"
)

type mailboxCreateChannelContextKey struct{}

type mailboxCreateRequest struct {
	AccountID string
	Channel   mailboxCreateChannel
}

func contextWithMailboxCreateChannel(ctx context.Context, channel mailboxCreateChannel) context.Context {
	channel = normalizeMailboxCreateChannel(channel)
	if channel == mailboxCreateChannelAuto {
		return ctx
	}
	return context.WithValue(ctx, mailboxCreateChannelContextKey{}, channel)
}

func mailboxCreateChannelFromContext(ctx context.Context) mailboxCreateChannel {
	channel, _ := ctx.Value(mailboxCreateChannelContextKey{}).(mailboxCreateChannel)
	return normalizeMailboxCreateChannel(channel)
}

func normalizeMailboxCreateChannel(channel mailboxCreateChannel) mailboxCreateChannel {
	switch channel {
	case mailboxCreateChannelAppleAccount, mailboxCreateChannelICloudWeb:
		return channel
	default:
		return mailboxCreateChannelAuto
	}
}

func mailboxCreateChannelLabel(channel mailboxCreateChannel) string {
	switch normalizeMailboxCreateChannel(channel) {
	case mailboxCreateChannelAppleAccount:
		return "新接口"
	case mailboxCreateChannelICloudWeb:
		return "旧接口"
	default:
		return "自动接口"
	}
}

type syncICloudMailboxResult struct {
	AccountID string `json:"account_id,omitempty"`
	AppleID   string `json:"apple_id,omitempty"`
	Source    string `json:"source,omitempty"`
	Total     int    `json:"total"`
	Created   int    `json:"created"`
	Updated   int    `json:"updated"`
	Skipped   int    `json:"skipped"`
	Error     string `json:"error,omitempty"`
}

type mailboxCodeWaiter struct {
	ctx           context.Context
	mailboxID     string
	after         time.Time
	keyword       string
	forceSync     bool
	skipMessageID string
	result        chan mailboxCodeResult
}

type mailboxCodeResult struct {
	message Message
	code    string
	ok      bool
	syncErr error
}

type mailboxCodePoller struct {
	ownerID string
	waiters []*mailboxCodeWaiter
}

type mailboxWatcherOwnerGroup struct {
	ownerID   string
	mailboxes []Mailbox
}

type mailboxWatcherIMAPGroup struct {
	key       string
	ownerID   string
	state     LoginState
	mailboxes []Mailbox
	signature string
}

type mailboxWatcherIdleWorker struct {
	cancel    context.CancelFunc
	signature string
}

func NewServer(cfg Config, store *FileStore, logger *slog.Logger) http.Handler {
	if store != nil {
		store.configureMessageRetention(cfg.MessageRetentionDays, cfg.MessageRetentionPerMailbox)
	}
	s := &Server{
		cfg:                           cfg,
		store:                         store,
		logger:                        logger,
		mux:                           http.NewServeMux(),
		icloudProtocolLogins:          newAppleAuthPendingStore(),
		appleAccountLogins:            newAppleAuthPendingStore(),
		icloudCreateGates:             make(map[string]chan struct{}),
		icloudCreateLast:              make(map[string]time.Time),
		icloudCreateCooldown:          make(map[string]time.Time),
		icloudMailSyncGates:           make(map[string]chan struct{}),
		icloudMailSyncLast:            make(map[string]time.Time),
		mailboxSyncMinInterval:        mailboxMailSyncMinInterval,
		mailboxCodeFastWait:           mailboxCodeFastWait,
		mailboxCodePollers:            make(map[string]*mailboxCodePoller),
		mailWatcherWake:               make(chan struct{}, 1),
		mailWatcherEnabled:            cfg.MailWatcherEnabled,
		mailWatcherInterval:           mailWatcherPollInterval,
		mailWatcherFetchLimit:         defaultMailWatcherFetchLimit,
		mailWatcherInitialFetchLimit:  defaultMailWatcherInitialFetchLimit,
		mailWatcherLookback:           defaultMailWatcherLookback,
		mailWatcherActiveUntil:        make(map[string]time.Time),
		appleAccountKeepAliveEnabled:  cfg.AppleAccountKeepAliveEnabled,
		appleAccountKeepAliveInterval: appleAccountKeepAliveDefaultInterval,
		mailboxSchedulers:             make(map[string]*mailboxSchedulerJob),
	}
	if cfg.PublicSyncMinIntervalMS > 0 {
		s.mailboxSyncMinInterval = time.Duration(cfg.PublicSyncMinIntervalMS) * time.Millisecond
	}
	if cfg.PublicFastSyncWaitMS > 0 {
		s.mailboxCodeFastWait = time.Duration(cfg.PublicFastSyncWaitMS) * time.Millisecond
	}
	if cfg.MailWatcherPollMS > 0 {
		s.mailWatcherInterval = time.Duration(cfg.MailWatcherPollMS) * time.Millisecond
	}
	if cfg.MailWatcherFetchLimit > 0 {
		s.mailWatcherFetchLimit = cfg.MailWatcherFetchLimit
	}
	if cfg.MailWatcherInitialFetchLimit > 0 {
		s.mailWatcherInitialFetchLimit = cfg.MailWatcherInitialFetchLimit
	}
	if cfg.MailWatcherLookbackHours > 0 {
		s.mailWatcherLookback = time.Duration(cfg.MailWatcherLookbackHours) * time.Hour
	}
	if cfg.AppleAccountKeepAliveMS > 0 {
		s.appleAccountKeepAliveInterval = time.Duration(cfg.AppleAccountKeepAliveMS) * time.Millisecond
	}
	s.createMailboxForOwner = s.createICloudMailboxForOwner
	s.keepAliveAppleAccountState = func(ctx context.Context, state LoginState) (LoginState, error) {
		return NewICloudClient().keepAliveAppleAccountManageStateUnlocked(ctx, state)
	}
	s.syncMailboxMessages = func(ctx context.Context, session ICloudSession, mailbox Mailbox, after time.Time, keyword string, maxThreads int) ([]ICloudSyncedMessage, error) {
		return NewICloudClient().SyncMailboxMessages(ctx, session, mailbox, after, keyword, maxThreads)
	}
	s.syncMailboxBatch = func(ctx context.Context, session ICloudSession, mailboxes []Mailbox, after time.Time, keyword string, maxThreads int) (map[string][]ICloudSyncedMessage, error) {
		return NewICloudClient().SyncMailboxMessagesBatch(ctx, session, mailboxes, after, keyword, maxThreads)
	}
	s.checkIMAPLogin = CheckICloudIMAPLogin
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if isInternalICloudRequest(r) {
		s.mux.ServeHTTP(w, r)
		return
	}
	if s.requiresAdmin(r) &&
		!s.authorizedAdminSession(r) &&
		!(s.allowsUserSession(r) && s.authorizedUserSession(r)) {
		writeError(w, http.StatusUnauthorized, errCode("auth_required", "请先登录账号", false))
		return
	}
	s.mux.ServeHTTP(w, r)
}

func isInternalICloudRequest(r *http.Request) bool {
	if r == nil || r.Header.Get("X-ChatGPT2API-Internal") != "icloud-privacy-mail" {
		return false
	}
	return constantTimeEqual(r.Header.Get("X-Internal-Token"), os.Getenv("INTERNAL_SERVICE_TOKEN"))
}

func (s *Server) StartMailWatcher(ctx context.Context) {
	if !s.mailWatcherEnabled {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	s.mailWatcherMu.Lock()
	if s.mailWatcherCancel != nil {
		s.mailWatcherMu.Unlock()
		return
	}
	watchCtx, cancel := context.WithCancel(ctx)
	s.mailWatcherCancel = cancel
	s.mailWatcherMu.Unlock()

	go s.runMailWatcher(watchCtx)
}

func (s *Server) StopMailWatcher() {
	s.mailWatcherMu.Lock()
	cancel := s.mailWatcherCancel
	s.mailWatcherCancel = nil
	s.mailWatcherMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Server) StartAppleAccountKeepAlive(ctx context.Context) {
	if !s.appleAccountKeepAliveEnabled {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	s.appleAccountKeepAliveMu.Lock()
	if s.appleAccountKeepAliveCancel != nil {
		s.appleAccountKeepAliveMu.Unlock()
		return
	}
	keepAliveCtx, cancel := context.WithCancel(ctx)
	s.appleAccountKeepAliveCancel = cancel
	s.appleAccountKeepAliveMu.Unlock()

	go s.runAppleAccountKeepAlive(keepAliveCtx)
}

func (s *Server) StopAppleAccountKeepAlive() {
	s.appleAccountKeepAliveMu.Lock()
	cancel := s.appleAccountKeepAliveCancel
	s.appleAccountKeepAliveCancel = nil
	s.appleAccountKeepAliveMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /", s.handleHome)
	s.mux.HandleFunc("GET /login", s.handleLoginPage)
	s.mux.HandleFunc("GET /manage", s.handleManagePage)
	s.mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)
	s.mux.HandleFunc("POST /api/auth/register", s.handleAuthRegister)
	s.mux.HandleFunc("POST /api/auth/login", s.handleAuthLogin)
	s.mux.HandleFunc("POST /api/auth/logout", s.handleAuthLogout)
	s.mux.HandleFunc("DELETE /api/admin/users/{id}", s.handleAdminDeleteUser)
	s.mux.HandleFunc("GET /api/status", s.handleStatus)
	s.mux.HandleFunc("GET /api/update/status", s.handleUpdateStatus)
	s.mux.HandleFunc("POST /api/update/apply", s.handleApplyUpdate)
	s.mux.HandleFunc("GET /api/create-settings", s.handleCreateSettings)
	s.mux.HandleFunc("POST /api/create-settings", s.handleSaveCreateSettings)
	s.mux.HandleFunc("GET /api/manage/data", s.handleManageData)
	s.mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	s.mux.HandleFunc("POST /api/v1/mailboxes/claim", s.handleClaimMailbox)
	s.mux.HandleFunc("POST /api/v1/mailboxes/claim-status", s.handleClaimMailboxStatus)
	s.mux.HandleFunc("POST /api/v1/mailboxes/lookup", s.handleLookupMailboxes)
	s.mux.HandleFunc("GET /api/runtime/export", s.handleExportRuntimeData)
	s.mux.HandleFunc("GET /api/runtime/export-mailbox-apis", s.handleExportMailboxAPIs)
	s.mux.HandleFunc("GET /api/runtime/export-mailbox-emails", s.handleExportMailboxEmails)
	s.mux.HandleFunc("GET /api/icloud/session", s.handleICloudSession)
	s.mux.HandleFunc("POST /api/icloud/protocol-login/start", s.handleStartICloudProtocolLogin)
	s.mux.HandleFunc("POST /api/icloud/protocol-login/2fa", s.handleSubmitICloudProtocol2FA)
	s.mux.HandleFunc("POST /api/apple-account/login/start", s.handleStartAppleAccountLogin)
	s.mux.HandleFunc("POST /api/apple-account/login/2fa", s.handleSubmitAppleAccount2FA)
	s.mux.HandleFunc("POST /api/icloud/session/check", s.handleCheckICloudSession)
	s.mux.HandleFunc("POST /api/icloud/imap-login/save", s.handleSaveICloudIMAPLogin)
	s.mux.HandleFunc("POST /api/icloud/imap-login/check", s.handleCheckICloudIMAPLogin)
	s.mux.HandleFunc("POST /api/icloud/mailboxes/create", s.handleCreateICloudMailbox)
	s.mux.HandleFunc("POST /api/icloud/mailboxes/sync", s.handleSyncICloudMailboxes)
	s.mux.HandleFunc("GET /api/icloud/scheduler/status", s.handleMailboxSchedulerStatus)
	s.mux.HandleFunc("POST /api/icloud/scheduler/start", s.handleStartMailboxScheduler)
	s.mux.HandleFunc("POST /api/icloud/scheduler/stop", s.handleStopMailboxScheduler)
	s.mux.HandleFunc("POST /api/icloud/scheduler/logs/clear", s.handleClearMailboxSchedulerLogs)
	s.mux.HandleFunc("GET /api/accounts", s.handleListAccounts)
	s.mux.HandleFunc("POST /api/accounts", s.handleCreateAccount)
	s.mux.HandleFunc("GET /api/mailboxes", s.handleListMailboxes)
	s.mux.HandleFunc("POST /api/mailboxes", s.handleCreateMailbox)
	s.mux.HandleFunc("POST /api/mailboxes/remote-clean", s.handleCleanRemoteMailboxes)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/verify", s.handleVerifyMailbox)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/disable", s.handleDisableMailbox)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/status", s.handleSetMailboxStatus)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/tag", s.handleSetMailboxTag)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/sync", s.handleSyncMailbox)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/remote-clean", s.handleCleanRemoteMailbox)
	s.mux.HandleFunc("DELETE /api/mailboxes/{id}", s.handleDeleteMailbox)
	s.mux.HandleFunc("GET /api/mailboxes/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("POST /api/mailboxes/{id}/messages", s.handleCreateMessage)
	s.mux.HandleFunc("GET /api/mailboxes/{id}/code", s.handleMailboxCodeByID)
	s.mux.HandleFunc("GET /api/v1/mailboxes/{email}/code", s.handleMailboxCodeByEmail)
}
