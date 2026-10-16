package httpapi

import (
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
)

// ensureDeviceID reads a signed device cookie or issues a new one.
// Cookies signed with a previous secret (rotation window) are re-signed with the
// current secret so the bare device id — and registration quota — stay continuous.
// Returns bare device id (empty if quota service missing).
func (a *App) ensureDeviceID(w http.ResponseWriter, r *http.Request) string {
	if a == nil || a.regQuota == nil {
		return ""
	}
	if raw, err := r.Cookie(service.DeviceCookieName()); err == nil && raw != nil {
		if id, ok, current := a.regQuota.VerifyDeviceTokenDetailed(raw.Value); ok {
			if !current {
				a.writeDeviceCookie(w, r, id)
			}
			return id
		}
	}
	// Optional body field on register (also must be signed token if present).
	id := service.IssueDeviceID()
	a.writeDeviceCookie(w, r, id)
	return id
}

func (a *App) readDeviceID(r *http.Request, bodyDevice string) string {
	if a == nil || a.regQuota == nil {
		return ""
	}
	if raw, err := r.Cookie(service.DeviceCookieName()); err == nil && raw != nil {
		if id, ok := a.regQuota.VerifyDeviceToken(raw.Value); ok {
			return id
		}
	}
	if id, ok := a.regQuota.VerifyDeviceToken(strings.TrimSpace(bodyDevice)); ok {
		return id
	}
	return ""
}

// refreshDeviceCookieIfStale re-signs the device cookie when it verified under a
// previous secret (or body token) so subsequent requests use the current key.
func (a *App) refreshDeviceCookieIfStale(w http.ResponseWriter, r *http.Request, deviceID string) {
	if a == nil || a.regQuota == nil || strings.TrimSpace(deviceID) == "" {
		return
	}
	if raw, err := r.Cookie(service.DeviceCookieName()); err == nil && raw != nil {
		if a.regQuota.DeviceTokenNeedsRefresh(raw.Value) {
			a.writeDeviceCookie(w, r, deviceID)
			return
		}
		// Already current.
		if id, ok, current := a.regQuota.VerifyDeviceTokenDetailed(raw.Value); ok && current && id == deviceID {
			return
		}
	}
	// Cookie missing/invalid but we have a verified id (e.g. body token) — bind cookie.
	a.writeDeviceCookie(w, r, deviceID)
}

func (a *App) writeDeviceCookie(w http.ResponseWriter, r *http.Request, deviceID string) {
	if a == nil || a.regQuota == nil || w == nil {
		return
	}
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		return
	}
	token := a.regQuota.SignDeviceID(deviceID)
	if token == "" {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     service.DeviceCookieName(),
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   cookieSecure(r),
		// 400 days — long-lived device binding
		MaxAge:  int((400 * 24 * time.Hour).Seconds()),
		Expires: time.Now().Add(400 * 24 * time.Hour),
	})
}

func cookieSecure(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	// Behind TLS-terminating proxy
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}
