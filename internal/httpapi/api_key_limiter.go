package httpapi

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type apiKeyLimitState struct {
	hits      []time.Time
	inFlight  int
	day       string
	dailyUsed int
}

type apiKeyLimiter struct {
	mu      sync.Mutex
	states  map[string]*apiKeyLimitState
	backend storage.APIKeyLimitBackend
	logger  *service.Logger
}

const apiKeyLimitLeaseSeconds = 2 * 60 * 60

func newAPIKeyLimiter(backend storage.Backend, logger *service.Logger) *apiKeyLimiter {
	limiter := &apiKeyLimiter{states: map[string]*apiKeyLimitState{}, logger: logger}
	if persistent, ok := backend.(storage.APIKeyLimitBackend); ok {
		limiter.backend = persistent
	}
	return limiter
}

func (l *apiKeyLimiter) acquire(identity service.Identity, rpm, concurrency, daily int, now time.Time) (func(), int, string) {
	if l == nil || identity.Kind != service.AuthKindAPIKey || identity.CredentialID == "" || identity.Role == service.AuthRoleAdmin {
		return func() {}, 0, ""
	}
	rpm, concurrency, daily = max(rpm, 0), max(concurrency, 0), max(daily, 0)
	key := strings.TrimSpace(identity.CredentialID)
	if l.backend != nil {
		day := now.In(util.ChinaLocation()).Format("2006-01-02")
		reservationID, _, reason, err := l.backend.ReserveAPIKeyLimit(key, now.UTC().Format(time.RFC3339Nano), day, rpm, concurrency, daily, apiKeyLimitLeaseSeconds)
		if err != nil {
			return nil, http.StatusServiceUnavailable, "API Key 限流存储暂不可用，请稍后重试"
		}
		if reason != "" {
			message := map[string]string{"rpm": "API Key 请求频率已达上限，请稍后重试", "concurrency": "API Key 并发额度已用尽，请稍后重试", "daily": "API Key 今日消费额度已用尽"}[reason]
			if message == "" {
				message = "API Key 限流额度已用尽，请稍后重试"
			}
			return nil, http.StatusTooManyRequests, message
		}
		return func() {
			if err := l.backend.ReleaseAPIKeyLimit(reservationID); err != nil && l.logger != nil {
				l.logger.Warning("release API key concurrency reservation failed", "error", err.Error())
			}
		}, 0, ""
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	state := l.states[key]
	if state == nil {
		state = &apiKeyLimitState{}
		l.states[key] = state
	}
	cutoff := now.Add(-time.Minute)
	kept := state.hits[:0]
	for _, hit := range state.hits {
		if hit.After(cutoff) {
			kept = append(kept, hit)
		}
	}
	state.hits = kept
	day := now.In(util.ChinaLocation()).Format("2006-01-02")
	if state.day != day {
		state.day, state.dailyUsed = day, 0
	}
	if rpm > 0 && len(state.hits) >= rpm {
		return nil, http.StatusTooManyRequests, "API Key 请求频率已达上限，请稍后重试"
	}
	if concurrency > 0 && state.inFlight >= concurrency {
		return nil, http.StatusTooManyRequests, "API Key 并发额度已用尽，请稍后重试"
	}
	if daily > 0 && state.dailyUsed >= daily {
		return nil, http.StatusTooManyRequests, "API Key 今日消费额度已用尽"
	}
	state.hits = append(state.hits, now)
	state.inFlight++
	state.dailyUsed++
	return func() { l.release(key) }, 0, ""
}

// apiKeyLimitConfig is intentionally kept at the HTTP boundary. The limiter
// controls transport usage; credit accounting remains owned by CreditService.
type apiKeyLimitConfig struct {
	RPM         int
	Concurrency int
	Daily       int
}

func (l *apiKeyLimiter) release(key string) {
	if l == nil || key == "" {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if state := l.states[key]; state != nil && state.inFlight > 0 {
		state.inFlight--
	}
}

func isProtocolPath(path string) bool { return path == "/v1" || strings.HasPrefix(path, "/v1/") }
