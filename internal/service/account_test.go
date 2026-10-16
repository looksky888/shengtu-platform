package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

type testAccountConfig struct{}

func (testAccountConfig) AutoRemoveInvalidAccounts() bool     { return false }
func (testAccountConfig) AutoRemoveRateLimitedAccounts() bool { return false }
func (testAccountConfig) Proxy() string                       { return "" }

type testAccountConfigWithImageConcurrency struct {
	testAccountConfig
	concurrency int
}

func (c testAccountConfigWithImageConcurrency) ImageAccountConcurrency() int { return c.concurrency }

func TestFetchRemoteInfoBootstrapsBeforeAccountRefresh(t *testing.T) {
	var mu sync.Mutex
	var paths []string
	bootstrapped := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths = append(paths, r.URL.Path)
		mu.Unlock()

		switch r.URL.Path {
		case "/":
			if auth := r.Header.Get("Authorization"); auth != "" {
				t.Errorf("bootstrap request leaked authorization header %q", auth)
			}
			bootstrapped = true
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			if !bootstrapped {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			if got := r.Header.Get("Authorization"); got != "Bearer token-1" {
				t.Errorf("Authorization = %q, want bearer token", got)
			}
			writeJSON(t, w, map[string]any{"email": "user@example.com", "id": "user-1"})
		case "/backend-api/conversation/init":
			if !bootstrapped {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress": []map[string]any{{
					"feature_name": "image_gen",
					"remaining":    7,
					"reset_after":  "2026-05-01T00:00:00Z",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	accounts := newTestAccountService(t)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})

	info, err := accounts.FetchRemoteInfo(context.Background(), "token-1")
	if err != nil {
		t.Fatalf("FetchRemoteInfo() error = %v", err)
	}
	if info["email"] != "user@example.com" || info["quota"] != 7 {
		t.Fatalf("FetchRemoteInfo() = %#v", info)
	}
	mu.Lock()
	gotPaths := append([]string(nil), paths...)
	mu.Unlock()
	wantPaths := []string{"/", "/backend-api/me", "/backend-api/conversation/init"}
	if !reflect.DeepEqual(gotPaths, wantPaths) {
		t.Fatalf("request paths = %#v, want %#v", gotPaths, wantPaths)
	}
}

func TestFetchRemoteInfoSummarizesForbiddenChallenge(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`<html><script>window._cf_chl_opt={}</script>Enable JavaScript and cookies to continue</html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	accounts := newTestAccountService(t)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})

	_, err := accounts.FetchRemoteInfo(context.Background(), "token-1")
	if err == nil {
		t.Fatal("FetchRemoteInfo() error = nil")
	}
	if got := err.Error(); !strings.Contains(got, "/backend-api/me failed: HTTP 403") || !strings.Contains(got, "upstream returned Cloudflare challenge page") {
		t.Fatalf("FetchRemoteInfo() error = %q", got)
	}
}

func TestFetchRemoteInfoRefreshesClearanceForAPIChallenge(t *testing.T) {
	InvalidateUpstreamClearance()
	t.Cleanup(InvalidateUpstreamClearance)
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", "10")

	var flareCalls, meCalls int
	flare := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flareCalls++
		writeJSON(t, w, map[string]any{
			"status": "ok",
			"solution": map[string]any{
				"userAgent": "TestUA/1.0",
				"cookies":   []map[string]any{{"name": "cf_clearance", "value": "fresh", "domain": ".chatgpt.com", "path": "/"}},
			},
		})
	}))
	defer flare.Close()
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", flare.URL)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			meCalls++
			if !strings.Contains(r.Header.Get("Cookie"), "cf_clearance=fresh") {
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`<html><script>window._cf_chl_opt={}</script>Enable JavaScript and cookies to continue</html>`))
				return
			}
			writeJSON(t, w, map[string]any{"email": "user@example.com", "id": "user-1"})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress":    []map[string]any{{"feature_name": "image_gen", "remaining": 7}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	accounts := newTestAccountService(t)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})

	info, err := accounts.FetchRemoteInfo(context.Background(), "token-1")
	if err != nil {
		t.Fatalf("FetchRemoteInfo() error = %v", err)
	}
	if info["email"] != "user@example.com" || meCalls != 2 || flareCalls != 1 {
		t.Fatalf("info=%#v me_calls=%d flare_calls=%d", info, meCalls, flareCalls)
	}
}

func TestRefreshAccountsReturnsEmptyErrorsArray(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "user@example.com", "id": "user-1"})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress": []map[string]any{{
					"feature_name": "image_gen",
					"remaining":    7,
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	accounts := newTestAccountService(t)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})

	result := accounts.RefreshAccounts(context.Background(), []string{"token-1"})
	if result["refreshed"] != 1 {
		t.Fatalf("refreshed = %#v, want 1", result["refreshed"])
	}
	errors, ok := result["errors"].([]map[string]string)
	if !ok {
		t.Fatalf("errors type = %T, want []map[string]string", result["errors"])
	}
	if errors == nil || len(errors) != 0 {
		t.Fatalf("errors = %#v, want empty non-nil slice", errors)
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	var payload struct {
		Errors json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if string(payload.Errors) != "[]" {
		t.Fatalf("encoded errors = %s, want []", payload.Errors)
	}
}

func TestRefreshAccountStateMarksUnauthorizedInitAsInvalid(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "user@example.com", "id": "user-1"})
		case "/backend-api/conversation/init":
			w.WriteHeader(http.StatusUnauthorized)
			writeJSON(t, w, map[string]any{"detail": "token_invalidated"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	// Auto-remove off: explicit token_invalidated still hard-deletes after failed recover probe.
	accounts.config = staticAccountConfig{invalid: false, concurrency: 1}
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 5})
	account := accounts.RefreshAccountState(context.Background(), "token-1")
	// Dead-token permanent path removes the row; GetAccount is nil after dispose.
	if account != nil {
		t.Fatalf("RefreshAccountState() = %#v, want nil after explicit dead-token cleanup", account)
	}
	if accounts.GetAccount("token-1") != nil {
		t.Fatal("token-1 should be removed from active pool")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("quarantine = %#v, want 1 permanent entry", accounts.ListQuarantine())
	}
}

func TestRefreshAccountsMarksRateLimitedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "user@example.com", "id": "user-1"})
		case "/backend-api/conversation/init":
			w.WriteHeader(http.StatusTooManyRequests)
			writeJSON(t, w, map[string]any{"error": map[string]any{"message": "You've reached the image generation limit"}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	accounts := newTestAccountService(t)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 5})
	result := accounts.RefreshAccounts(context.Background(), []string{"token-1"})
	if result["refreshed"] != 0 {
		t.Fatalf("refreshed = %#v, want 0", result["refreshed"])
	}
	errors, ok := result["errors"].([]map[string]string)
	if !ok || len(errors) != 1 {
		t.Fatalf("errors = %#v, want one error", result["errors"])
	}
	if errors[0]["error"] != "检测到上游速率限制" {
		t.Fatalf("error = %q, want upstream rate-limit message", errors[0]["error"])
	}
	// Rate-limited accounts move into isolation cabin (no longer in active pool).
	if accounts.GetAccount("token-1") != nil {
		t.Fatal("rate-limited account should leave active pool")
	}
}
