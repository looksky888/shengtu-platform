package httpapi

import (
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"

	"chatgpt2api/internal/util"
	"chatgpt2api/internal/version"
)

type routeMatch int

const (
	exactRoute routeMatch = iota
	prefixRoute
)

type appRoute struct {
	method  string
	path    string
	match   routeMatch
	handler http.HandlerFunc
}

func (a *App) Handler() http.Handler {
	routes := a.routes()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a.serveObservedHTTP(w, r, routes)
	})
}

func (a *App) routes() []appRoute {
	return []appRoute{
		exact(http.MethodGet, "/v1/models", a.handleModels),
		exact(http.MethodPost, "/v1/images/generations", a.handleImageGenerations),
		exact(http.MethodPost, "/v1/images/edits", a.handleImageEdits),
		prefix("/v1/videos", a.handleProtocolVideos),
		exact(http.MethodPost, "/v1/chat/completions", a.handleChatCompletions),
		exact(http.MethodPost, "/v1/responses", a.handleResponses),
		exact(http.MethodPost, "/v1/messages", a.handleMessages),

		exact(http.MethodPost, "/auth/login", a.handleLogin),
		exact(http.MethodPost, "/auth/logout", a.handleLogout),
		exact(http.MethodPost, "/auth/register", a.handleAccountRegister),
		exact(http.MethodPost, "/auth/email-code", a.handleRegistrationEmailCode),
		exact(http.MethodPost, "/auth/password-reset/email-code", a.handlePasswordResetEmailCode),
		exact(http.MethodPost, "/auth/password-reset", a.handlePasswordReset),
		exact(http.MethodGet, "/auth/session", a.handleSession),
		exact("", "/auth/providers", a.handleAuthProviders),
		exact(http.MethodGet, "/health", a.handleHealth),
		exact(http.MethodGet, "/ready", a.handleReadiness),
		exact(http.MethodGet, "/version", func(w http.ResponseWriter, _ *http.Request) {
			util.WriteJSON(w, http.StatusOK, versionResponse{Version: version.Get()})
		}),
		exact("", "/api/announcements", a.handlePublicAnnouncements),
		subtree("/api/admin/system", a.handleAdminSystem),
		exact(http.MethodPost, "/api/admin/announcements/upload-image", a.handleAnnouncementImageUpload),
		subtree("/api/admin/announcements", a.handleAdminAnnouncements),
		subtree("/api/admin/backup", a.handleAdminBackup),
		subtree("/api/admin/media-storage", a.handleAdminMediaStorage),
		subtree("/api/admin/roles", a.handleAdminRoles),
		subtree("/api/admin/users", a.handleAdminUsers),
		subtree("/api/admin/credits", a.handleAdminCredits),
		subtree("/api/admin/email-settings", a.handleAdminEmailSettings),
		subtree("/api/admin/payment-channels", a.handleAdminPaymentChannels),
		exact(http.MethodGet, "/api/admin/payment-stats", a.handleAdminPaymentStats),
		subtree("/api/admin/payment-settings", a.handleAdminPaymentSettings),
		subtree("/api/admin/recharge-products", a.handleAdminRechargeProducts),
		subtree("/api/admin/payment-orders", a.handleAdminPaymentOrders),
		subtree(imageChannelsAdminPath, a.handleAdminImageChannels),
		subtree("/api/admin/payment-reconciliations", a.handleAdminPaymentReconciliations),
		exact(http.MethodGet, "/api/payment/products", a.handlePaymentProducts),
		exact(http.MethodGet, "/api/payment/channels", a.handlePaymentChannels),
		exact(http.MethodGet, "/api/payment/settings", a.handlePaymentSettings),
		exact(http.MethodGet, "/api/payment/storage-entitlement", a.handlePaymentStorageEntitlement),
		prefix("/api/payment/orders", a.handlePaymentOrders),
		prefix("/api/payment/wechat/notify", a.handleWechatPaymentNotify),
		prefix("/api/payment/alipay/notify", a.handleAlipayPaymentNotify),
		subtree(registrationRiskSettingsPath, a.handleAdminRegistrationRiskSettings),
		exact("", "/api/profile", a.handleProfile),
		exact(http.MethodPost, "/api/profile/password", a.handleProfilePassword),
		exact(http.MethodGet, "/api/profile/credits", a.handleProfileCredits),
		exact(http.MethodGet, "/api/profile/credits/ledger", a.handleProfileCreditLedger),
		exact(http.MethodPost, "/api/profile/credits/redeem", a.handleProfileCreditRedeem),
		exact(http.MethodPost, "/api/profile/checkin", a.handleProfileCheckin),
		exact(http.MethodGet, "/api/profile/invite", a.handleProfileInvite),
		subtree("/api/profile/api-key", a.handleProfileAPIKey),
		subtree("/api/profile/prompt-favorites", a.handleProfilePromptFavorites),
		subtree("/api/auth/users", a.handleUserKeys),
		subtree("/api/accounts", a.handleAccounts),
		// 3.5: Grok 号池（代理到 grok-runtime）
		prefix("/api/grok", a.handleGrokAccounts),
		subtree("/api/cpa/pools", a.handleCPA),
		subtree("/api/creation-tasks", a.handleCreationTasks),
		prefix("/api/videos", a.handleVideos),
		prefix("/api/video-reference-assets", a.handleVideoReferenceAssets),
		subtree("/api/register", a.handleRegister),
		// 3.5: iCloud Privacy Mail admin proxy (feature-flagged)
		prefix("/api/icloud", a.handleICloudProxy),
		exact("", "/api/settings", a.handleSettings),
		exact(http.MethodGet, "/api/creation-pricing", a.handleCreationPricing),
		exact("", "/api/settings/login-page-image", a.handleLoginPageImageSettings),
		exact(http.MethodPost, "/api/settings/image-proxy/models", a.handleImageProxyModels),
		exact(http.MethodGet, "/api/settings/image-proxy/health", a.handleImageProxyHealth),
		exact(http.MethodGet, "/api/app-meta", a.handleAppMeta),
		exact(http.MethodGet, "/api/admin/permissions", a.handlePermissionCatalog),
		exact(http.MethodGet, "/api/admin/image-task-logs", a.handleAdminImageTaskLogs),
		prefix("/api/admin/image-task-logs/", a.handleAdminImageTaskCancel),
		exact(http.MethodGet, "/api/admin/task-queue/events", a.handleAdminTaskQueueEvents),
		exact(http.MethodGet, "/api/admin/account-pool/health", a.handleAdminAccountPoolHealth),
		exact("", "/api/admin/account-quarantine", a.handleAdminAccountQuarantine),
		exact(http.MethodGet, "/api/admin/image-task-stats", a.handleAdminImageTaskStats),
		exact(http.MethodGet, "/api/admin/image-task-stats/today", a.handleAdminImageTaskTodayStats),
		// User-facing mirror of ledger today stats (创作台悬浮球); auth-only.
		exact(http.MethodGet, "/api/image-task-stats/today", a.handleStudioImageTaskTodayStats),
		exact("", "/api/images/visibility", a.handleImageVisibility),
		exact(http.MethodPost, "/api/images/download", a.handleImageArchive),
		exact("", "/api/images", a.handleImages),
		exact("", "/api/logs/governance", a.handleLogGovernance),
		exact(http.MethodGet, "/api/logs", a.handleLogs),
		exact("", "/api/proxy", a.handleProxy),
		exact("", "/api/proxy/test", a.handleProxy),
		exact("", "/api/proxy/clearance/test", a.handleProxy),
		exact(http.MethodGet, "/api/proxy/runtime", a.handleProxy),
		exact(http.MethodPost, "/api/proxy/clearance/warmup", a.handleProxy),
		exact(http.MethodGet, "/api/model-catalog", a.handleModelCatalog),
		exact(http.MethodGet, "/api/image-channels", a.handlePublicImageChannels),
		exact(http.MethodGet, "/api/storage/info", a.handleStorageInfo),

		prefix("/images/", a.handleImageFile),
		prefix("/image-thumbnails/", a.handleImageThumbnail),
		prefix("/login-page-images/", serveRasterImageDirectory("/login-page-images/", a.config.LoginPageImagesDir())),
		prefix("/announcement-images/", serveRasterImageDirectory("/announcement-images/", a.config.AnnouncementImagesDir())),
	}
}

func serveRasterImageDirectory(urlPrefix, root string) http.HandlerFunc {
	files := http.StripPrefix(urlPrefix, http.FileServer(http.Dir(root)))
	return func(w http.ResponseWriter, r *http.Request) {
		switch strings.ToLower(path.Ext(r.URL.Path)) {
		case ".jpg", ".jpeg", ".png", ".gif", ".webp":
			w.Header().Set("X-Content-Type-Options", "nosniff")
			files.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	}
}

func exact(method, path string, handler http.HandlerFunc) appRoute {
	return appRoute{method: method, path: path, match: exactRoute, handler: handler}
}

func prefix(path string, handler http.HandlerFunc) appRoute {
	return appRoute{path: path, match: prefixRoute, handler: handler}
}

func subtree(path string, handler http.HandlerFunc) appRoute {
	return prefix(path, handler)
}

func (a *App) serveHTTP(w http.ResponseWriter, r *http.Request, routes []appRoute) {
	applyCORS(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if route := matchAppRoute(routes, r.Method, r.URL.Path); route != nil {
		if isSynchronousCreationRequest(r.Method, r.URL.Path) {
			release, err := a.updateAdmission.enter()
			if err != nil {
				writeCreationTaskSubmitError(w, err)
				return
			}
			defer release()
		}
		route.handler(w, r)
		return
	}
	if isAPISpace(r.URL.Path) {
		http.NotFound(w, r)
		return
	}
	a.serveWeb(w, r)
}

func matchAppRoute(routes []appRoute, method, path string) *appRoute {
	for i := range routes {
		route := &routes[i]
		if route.method != "" && route.method != method {
			continue
		}
		switch route.match {
		case exactRoute:
			if path == route.path {
				return route
			}
		case prefixRoute:
			if path == route.path || strings.HasPrefix(path, strings.TrimRight(route.path, "/")+"/") {
				return route
			}
		}
	}
	return nil
}

func isAPISpace(path string) bool {
	return path == "/api" || strings.HasPrefix(path, "/api/") ||
		path == "/auth" || strings.HasPrefix(path, "/auth/") ||
		path == "/internal" || strings.HasPrefix(path, "/internal/") ||
		path == "/v1" || strings.HasPrefix(path, "/v1/")
}

func applyCORS(w http.ResponseWriter, r *http.Request) {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin != "" && isAllowedCredentialedOrigin(origin, r.Host) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Add("Vary", "Origin")
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	if requestedHeaders := strings.TrimSpace(r.Header.Get("Access-Control-Request-Headers")); requestedHeaders != "" {
		w.Header().Set("Access-Control-Allow-Headers", requestedHeaders)
		w.Header().Add("Vary", "Access-Control-Request-Headers")
	} else {
		w.Header().Set("Access-Control-Allow-Headers", "*")
	}
}

func isAllowedCredentialedOrigin(origin, requestHost string) bool {
	originURL, err := url.Parse(origin)
	if err != nil || originURL.Scheme == "" || originURL.Hostname() == "" {
		return false
	}
	requestHostname := requestHost
	if host, _, err := net.SplitHostPort(requestHost); err == nil {
		requestHostname = host
	}
	requestHostname = strings.Trim(requestHostname, "[]")
	originHostname := originURL.Hostname()
	return strings.EqualFold(originHostname, requestHostname) ||
		isLoopbackHostname(originHostname) && isLoopbackHostname(requestHostname)
}

func isLoopbackHostname(hostname string) bool {
	switch strings.ToLower(strings.TrimSpace(hostname)) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}
