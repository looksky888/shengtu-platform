package httpapi

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/util"
)

const (
	loginRateWindow           = 15 * time.Minute
	loginRateMaxHits          = 12
	registerRateMax           = 8
	passwordResetEmailRateMax = 8
	passwordResetRateMax      = 12
	authRateKeySep            = "|"
)

// authRateLimiter is a simple in-process sliding window for login/register abuse control.
type authRateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var globalAuthRateLimiter = &authRateLimiter{hits: map[string][]time.Time{}}

func (l *authRateLimiter) allow(key string, max int, window time.Duration) bool {
	if key == "" || max <= 0 {
		return true
	}
	now := util.NowChina()
	cutoff := now.Add(-window)
	l.mu.Lock()
	defer l.mu.Unlock()
	list := l.hits[key]
	kept := list[:0]
	for _, t := range list {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= max {
		l.hits[key] = kept
		return false
	}
	kept = append(kept, now)
	l.hits[key] = kept
	// Opportunistic prune of idle keys when map grows large.
	if len(l.hits) > 10000 {
		for k, times := range l.hits {
			if len(times) == 0 || !times[len(times)-1].After(cutoff) {
				delete(l.hits, k)
			}
		}
	}
	return true
}

// authClientIP resolves the client IP for login rate limits, public registration
// quota (Reserve/Bind), and audit log ip_address fields.
//
// Default (safe): TCP peer only (RemoteAddr). Clients can forge X-Forwarded-For /
// X-Real-IP / CF-Connecting-IP on a direct connection, so those headers are ignored
// unless CHATGPT2API_TRUST_PROXY_HEADERS=1|true|yes|on.
//
// When enabled, the process must sit behind a trusted reverse proxy that strips or
// overwrites client-supplied forwarded headers (nginx real_ip, Cloudflare, etc.).
// Prefer CF-Connecting-IP, then left-most valid X-Forwarded-For hop, then X-Real-IP.
func authClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	if trustProxyHeadersEnabled() {
		if cf := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); net.ParseIP(cf) != nil {
			return cf
		}
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[0]); net.ParseIP(ip) != nil {
				return ip
			}
		}
		if xr := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(xr) != nil {
			return xr
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func trustProxyHeadersEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("CHATGPT2API_TRUST_PROXY_HEADERS")))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func allowLoginAttempt(r *http.Request, username string) bool {
	ip := authClientIP(r)
	user := strings.ToLower(strings.TrimSpace(username))
	// Per IP and per IP+user windows.
	if !globalAuthRateLimiter.allow("login-ip"+authRateKeySep+ip, loginRateMaxHits, loginRateWindow) {
		return false
	}
	if user != "" && !globalAuthRateLimiter.allow("login-user"+authRateKeySep+ip+authRateKeySep+user, loginRateMaxHits, loginRateWindow) {
		return false
	}
	return true
}

func allowRegisterAttempt(r *http.Request) bool {
	ip := authClientIP(r)
	return globalAuthRateLimiter.allow("register-ip"+authRateKeySep+ip, registerRateMax, loginRateWindow)
}

func allowPasswordResetEmailAttempt(r *http.Request) bool {
	ip := authClientIP(r)
	return globalAuthRateLimiter.allow("password-reset-email-ip"+authRateKeySep+ip, passwordResetEmailRateMax, loginRateWindow)
}

func allowPasswordResetAttempt(r *http.Request) bool {
	ip := authClientIP(r)
	return globalAuthRateLimiter.allow("password-reset-ip"+authRateKeySep+ip, passwordResetRateMax, loginRateWindow)
}

// resetAuthRateLimiterForTest clears login/register windows so -count=N suite runs stay isolated.
func resetAuthRateLimiterForTest() {
	globalAuthRateLimiter.mu.Lock()
	globalAuthRateLimiter.hits = map[string][]time.Time{}
	globalAuthRateLimiter.mu.Unlock()
}
