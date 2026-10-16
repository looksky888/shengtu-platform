package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type apiKeyReleaseContextKey struct{}

// requireIdentity authenticates the caller and enforces the RBAC API catalog.
// Admin role bypasses catalog checks; custom roles must hold a matching API permission.
// Do NOT add a second Role==admin gate after this for routes listed in the catalog —
// that dual path made RBAC grants ineffective. Keep Role==admin only for data-scope
// decisions (e.g. "see all private images" vs "own only").
func (a *App) requireIdentity(w http.ResponseWriter, r *http.Request, overrideAuth string) (service.Identity, bool) {
	token := overrideAuthToken(overrideAuth, r)
	if identity := a.auth.Authenticate(token); identity != nil {
		if !a.identityCanAccessRequest(*identity, r) {
			util.WriteError(w, http.StatusForbidden, "权限不足")
			return service.Identity{}, false
		}
		ctx := withRequestIdentity(r.Context(), *identity)
		if isRateLimitedProtocolRequest(r) && a.apiLimiter != nil {
			release, status, message := a.apiLimiter.acquire(*identity, a.config.APIKeyDefaultRPMLimit(), a.config.APIKeyDefaultConcurrentLimit(), a.config.APIKeyDailyRequestLimit(), time.Now())
			if status != 0 {
				w.Header().Set("Retry-After", "60")
				util.WriteError(w, status, message)
				return service.Identity{}, false
			}
			ctx = context.WithValue(ctx, apiKeyReleaseContextKey{}, release)
		}
		*r = *r.WithContext(ctx)
		return *identity, true
	}
	util.WriteError(w, http.StatusUnauthorized, "登录已失效，请重新登录")
	return service.Identity{}, false
}

func isRateLimitedProtocolRequest(r *http.Request) bool {
	if r == nil || !isProtocolPath(r.URL.Path) || r.Method != http.MethodPost {
		return false
	}
	return r.URL.Path != "/v1/models"
}

func releaseAPIKeyLimit(ctx context.Context) {
	if ctx == nil {
		return
	}
	if release, ok := ctx.Value(apiKeyReleaseContextKey{}).(func()); ok && release != nil {
		release()
	}
}

// identityIsAdmin is data-scope helper (full resource visibility), not API gate.
func identityIsAdmin(identity service.Identity) bool {
	return identity.Role == service.AuthRoleAdmin
}

func overrideAuthToken(overrideAuth string, r *http.Request) string {
	if overrideAuth != "" {
		return extractBearerToken(overrideAuth)
	}
	return requestAuthToken(r)
}

func requestAuthToken(r *http.Request) string {
	if token := requestBearerToken(r); token != "" {
		return token
	}
	if token := strings.TrimSpace(r.Header.Get("X-API-Key")); token != "" {
		return token
	}
	return requestAuthCookieToken(r)
}

func requestBearerToken(r *http.Request) string {
	return extractBearerToken(r.Header.Get("Authorization"))
}

func requestAuthCookieToken(r *http.Request) string {
	cookie, err := r.Cookie(authSessionCookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func (a *App) imageRequestIdentity(w http.ResponseWriter, r *http.Request) (service.Identity, bool) {
	token := requestAuthToken(r)
	if token == "" {
		util.WriteError(w, http.StatusUnauthorized, "登录已失效，请重新登录")
		return service.Identity{}, false
	}
	if identity := a.auth.Authenticate(token); identity != nil {
		return *identity, true
	}
	util.WriteError(w, http.StatusUnauthorized, "登录已失效，请重新登录")
	return service.Identity{}, false
}

func (a *App) identityPermissions(identity service.Identity) service.PermissionSet {
	if identity.Role == service.AuthRoleAdmin {
		return service.DefaultPermissionSetForRole(service.AuthRoleAdmin)
	}
	return service.PermissionSet{
		MenuPaths:      service.NormalizeMenuPermissions(identity.MenuPaths),
		APIPermissions: service.NormalizeAPIPermissions(identity.APIPermissions),
	}
}

func (a *App) identityCanAccessRequest(identity service.Identity, r *http.Request) bool {
	if identity.Role == service.AuthRoleAdmin || isPermissionCheckSkipped(r.URL.Path) {
		return true
	}
	return a.identityCanAccessAPI(identity, r.Method, r.URL.Path)
}

func (a *App) identityCanAccessAPI(identity service.Identity, method, path string) bool {
	if identity.Role == service.AuthRoleAdmin {
		return true
	}
	return service.HasAPIPermission(a.identityPermissions(identity), method, path)
}

func isPermissionCheckSkipped(path string) bool {
	switch path {
	case "/auth/login":
		return true
	case "/auth/logout":
		return true
	case "/auth/register":
		return true
	case "/auth/session":
		return true
	case "/api/profile":
		return true
	case "/api/profile/password":
		return true
	case "/api/profile/api-key":
		return true
	case "/api/profile/prompt-favorites":
		return true
	case "/api/profile/credits":
		return true
	case "/api/profile/credits/ledger":
		return true
	case "/api/profile/credits/redeem":
		return true
	case "/api/profile/checkin":
		return true
	case "/api/profile/invite":
		return true
	case "/api/image-task-stats/today":
		// Studio FAB: same ledger stats as settings, readable by any logged-in user.
		return true
	default:
		return strings.HasPrefix(path, "/api/profile/api-key/") || strings.HasPrefix(path, "/api/profile/prompt-favorites/")
	}
}

func extractBearerToken(auth string) string {
	scheme, value, ok := strings.Cut(strings.TrimSpace(auth), " ")
	if !ok || strings.ToLower(scheme) != "bearer" {
		return ""
	}
	return strings.TrimSpace(value)
}

// setAuthSessionCookie writes the session cookie.
// rememberMe=true → persistent (~30 days); false → session cookie (browser close clears).
func setAuthSessionCookie(w http.ResponseWriter, r *http.Request, token string, rememberMe bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return
	}
	maxAge := 0 // session cookie
	if rememberMe {
		maxAge = 30 * 24 * 60 * 60
	}
	http.SetCookie(w, &http.Cookie{
		Name:     authSessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   isHTTPSRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearAuthSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     authSessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isHTTPSRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (a *App) resolveImageBaseURL(r *http.Request) string {
	requestOrigin := requestOriginFromRequest(r)
	if isLoopbackRequestHost(r) && requestOrigin != "" {
		return requestOrigin
	}
	if base := a.config.BaseURL(); base != "" {
		return base
	}
	return requestOrigin
}

func requestOriginFromRequest(r *http.Request) string {
	scheme := "http"
	if isHTTPSRequest(r) {
		scheme = "https"
	}
	host := r.Host
	if value := r.Header.Get("host"); value != "" {
		host = value
	}
	return scheme + "://" + host
}

func isHTTPSRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	if forwarded := strings.TrimSpace(r.Header.Get("x-forwarded-proto")); forwarded != "" {
		first := strings.ToLower(strings.TrimSpace(strings.Split(forwarded, ",")[0]))
		return first == "https"
	}
	return false
}

func isLoopbackRequestHost(r *http.Request) bool {
	host := r.Host
	if value := r.Header.Get("host"); value != "" {
		host = value
	}
	parsed, err := url.Parse("//" + strings.TrimSpace(host))
	if err != nil {
		return false
	}
	return isLoopbackHostname(parsed.Hostname())
}

func identityScope(identity service.Identity) string {
	if owner := util.Clean(identity.OwnerID); owner != "" {
		return owner
	}
	if id := util.Clean(identity.ID); id != "" {
		return id
	}
	return "anonymous"
}

func identityDisplayName(identity service.Identity) string {
	return firstNonEmpty(util.Clean(identity.Name), util.Clean(identity.CredentialName))
}
