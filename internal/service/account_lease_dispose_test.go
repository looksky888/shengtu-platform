package service

import (
	"context"
	"net/http"
	"testing"
	"time"
)

type timeoutAccountConfig struct {
	staticAccountConfig
	timeoutSec int
}

func (c timeoutAccountConfig) ImageTaskTimeoutSeconds() int {
	if c.timeoutSec <= 0 {
		return 300
	}
	return c.timeoutSec
}

func TestImageLeaseTTLCoversTaskTimeout(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.config = timeoutAccountConfig{
		staticAccountConfig: staticAccountConfig{invalid: true, concurrency: 1},
		timeoutSec:          3600,
	}
	accounts.mu.Lock()
	ttl := accounts.imageLeaseTTLLocked()
	accounts.mu.Unlock()
	// 3600s + 5m buffer
	wantMin := 3600*time.Second + 5*time.Minute
	if ttl < wantMin {
		t.Fatalf("lease TTL = %v, want >= %v", ttl, wantMin)
	}
	if ttl > maxImageLeaseTTL {
		t.Fatalf("lease TTL = %v exceeds max %v", ttl, maxImageLeaseTTL)
	}
}

func TestActiveLeaseNotReclaimedBeforeExpiry(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.config = timeoutAccountConfig{
		staticAccountConfig: staticAccountConfig{invalid: true, concurrency: 1},
		timeoutSec:          3600,
	}
	accounts.AddAccounts([]string{"token-long"})
	_, _ = accounts.UpdateAccount("token-long", map[string]any{"status": "正常", "quota": 5})
	res, err := accounts.reserveNextCandidateToken(nil, nil)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	// Simulate 20 minutes into a long job — old 15m lease would have expired.
	accounts.mu.Lock()
	// Force lease into the future (as set by reserve using full TTL).
	until := accounts.imageLeases[res.token]
	if until.Before(time.Now().Add(50 * time.Minute)) {
		t.Fatalf("lease too short after reserve: until=%v", until)
	}
	// Jump clock conceptually: reclaim with "now" still before until must keep lock.
	n := accounts.reclaimExpiredLeasesLocked(time.Now().Add(20 * time.Minute))
	if n != 0 {
		t.Fatalf("reclaimed %d slots mid-flight, want 0", n)
	}
	if accounts.imageReservations[res.token] != 1 {
		t.Fatalf("reservation lost mid-flight: %d", accounts.imageReservations[res.token])
	}
	accounts.mu.Unlock()

	// Second reserve must not grab same token while still locked.
	if _, err := accounts.reserveNextCandidateToken(nil, nil); err == nil {
		t.Fatal("expected no free account while first still locked")
	}
	accounts.releaseImageReservation(res.token)
}

func TestDisposePermanentRespectsAutoRemoveToggle(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	// Non-explicit permanent (generic 401 acquire-class reason text used as permanent grade only):
	// auto-remove off → mark 异常; on → hard delete.
	accounts.config = staticAccountConfig{invalid: false, concurrency: 1}
	accounts.AddAccounts([]string{"token-a"})
	_, _ = accounts.UpdateAccount("token-a", map[string]any{"status": "正常", "quota": 3})
	action := accounts.disposeAccount("token-a", "image_stream", "account permanently disabled by policy", DisposalPermanent)
	if action != DisposeMarkedInvalid {
		t.Fatalf("action = %q, want marked_invalid", action)
	}
	found := false
	for _, item := range accounts.ListAccounts() {
		if item["access_token"] == "token-a" {
			found = true
			if item["status"] != "异常" {
				t.Fatalf("status = %#v, want 异常", item["status"])
			}
		}
	}
	if !found {
		t.Fatal("token-a removed despite AutoRemoveInvalidAccounts=false")
	}

	// Auto-remove on → hard delete + quarantine for non-explicit permanent.
	accounts.config = staticAccountConfig{invalid: true, concurrency: 1}
	accounts.AddAccounts([]string{"token-b"})
	_, _ = accounts.UpdateAccount("token-b", map[string]any{"status": "正常", "quota": 3})
	action = accounts.disposeAccount("token-b", "image_stream", "account permanently disabled by policy", DisposalPermanent)
	if action != DisposeDeletedPermanent {
		t.Fatalf("action = %q, want deleted_permanent", action)
	}
	for _, item := range accounts.ListAccounts() {
		if item["access_token"] == "token-b" {
			t.Fatal("token-b still present after auto-remove permanent dispose")
		}
	}

	// Explicit dead token: always cleanup after failed refresh (toggle off).
	accounts.config = staticAccountConfig{invalid: false, concurrency: 1}
	accounts.AddAccounts([]string{"token-dead"})
	_, _ = accounts.UpdateAccount("token-dead", map[string]any{"status": "正常", "quota": 3})
	accounts.remoteBaseURL = "http://127.0.0.1:1"
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client {
		return &http.Client{Timeout: 100 * time.Millisecond}
	}
	action = accounts.disposeAccount("token-dead", "image_acquire", "authentication token has been invalidated", DisposalPermanent)
	if action != DisposeDeletedPermanent {
		t.Fatalf("explicit dead action = %q, want deleted_permanent", action)
	}
	if accounts.GetAccount("token-dead") != nil {
		t.Fatal("explicit dead token should be removed even when auto-remove is off")
	}
}

func TestApplyAccountErrorUsesUnifiedDispose(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.InitQuarantinePath(t.TempDir())
	accounts.config = staticAccountConfig{invalid: true, concurrency: 1}
	accounts.AddAccounts([]string{"token-x"})
	_, _ = accounts.UpdateAccount("token-x", map[string]any{"status": "正常", "quota": 3})
	msg, handled := accounts.ApplyAccountErrorMessage("token-x", "image_stream", "rate_limit exceeded")
	if !handled || msg != "检测到上游速率限制" {
		t.Fatalf("rate limit handled=%v msg=%q", handled, msg)
	}
	// Temporary (rate-limit) leaves the active pool into isolation cabin.
	if accounts.GetAccount("token-x") != nil {
		t.Fatal("rate-limited account should leave pool into quarantine")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("quarantine = %#v, want 1 temporary entry", accounts.ListQuarantine())
	}

	accounts.AddAccounts([]string{"token-x"})
	_, _ = accounts.UpdateAccount("token-x", map[string]any{"status": "正常", "quota": 3})
	msg, handled = accounts.ApplyAccountErrorMessage("token-x", "image_stream", "authentication token has been invalidated")
	if !handled || msg != "检测到封号" {
		t.Fatalf("invalid handled=%v msg=%q", handled, msg)
	}
	if accounts.GetAccount("token-x") != nil {
		t.Fatal("token-x should be removed via unified dispose")
	}
}

func TestApplyAccountErrorPreservesFailureSignal(t *testing.T) {
	cases := []struct {
		name string
		msg  string
		want string
	}{
		{name: "timeout", msg: "context deadline exceeded", want: "上游响应超时"},
		{name: "cloudflare", msg: "Cloudflare challenge cf-ray=abc", want: "检测到上游挑战拦截"},
		{name: "gateway", msg: "bad gateway status=502", want: "上游网关异常"},
		{name: "network", msg: "connection reset by peer", want: "上游网络波动"},
		{name: "quota", msg: "You've reached the image generation limit", want: "账号生图额度已用尽"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			accounts := newTestAccountService(t)
			accounts.InitQuarantinePath(t.TempDir())
			accounts.AddAccounts([]string{"token-signal"})
			_, _ = accounts.UpdateAccount("token-signal", map[string]any{"status": "正常", "quota": 3})
			got, handled := accounts.ApplyAccountErrorMessage("token-signal", "image_stream", tc.msg)
			if !handled || got != tc.want {
				t.Fatalf("handled=%v message=%q want=%q", handled, got, tc.want)
			}
		})
	}
}

func TestAppendTaskEventSkipsTerminalTasks(t *testing.T) {
	dir := t.TempDir()
	svc := NewImageTaskService(dir+"/tasks.json",
		func(ctx context.Context, _ Identity, _ map[string]any) (map[string]any, error) {
			<-ctx.Done()
			return nil, ctx.Err()
		},
		func(context.Context, Identity, map[string]any) (map[string]any, error) { return nil, nil },
		func(context.Context, Identity, map[string]any) (map[string]any, error) { return nil, nil },
		func() int { return 7 },
	)
	defer svc.Close(context.Background())
	identity := Identity{ID: "u1", Name: "User", Role: AuthRoleAdmin}
	task, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "hi", "gpt-image-1", "1024x1024", "auto", "", 1, nil)
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	id := utilClean(task["id"])
	// Cancel → terminal
	if _, err := svc.CancelTask(identity, id); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	key := taskKey("u1", id)
	svc.appendTaskEvent(key, "ghost", "should not stick", nil)

	svc.mu.Lock()
	stored := svc.tasks[key]
	// After cancel there may be no events slice mutation; ensure progress_message not overwritten to ghost
	if utilClean(stored.ProgressMessage) == "should not stick" {
		t.Fatalf("terminal task mutated: %#v", stored)
	}
	for _, ev := range stored.Events {
		if utilClean(ev["stage"]) == "ghost" {
			t.Fatalf("ghost event written on terminal task: %#v", stored.Events)
		}
	}
	if utilClean(stored.Status) != TaskStatusCancelled {
		t.Fatalf("status = %#v", stored.Status)
	}
	svc.mu.Unlock()
}
