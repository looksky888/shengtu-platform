package service

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

// 3.18: dispose fallbacks used to swallow the UpdateAccount error and still record a
// successful cooldown, so metrics/events claimed the account was out of scheduling
// while it kept its old (schedulable) status.
func TestDisposeTemporaryNotReportedCooledWhenStatusSaveFails(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"persist-temp"})
	if _, err := accounts.UpdateAccount("persist-temp", map[string]any{"status": "正常", "quota": 3}); err != nil {
		t.Fatal(err)
	}
	backend.failDelete = true // cabin copy cannot leave the pool → cooldown fallback
	backend.failUpsert = true // ... and the 限流 write fails as well

	action := accounts.disposeAccount("persist-temp", "image_stream", "rate_limit exceeded", DisposalTemporary)
	if action != DisposePersistFailed {
		t.Fatalf("action=%q want persist_failed", action)
	}
	if got := poolOpCount(accounts, string(DisposeCooledTemporary)); got != 0 {
		t.Fatalf("cooled_temporary=%d, must not claim a cooldown that was never persisted", got)
	}
	if got := poolOpCount(accounts, string(DisposePersistFailed)); got != 1 {
		t.Fatalf("persist_failed=%d want 1", got)
	}
	account := accounts.GetAccount("persist-temp")
	if account == nil || util.Clean(account["status"]) != "正常" {
		t.Fatalf("failed status write must leave the row unchanged: %#v", account)
	}
}

// 3.18: same swallow in hardDeleteOrMarkInvalid's mark-异常 branch.
func TestMarkInvalidFailureIsNotReportedAsDisposed(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.config = staticAccountConfig{invalid: false, concurrency: 1}
	accounts.AddAccounts([]string{"persist-invalid"})
	if _, err := accounts.UpdateAccount("persist-invalid", map[string]any{"status": "正常", "quota": 3}); err != nil {
		t.Fatal(err)
	}
	backend.failUpsert = true

	action := accounts.disposeAccount("persist-invalid", "image_stream", "account permanently disabled by policy", DisposalPermanent)
	if action != DisposePersistFailed {
		t.Fatalf("action=%q want persist_failed", action)
	}
	if got := poolOpCount(accounts, string(DisposeMarkedInvalid)); got != 0 {
		t.Fatalf("marked_invalid=%d, must not claim a mark that was not persisted", got)
	}
	if got := poolOpCount(accounts, string(DisposePersistFailed)); got != 1 {
		t.Fatalf("persist_failed=%d want 1", got)
	}
	if accounts.GetAccount("persist-invalid") == nil {
		t.Fatal("row must stay in the pool")
	}
}

// 3.18: force-delete fallback must report the pool-removal failure, not a cabin write
// failure (the cabin write succeeded).
func TestHardDeleteFallbackDoesNotClaimCabinWriteFailure(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.config = staticAccountConfig{invalid: true, concurrency: 1}
	accounts.AddAccounts([]string{"persist-perm"})
	if _, err := accounts.UpdateAccount("persist-perm", map[string]any{"status": "正常", "quota": 3}); err != nil {
		t.Fatal(err)
	}
	backend.failDelete = true
	backend.failUpsert = true

	action := accounts.disposeAccount("persist-perm", "image_stream", "account permanently disabled by policy", DisposalPermanent)
	if action != DisposePersistFailed {
		t.Fatalf("action=%q want persist_failed", action)
	}
	if got := poolOpCount(accounts, string(DisposeQuarantineWriteFail)); got != 0 {
		t.Fatalf("quarantine_write_failed=%d, the cabin write succeeded", got)
	}
	if got := poolOpCount(accounts, PoolOpQuarantineRemovePending); got != 1 {
		t.Fatalf("quarantine_remove_pending=%d want 1", got)
	}
	if got := poolOpCount(accounts, string(DisposePersistFailed)); got != 1 {
		t.Fatalf("persist_failed=%d want 1", got)
	}
}

// 3.19: NewAccountService accepts a nil config (tests / embedders); every config read
// must tolerate it instead of panicking.
func TestNilConfigTogglesOffInsteadOfPanicking(t *testing.T) {
	dir := t.TempDir()
	accounts := NewAccountService(
		storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json")),
		nil, nil, NewLogService(dir),
	)
	accounts.AddAccounts([]string{"nil-config"})

	if accounts.shouldHardDeletePermanent() {
		t.Fatal("nil config must mean auto-remove-invalid off")
	}
	if accounts.RemoveInvalidToken("nil-config", "test") {
		t.Fatal("nil config must mean auto-remove-invalid off")
	}
	if _, err := accounts.UpdateAccount("nil-config", map[string]any{"status": "限流", "quota": 0}); err != nil {
		t.Fatalf("UpdateAccount with nil config: %v", err)
	}
	if accounts.GetAccount("nil-config") == nil {
		t.Fatal("限流 row must stay in the pool when config is nil")
	}
}
