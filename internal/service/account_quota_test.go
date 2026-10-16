package service

import (
	"chatgpt2api/internal/storage"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestGetAvailableAccessTokenReservesKnownImageQuota(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{
		"email": "user@example.com",
		"id":    "user-1",
	}, []map[string]any{{
		"feature_name": "image_gen",
		"remaining":    1,
	}})
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 1})
	token, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("first GetAvailableAccessToken() error = %v", err)
	}
	if token != "token-1" {
		t.Fatalf("first token = %q, want token-1", token)
	}

	if token, err := accounts.GetAvailableAccessToken(context.Background()); err == nil {
		t.Fatalf("second GetAvailableAccessToken() = %q, want slot busy error", token)
	}

	accounts.MarkImageResult("token-1", false)
	token, err = accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("GetAvailableAccessToken() after failed result error = %v", err)
	}
	if token != "token-1" {
		t.Fatalf("token after failed result = %q, want token-1", token)
	}

	accounts.MarkImageResult("token-1", true)
	if token, err := accounts.GetAvailableAccessToken(context.Background()); err == nil {
		t.Fatalf("GetAvailableAccessToken() after quota consumed = %q, want slot busy error", token)
	}
}

func TestGetAvailableAccessTokenForExcludingDoesNotReuseFailedAccount(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{"email": "pool@example.com", "id": "user-1"}, []map[string]any{{
		"feature_name": "image_gen",
		"remaining":    5,
	}})
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	accounts.AddAccounts([]string{"token-1", "token-2"})
	for _, token := range []string{"token-1", "token-2"} {
		_, _ = accounts.UpdateAccount(token, map[string]any{"status": "正常", "quota": 5})
	}

	first, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("first account: %v", err)
	}
	accounts.MarkImageResult(first, false)
	second, err := accounts.GetAvailableAccessTokenForExcluding(context.Background(), nil, map[string]struct{}{first: {}})
	if err != nil {
		t.Fatalf("second account: %v", err)
	}
	defer accounts.MarkImageResult(second, false)
	if second == first {
		t.Fatalf("second token reused failed account %q", first)
	}
}

func TestGetAvailableAccessTokenPreservesCloudflareProbeFailure(t *testing.T) {
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "false")
	accounts := newTestAccountService(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=UTF-8")
		w.Header().Set("cf-mitigated", "challenge")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("<html><title>Just a moment...</title><body>challenge-platform</body></html>"))
	}))
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	accounts.AddAccounts([]string{"token-1", "token-2"})
	for _, token := range []string{"token-1", "token-2"} {
		_, _ = accounts.UpdateAccount(token, map[string]any{"status": "正常", "quota": 5})
	}

	_, err := accounts.GetAvailableAccessToken(context.Background())
	if err == nil {
		t.Fatal("GetAvailableAccessToken() error = nil, want Cloudflare probe failure")
	}
	message := strings.ToLower(err.Error())
	if !strings.Contains(message, "cloudflare challenge") {
		t.Fatalf("GetAvailableAccessToken() error = %q, want preserved Cloudflare challenge", err)
	}
	if strings.Contains(message, "账号槽位") {
		t.Fatalf("GetAvailableAccessToken() error = %q, must not report slot exhaustion", err)
	}
	friendly := classifyImageTaskError(err)
	if friendly.Code != "upstream_cloudflare_challenge" {
		t.Fatalf("ClassifyImageTaskError() code = %q, want upstream_cloudflare_challenge", friendly.Code)
	}
}

func TestReleaseImageReservationDoesNotCountTextResponseAsAccountFailure(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{"email": "text@example.com", "id": "user-1"}, []map[string]any{{
		"feature_name": "image_gen",
		"remaining":    5,
	}})
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 5})

	token, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("reserve account: %v", err)
	}
	accounts.ReleaseImageReservation(token)

	account := AccountPublicFromMap(accounts.GetAccount(token))
	if account.Fail != 0 || account.Success != 0 || account.Quota != 5 {
		t.Fatalf("released account mutated result counters: %#v", account)
	}
	reused, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("reserve account after release: %v", err)
	}
	accounts.MarkImageResult(reused, false)
}

func TestGetAvailableAccessTokenLimitsUnknownImageQuotaToOneInFlight(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{
		"email":     "plus@example.com",
		"id":        "user-1",
		"plan_type": "plus",
	}, nil)
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 0, "image_quota_unknown": true, "type": "Plus"})
	token, err := accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("first GetAvailableAccessToken() error = %v", err)
	}
	if token != "token-1" {
		t.Fatalf("first token = %q, want token-1", token)
	}

	if token, err := accounts.GetAvailableAccessToken(context.Background()); err == nil {
		t.Fatalf("second GetAvailableAccessToken() = %q, want slot busy error", token)
	}

	accounts.MarkImageResult("token-1", false)
	token, err = accounts.GetAvailableAccessToken(context.Background())
	if err != nil {
		t.Fatalf("GetAvailableAccessToken() after release error = %v", err)
	}
	if token != "token-1" {
		t.Fatalf("token after release = %q, want token-1", token)
	}
	accounts.MarkImageResult("token-1", false)
}

func TestReserveNextCandidateTokenRespectsConfiguredImageAccountConcurrency(t *testing.T) {
	dir := t.TempDir()
	accounts := NewAccountService(
		storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json")),
		testAccountConfigWithImageConcurrency{concurrency: 2},
		NewProxyService(testAccountConfig{}),
		NewLogService(dir),
	)
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 5, "type": "Plus"})
	if _, err := accounts.reserveNextCandidateToken(map[string]struct{}{}, nil); err != nil {
		t.Fatalf("first reserveNextCandidateToken() error = %v", err)
	}
	if _, err := accounts.reserveNextCandidateToken(map[string]struct{}{}, nil); err != nil {
		t.Fatalf("second reserveNextCandidateToken() error = %v", err)
	}
	if reservation, err := accounts.reserveNextCandidateToken(map[string]struct{}{}, nil); err == nil {
		t.Fatalf("third reserveNextCandidateToken() = %#v, want no available slot", reservation)
	}

	accounts.MarkImageResult("token-1", false)
	if _, err := accounts.reserveNextCandidateToken(map[string]struct{}{}, nil); err != nil {
		t.Fatalf("reserveNextCandidateToken() after release error = %v", err)
	}
}

func TestRefreshAccountStatePreservesExistingPaidTypeWhenRemotePlanUndetected(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{
		"email": "plus@example.com",
		"id":    "user-1",
	}, []map[string]any{{
		"feature_name": "image_gen",
		"remaining":    7,
	}})
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"type": "Plus", "quota": 1})
	account := accounts.RefreshAccountState(context.Background(), "token-1")
	if account == nil {
		t.Fatal("RefreshAccountState() = nil, want refreshed account")
	}
	if account["type"] != "Plus" {
		t.Fatalf("type = %#v, want Plus", account["type"])
	}
	if account["quota"] != 7 {
		t.Fatalf("quota = %#v, want 7", account["quota"])
	}
}

func TestRefreshAccountStateKeepsUndetectedFreeAccountsUnavailableOnUnknownQuota(t *testing.T) {
	accounts := newTestAccountService(t)
	server := newAccountQuotaServer(t, map[string]any{
		"email": "free@example.com",
		"id":    "user-1",
	}, nil)
	defer server.Close()
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return server.Client()
	}
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"type": "Free", "quota": 1})
	account := accounts.RefreshAccountState(context.Background(), "token-1")
	if account == nil {
		t.Fatal("RefreshAccountState() = nil, want refreshed account")
	}
	if account["type"] != "Free" {
		t.Fatalf("type = %#v, want Free", account["type"])
	}
	if account["image_quota_unknown"] != true {
		t.Fatalf("image_quota_unknown = %#v, want true", account["image_quota_unknown"])
	}
	if IsImageAccountAvailable(account) {
		t.Fatalf("IsImageAccountAvailable(%#v) = true, want false", account)
	}
}

func TestReserveNextCandidateTokenCanFilterPaidAccounts(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.AddAccounts([]string{"free-token", "plus-token"})
	_, _ = accounts.UpdateAccount("free-token", map[string]any{"status": "正常", "quota": 5, "type": "Free"})
	_, _ = accounts.UpdateAccount("plus-token", map[string]any{"status": "正常", "quota": 5, "type": "Plus"})
	reservation, err := accounts.reserveNextCandidateToken(map[string]struct{}{}, IsPaidImageAccount)
	if err != nil {
		t.Fatalf("reserveNextCandidateToken() error = %v", err)
	}
	if reservation.token != "plus-token" {
		t.Fatalf("reserved token = %q, want plus-token", reservation.token)
	}
	accounts.releaseImageReservation(reservation.token)

	_, err = accounts.reserveNextCandidateToken(map[string]struct{}{"plus-token": struct{}{}}, IsPaidImageAccount)
	if err == nil {
		t.Fatal("reserveNextCandidateToken() error = nil, want no available paid token")
	}
}

func TestApplyAccountErrorMessageDetectsImageStreamFailures(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	// Fast-fail refresh probe for explicit dead tokens.
	accounts.remoteBaseURL = "http://127.0.0.1:1"
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return &http.Client{Timeout: 100 * time.Millisecond}
	}
	accounts.AddAccounts([]string{"token-invalid", "token-limited"})
	_, _ = accounts.UpdateAccount("token-invalid", map[string]any{"status": "正常", "quota": 5})
	_, _ = accounts.UpdateAccount("token-limited", map[string]any{"status": "正常", "quota": 5, "image_quota_unknown": true})
	message, handled := accounts.ApplyAccountErrorMessage("token-invalid", "image_stream", "auth_chat_requirements failed: status=401, body={\"detail\":\"token_invalidated\"}")
	if !handled || message != "检测到封号" {
		t.Fatalf("invalid handled = %v message = %q, want 检测到封号", handled, message)
	}
	// Explicit dead token: refresh probe fails → hard-delete + quarantine (not just mark 异常).
	if accounts.GetAccount("token-invalid") != nil {
		t.Fatal("explicit dead token should leave active pool after cleanup")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("quarantine = %#v, want 1 permanent entry", accounts.ListQuarantine())
	}

	accounts.AddAccounts([]string{"token-transient-401"})
	_, _ = accounts.UpdateAccount("token-transient-401", map[string]any{"status": "\u6b63\u5e38", "quota": 5})
	message, handled = accounts.ApplyAccountErrorMessage("token-transient-401", "image_stream", "conversation failed: status=401, path=/backend-api/conversation")
	if handled {
		t.Fatalf("transient image stream 401 handled = true message = %q, want ignored", message)
	}
	if account := accounts.GetAccount("token-transient-401"); account["status"] != "\u6b63\u5e38" || account["quota"] != 5 {
		t.Fatalf("transient image stream account = %#v, want unchanged normal account", account)
	}

	message, handled = accounts.ApplyAccountErrorMessage("token-limited", "image_stream", "You've reached the image generation limit for now.")
	if !handled || message != "账号生图额度已用尽" {
		t.Fatalf("limited handled = %v message = %q, want account quota message", handled, message)
	}
	if accounts.GetAccount("token-limited") != nil {
		t.Fatal("rate-limited account should leave active pool into quarantine")
	}
}

func TestApplyAccountErrorMessageIgnoresBootstrapFailures(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.AddAccounts([]string{"token-1"})
	_, _ = accounts.UpdateAccount("token-1", map[string]any{"status": "正常", "quota": 5})
	message, handled := accounts.ApplyAccountErrorMessage("token-1", "refresh_accounts", "bootstrap failed: HTTP 429, body=too many requests")
	if handled {
		t.Fatalf("handled = true message = %q, want ignored bootstrap failure", message)
	}
	account := accounts.GetAccount("token-1")
	if account["status"] != "正常" || account["quota"] != 5 {
		t.Fatalf("account = %#v, want unchanged normal account", account)
	}
}

func newTestAccountService(t *testing.T) *AccountService {
	t.Helper()
	dir := t.TempDir()
	return NewAccountService(
		storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json")),
		testAccountConfig{},
		NewProxyService(testAccountConfig{}),
		NewLogService(dir),
	)
}

func newAccountQuotaServer(t *testing.T, mePayload map[string]any, limits []map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, mePayload)
		case "/backend-api/conversation/init":
			payload := map[string]any{"default_model_slug": "gpt-5"}
			if limits != nil {
				payload["limits_progress"] = limits
			}
			writeJSON(t, w, payload)
		default:
			http.NotFound(w, r)
		}
	}))
}

func writeJSON(t *testing.T, w http.ResponseWriter, payload any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatalf("write json: %v", err)
	}
}
