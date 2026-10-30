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
	loginRateWindow               = 15 * time.Minute
	loginRateMaxHits              = 12
	loginAccountRateMaxHits       = 20
	registerRateMax               = 8
	registrationEmailRateMax      = 12
	registrationEmailCooldown     = time.Minute
	passwordResetEmailRateMax     = 8
	passwordResetRateMax          = 12
	authRateKeySep                = "|"
)

// authRateLimiter is a simple in-process sliding window for login/register abuse control.
type authRateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var globalAuthRateLimiter = &authRateLimiter{hits: map[string][]time.Time{}}

func (l *authRateLimiter) canProceed(key string, max int, window time.Duration) bool {
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
	l.hits[key] = kept
	return len(kept) < max
}

func (l *authRateLimiter) recordHit(key string, window time.Duration) {
	if key == "" {
		return
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
	kept = append(kept, now)
	l.hits[key] = kept
	if len(l.hits) > 10000 {
		for k, times := range l.hits {
			if len(times) == 0 || !times[len(times)-1].After(cutoff) {
				delete(l.hits, k)
			}
		}
	}
}

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

func (l *authRateLimiter) allowCooldown(key string, cooldown time.Duration) (time.Duration, bool) {
	if key == "" || cooldown <= 0 {
		return 0, true
	}
	now := util.NowChina()
	cutoff := now.Add(-cooldown)
	l.mu.Lock()
	defer l.mu.Unlock()
	list := l.hits[key]
	for i := len(list) - 1; i >= 0; i-- {
		if list[i].After(cutoff) {
			return cooldown - now.Sub(list[i]), false
		}
	}
	l.hits[key] = []time.Time{now}
	return 0, true
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
		if trustCFHeaderEnabled() {
			if cf := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); net.ParseIP(cf) != nil {
				return cf
			}
		}
		if xr := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(xr) != nil {
			return xr
		}
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			if ip := trustedXForwardedForClientIP(xff); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func trustedXForwardedForClientIP(xff string) string {
	parts := strings.Split(xff, ",")
	lastValid := ""
	for i := len(parts) - 1; i >= 0; i-- {
		candidate := strings.TrimSpace(parts[i])
		parsed := net.ParseIP(candidate)
		if parsed == nil {
			continue
		}
		if lastValid == "" {
			lastValid = candidate
		}
		if !parsed.IsLoopback() && !parsed.IsPrivate() && !parsed.IsLinkLocalUnicast() {
			return candidate
		}
	}
	return lastValid
}

func trustProxyHeadersEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("CHATGPT2API_TRUST_PROXY_HEADERS")))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func trustCFHeaderEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("CHATGPT2API_TRUST_CF_HEADER")))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func checkLoginAllowed(r *http.Request, username string) bool {
	ip := authClientIP(r)
	user := strings.ToLower(strings.TrimSpace(username))
	if !globalAuthRateLimiter.canProceed("login-ip"+authRateKeySep+ip, loginRateMaxHits, loginRateWindow) {
		return false
	}
	if user != "" && !globalAuthRateLimiter.canProceed("login-user"+authRateKeySep+ip+authRateKeySep+user, loginRateMaxHits, loginRateWindow) {
		return false
	}
	if user != "" && !globalAuthRateLimiter.canProceed("login-account"+authRateKeySep+user, loginAccountRateMaxHits, loginRateWindow) {
		return false
	}
	return true
}

func recordLoginFailure(r *http.Request, username string) {
	ip := authClientIP(r)
	user := strings.ToLower(strings.TrimSpace(username))
	globalAuthRateLimiter.recordHit("login-ip"+authRateKeySep+ip, loginRateWindow)
	if user != "" {
		globalAuthRateLimiter.recordHit("login-user"+authRateKeySep+ip+authRateKeySep+user, loginRateWindow)
		globalAuthRateLimiter.recordHit("login-account"+authRateKeySep+user, loginRateWindow)
	}
}

func allowRegisterAttempt(r *http.Request) bool {
	ip := authClientIP(r)
	return globalAuthRateLimiter.allow("register-ip"+authRateKeySep+ip, registerRateMax, loginRateWindow)
}

func allowRegistrationEmailAttempt(r *http.Request) bool {
	ip := authClientIP(r)
	return globalAuthRateLimiter.allow("register-email-ip"+authRateKeySep+ip, registrationEmailRateMax, loginRateWindow)
}

func allowExistingEmailRegistrationCooldown(email string) (time.Duration, bool) {
	normalized := strings.ToLower(strings.TrimSpace(email))
	if normalized == "" {
		return 0, true
	}
	return globalAuthRateLimiter.allowCooldown("register-email-existing"+authRateKeySep+normalized, registrationEmailCooldown)
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
