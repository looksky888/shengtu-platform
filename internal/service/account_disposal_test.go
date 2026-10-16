package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDisposeTemporaryMovesToQuarantine(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.AddAccounts([]string{"token-rate"})
	_, _ = accounts.UpdateAccount("token-rate", map[string]any{"status": "正常", "quota": 3})
	action := accounts.disposeAccount("token-rate", "image_stream", "rate_limit exceeded", DisposalTemporary)
	if action != DisposeQuarantinedTemporary {
		t.Fatalf("action = %q, want quarantined_temporary", action)
	}
	if accounts.GetAccount("token-rate") != nil {
		t.Fatal("rate-limited token should leave active pool")
	}
	list := accounts.ListQuarantine()
	if len(list) != 1 {
		t.Fatalf("quarantine len = %d, want 1: %#v", len(list), list)
	}
	if list[0]["grade"] != string(DisposalTemporary) {
		t.Fatalf("grade = %#v", list[0]["grade"])
	}
}

func TestMarkImageResultQuotaExhaustedQuarantines(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.AddAccounts([]string{"token-last"})
	_, _ = accounts.UpdateAccount("token-last", map[string]any{"status": "正常", "quota": 1, "image_quota_unknown": false})
	// Simulate in-flight reservation release path via MarkImageResult success.
	accounts.mu.Lock()
	accounts.ensureImageReservationsLocked()
	accounts.imageReservations["token-last"] = 1
	accounts.mu.Unlock()

	got := accounts.MarkImageResult("token-last", true)
	if got != nil {
		t.Fatalf("MarkImageResult after last quota should quarantine (return nil), got %#v", got)
	}
	if accounts.GetAccount("token-last") != nil {
		t.Fatal("exhausted token should leave active pool")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("quarantine = %#v", accounts.ListQuarantine())
	}
}

func TestClassifyAccountFailureGrades(t *testing.T) {
	cases := []struct {
		event, msg string
		want       DisposalGrade
	}{
		{"image_acquire", "authentication token has been invalidated", DisposalPermanent},
		{"image_acquire", `/backend-api/me failed: HTTP 401, body={ "error": { "code": "token_expired" } }`, DisposalPermanent},
		{"image_acquire", "Provided authentication token is expired. Please try signing in again.", DisposalPermanent},
		{"image_acquire", "/backend-api/me failed: HTTP 401, unauthorized", DisposalPermanent},
		{"image_stream", "rate_limit exceeded", DisposalTemporary},
		{"image_stream", "cloudflare challenge", DisposalTemporary},
		{"image_stream", "connection reset by peer", DisposalUnknown},
		{"image_stream", `Get "https://chatgpt.com/": context deadline exceeded`, DisposalUnknown},
		{"image_stream", "HTTP 503 upstream", DisposalUnknown},
	}
	for _, tc := range cases {
		got := ClassifyAccountFailure(tc.event, tc.msg)
		if got != tc.want {
			t.Fatalf("ClassifyAccountFailure(%q,%q)=%q want %q", tc.event, tc.msg, got, tc.want)
		}
	}
}

func TestDisposePermanentTokenExpiredCleansWithoutAutoRemove(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	// Auto-remove off: explicit dead token should still be cleaned after failed refresh probe.
	accounts.config = staticAccountConfig{invalid: false, concurrency: 1}
	accounts.AddAccounts([]string{"token-expired"})
	_, _ = accounts.UpdateAccount("token-expired", map[string]any{"status": "正常", "quota": 3})
	// Force quick probe failure (no real ChatGPT).
	accounts.remoteBaseURL = "http://127.0.0.1:1"
	accounts.browserHTTPClient = func(profile string, timeout time.Duration) *http.Client {
		return &http.Client{Timeout: 100 * time.Millisecond}
	}

	reason := `/backend-api/me failed: HTTP 401, body={ "error": { "message": "Provided authentication token is expired.", "code": "token_expired" } }`
	action := accounts.disposeAccount("token-expired", "image_acquire", reason, DisposalPermanent)
	if action != DisposeDeletedPermanent {
		t.Fatalf("action = %q, want deleted_permanent", action)
	}
	if accounts.GetAccount("token-expired") != nil {
		t.Fatal("expired token should be removed from active pool")
	}
	list := accounts.ListQuarantine()
	if len(list) != 1 || list[0]["grade"] != string(DisposalPermanent) {
		t.Fatalf("quarantine = %#v", list)
	}
}

func TestDisposeUnknownTimeoutDoesNotQuarantine(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.config = staticAccountConfig{invalid: true, concurrency: 1}
	accounts.AddAccounts([]string{"token-timeout"})
	_, _ = accounts.UpdateAccount("token-timeout", map[string]any{"status": "正常", "quota": 5})

	for i := 0; i < 5; i++ {
		action := accounts.disposeAccount("token-timeout", "image_stream", `Get "https://chatgpt.com/": context deadline exceeded`, DisposalUnknown)
		if action != DisposeSoftFailUnknown {
			t.Fatalf("action[%d]=%q, want soft_fail_unknown", i, action)
		}
	}
	if accounts.GetAccount("token-timeout") == nil {
		t.Fatal("timeout account should stay in active pool (cooldown only)")
	}
	if len(accounts.ListQuarantine()) != 0 {
		t.Fatalf("timeout must not enter quarantine: %#v", accounts.ListQuarantine())
	}
}

func TestAutoRestoreOnlyTemporaryGrade(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.AddAccounts([]string{"token-temp"})
	_, _ = accounts.UpdateAccount("token-temp", map[string]any{"status": "正常", "quota": 2, "email": "t@t.com"})
	if action := accounts.disposeAccount("token-temp", "test", "rate_limit", DisposalTemporary); action != DisposeQuarantinedTemporary {
		t.Fatalf("action=%q want quarantined_temporary", action)
	}
	if accounts.GetAccount("token-temp") != nil {
		t.Fatal("should be out of pool")
	}

	// Mock ChatGPT endpoints so FetchRemoteInfo succeeds and account is image-available.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "t@t.com", "id": "user-temp"})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress": []map[string]any{{
					"feature_name": "image_gen",
					"remaining":    5,
					"reset_after":  "2099-01-01T00:00:00Z",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	accounts.remoteBaseURL = srv.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return srv.Client() }

	accounts.tryRestoreTemporaryQuarantine(context.Background())
	if accounts.GetAccount("token-temp") == nil {
		t.Fatal("temporary quarantine should auto-restore when probe succeeds")
	}
	// Unknown grade (legacy rows written via quarantineThenRemove) must not auto-restore.
	accounts.AddAccounts([]string{"token-net"})
	_, _ = accounts.UpdateAccount("token-net", map[string]any{"status": "正常", "quota": 2})
	if err := accounts.quarantineThenRemove("token-net", "test", "deadline exceeded", DisposalUnknown); err != nil {
		t.Fatal(err)
	}
	accounts.tryRestoreTemporaryQuarantine(context.Background())
	if accounts.GetAccount("token-net") != nil {
		t.Fatal("unknown grade must not auto-restore")
	}
	// Permanent must not be auto-restored.
	accounts.AddAccounts([]string{"token-perm"})
	_, _ = accounts.UpdateAccount("token-perm", map[string]any{"status": "正常", "quota": 1})
	if err := accounts.quarantineThenRemove("token-perm", "test", "token_expired", DisposalPermanent); err != nil {
		t.Fatal(err)
	}
	accounts.tryRestoreTemporaryQuarantine(context.Background())
	if accounts.GetAccount("token-perm") != nil {
		t.Fatal("permanent grade must not auto-restore")
	}
}

func TestBuildDisposeMetricsRatios(t *testing.T) {
	m := buildDisposeMetrics("2026-07-25", map[string]int{
		string(DisposeDeletedPermanent):     2,
		string(DisposeRefreshRecovered):     2,
		string(DisposeMarkedInvalid):        0,
		string(DisposeQuarantineWriteFail):  1,
		string(DisposeQuarantinedTemporary): 4,
		PoolOpAutoRestoredTemporary:         1,
	})
	if m.TotalActions != 10 {
		t.Fatalf("total=%d want 10", m.TotalActions)
	}
	// recover among permanent path: 2 / (2+2+0) = 0.5
	if m.RecoverShare < 0.49 || m.RecoverShare > 0.51 {
		t.Fatalf("recover_share=%v want ~0.5", m.RecoverShare)
	}
	// quarantine fail: 1 / (1+2) ≈ 0.333
	if m.QuarantineFailShare < 0.32 || m.QuarantineFailShare > 0.34 {
		t.Fatalf("quarantine_fail_share=%v", m.QuarantineFailShare)
	}
	if m.DeletedPermanent != 2 || m.QuarantinedTemporary != 4 {
		t.Fatalf("counts %#v", m)
	}
}

func TestPoolHealthIncludesDisposeMetrics(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.AddAccounts([]string{"tok-disp"})
	_, _ = accounts.UpdateAccount("tok-disp", map[string]any{"status": "正常", "quota": 1})
	_ = accounts.disposeAccount("tok-disp", "test", "rate_limit", DisposalTemporary)
	health := accounts.PoolHealth()
	dispose, _ := health["dispose"].(map[string]any)
	if dispose == nil {
		t.Fatalf("missing dispose: %#v", health)
	}
	qt := 0
	switch v := dispose["quarantined_temporary"].(type) {
	case int:
		qt = v
	case float64:
		qt = int(v)
	}
	if qt < 1 {
		t.Fatalf("quarantined_temporary missing: %#v", dispose)
	}
	typed := accounts.PoolHealthTyped()
	if typed.Dispose.QuarantinedTemporary < 1 {
		t.Fatalf("typed dispose = %#v", typed.Dispose)
	}
}

func TestApplyAccountErrorRefreshRecoveredIsNotBanMessage(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.config = staticAccountConfig{invalid: true, concurrency: 1}
	accounts.AddAccounts([]string{"token-ok"})
	_, _ = accounts.UpdateAccount("token-ok", map[string]any{"status": "正常", "quota": 1})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "ok@t.com", "id": "user-ok"})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress": []map[string]any{{
					"feature_name": "image_gen",
					"remaining":    3,
					"reset_after":  "2099-01-01T00:00:00Z",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	accounts.remoteBaseURL = srv.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return srv.Client() }

	msg, handled := accounts.ApplyAccountErrorMessage("token-ok", "image_acquire",
		"Provided authentication token is expired. Please try signing in again.")
	if handled {
		t.Fatalf("refresh_recovered must not be handled as ban (handled=%v msg=%q)", handled, msg)
	}
	if msg == "检测到封号" {
		t.Fatalf("refresh_recovered must not surface ban message: %q", msg)
	}
	if accounts.GetAccount("token-ok") == nil {
		t.Fatal("recovered token should remain in pool")
	}
}

func TestDisposePermanentRecoversWhenRefreshSucceeds(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.config = staticAccountConfig{invalid: true, concurrency: 1}
	accounts.AddAccounts([]string{"token-ok"})
	_, _ = accounts.UpdateAccount("token-ok", map[string]any{"status": "正常", "quota": 1})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "ok@t.com", "id": "user-ok"})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress": []map[string]any{{
					"feature_name": "image_gen",
					"remaining":    3,
					"reset_after":  "2099-01-01T00:00:00Z",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	accounts.remoteBaseURL = srv.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return srv.Client() }

	action := accounts.disposeAccount("token-ok", "image_acquire",
		"Provided authentication token is expired. Please try signing in again.", DisposalPermanent)
	if action != DisposeRefreshRecovered {
		t.Fatalf("action = %q, want refresh_recovered", action)
	}
	if accounts.GetAccount("token-ok") == nil {
		t.Fatal("recovered token should remain in pool")
	}
	if len(accounts.ListQuarantine()) != 0 {
		t.Fatalf("should not quarantine recovered token: %#v", accounts.ListQuarantine())
	}
}

func TestLeaseReclaimReleasesStaleLocks(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.AddAccounts([]string{"token-stale"})
	_, _ = accounts.UpdateAccount("token-stale", map[string]any{"status": "正常", "quota": 5})
	accounts.mu.Lock()
	accounts.ensureImageReservationsLocked()
	accounts.imageReservations["token-stale"] = 1
	if accounts.imageLeases == nil {
		accounts.imageLeases = map[string]time.Time{}
	}
	// expire in the past
	accounts.imageLeases["token-stale"] = accounts.imageLeases["token-stale"].Add(-time.Hour)
	// force past
	accounts.imageLeases["token-stale"] = time.Now().Add(-time.Minute)
	n := accounts.reclaimExpiredLeasesLocked(time.Now())
	accounts.mu.Unlock()
	if n != 1 {
		t.Fatalf("reclaimed = %d, want 1", n)
	}
	if accounts.LockedAccountCount() != 0 {
		t.Fatalf("locked still %d", accounts.LockedAccountCount())
	}
}
