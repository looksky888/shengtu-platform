package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestReserveNextCandidatePrefersLeastLoaded(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{
		"email": "user@example.com",
		"id":    "user-1",
	}, []map[string]any{{"feature_name": "image_gen", "remaining": 10}})
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }

	// High concurrency so both tokens can take multiple slots; selection should still spread.
	accounts.config = staticAccountConfig{invalid: true, rateLimited: false, concurrency: 2}
	accounts.AddAccounts([]string{"token-a", "token-b"})
	_, _ = accounts.UpdateAccount("token-a", map[string]any{"status": "正常", "quota": 10})
	_, _ = accounts.UpdateAccount("token-b", map[string]any{"status": "正常", "quota": 10})
	first, err := accounts.reserveNextCandidateToken(nil, nil)
	if err != nil {
		t.Fatalf("first reserve: %v", err)
	}
	second, err := accounts.reserveNextCandidateToken(nil, nil)
	if err != nil {
		t.Fatalf("second reserve: %v", err)
	}
	if first.token == second.token {
		t.Fatalf("expected second reservation to pick free account, got both %q", first.token)
	}
	accounts.releaseImageReservation(first.token)
	accounts.releaseImageReservation(second.token)
}

func TestGetAvailableAccessTokenDeletesInvalidAndSwitches(t *testing.T) {
	accounts := newTestAccountService(t)
	var mu sync.Mutex
	calls := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		mu.Lock()
		calls[auth]++
		mu.Unlock()
		if auth == "Bearer bad-token" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"detail":"authentication token has been invalidated"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/backend-api/me" {
			_, _ = w.Write([]byte(`{"email":"ok@example.com","id":"ok-1","plan_type":"plus"}`))
			return
		}
		_, _ = w.Write([]byte(`{"limit_progress":[{"feature_name":"image_gen","remaining":3}]}`))
	}))
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	// Auto-remove off: explicit dead token still cleaned (refresh-confirm + hard-delete policy).
	accounts.config = staticAccountConfig{invalid: false, rateLimited: false, concurrency: 1}
	accounts.InitQuarantinePath(t.TempDir())
	accounts.AddAccounts([]string{"bad-token", "good-token"})
	_, _ = accounts.UpdateAccount("bad-token", map[string]any{"status": "正常", "quota": 3})
	_, _ = accounts.UpdateAccount("good-token", map[string]any{"status": "正常", "quota": 3})
	token, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("GetAvailableAccessToken: %v", err)
	}
	if token != "good-token" {
		t.Fatalf("token = %q, want good-token", token)
	}
	if accounts.GetAccount("bad-token") != nil {
		t.Fatalf("explicit dead bad-token should leave pool even when auto-remove off")
	}
	accounts.MarkImageResult(token, false)
}

func TestGetAvailableAccessTokenReusesRecentSuccessfulPreflight(t *testing.T) {
	accounts := newTestAccountService(t)
	var mu sync.Mutex
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests++
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/backend-api/me":
			_, _ = w.Write([]byte(`{"email":"cached@example.com","id":"cached-1","plan_type":"plus"}`))
		case "/backend-api/conversation/init":
			_, _ = w.Write([]byte(`{"limits_progress":[{"feature_name":"image_gen","remaining":3}]}`))
		default:
			_, _ = w.Write([]byte(`{}`))
		}
	}))
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	accounts.AddAccounts([]string{"cached-token"})
	_, _ = accounts.UpdateAccount("cached-token", map[string]any{"status": "正常", "quota": 3, "type": "Plus"})

	token, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	accounts.MarkImageResult(token, true)
	mu.Lock()
	firstRequests := requests
	mu.Unlock()
	if firstRequests == 0 {
		t.Fatal("first acquire did not perform preflight")
	}

	token, err = accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	accounts.MarkImageResult(token, true)
	mu.Lock()
	secondRequests := requests
	mu.Unlock()
	if secondRequests != firstRequests {
		t.Fatalf("recent preflight made extra remote requests: first=%d second=%d", firstRequests, secondRequests)
	}
}

type staticAccountConfig struct {
	invalid     bool
	rateLimited bool
	concurrency int
	timeoutSec  int
}

func (c staticAccountConfig) AutoRemoveInvalidAccounts() bool     { return c.invalid }
func (c staticAccountConfig) AutoRemoveRateLimitedAccounts() bool { return c.rateLimited }
func (c staticAccountConfig) ImageAccountConcurrency() int {
	if c.concurrency < 1 {
		return 1
	}
	return c.concurrency
}
func (c staticAccountConfig) ImageTaskTimeoutSeconds() int {
	if c.timeoutSec > 0 {
		return c.timeoutSec
	}
	return 300
}
