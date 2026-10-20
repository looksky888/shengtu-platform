package service

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"chatgpt2api/internal/util"
)

// 3.16: a failed pool removal used to be reported as a successful quarantine while the
// account stayed in the pool and kept being scheduled.
func TestQuarantineThenRemoveReportsPoolRemovalFailure(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"stuck-token"})
	backend.failDelete = true

	err := accounts.quarantineThenRemove("stuck-token", "test", "rate_limit", DisposalTemporary)
	if err == nil {
		t.Fatal("quarantineThenRemove reported success while the pool copy survived")
	}
	if accounts.GetAccount("stuck-token") == nil {
		t.Fatal("account should still be in the pool (the delete failed)")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("cabin should keep the token: %#v", accounts.ListQuarantine())
	}
	if got := poolOpCount(accounts, PoolOpQuarantineRemovePending); got != 1 {
		t.Fatalf("quarantine_remove_pending=%d want 1", got)
	}
}

// 3.16: the temporary grade must degrade the row instead of claiming 已隔离.
func TestDisposeTemporaryDegradesWhenQuarantineRemoveFails(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"stuck-temp"})
	if _, err := accounts.UpdateAccount("stuck-temp", map[string]any{"status": "正常", "quota": 3}); err != nil {
		t.Fatal(err)
	}
	backend.failDelete = true

	action := accounts.disposeAccount("stuck-temp", "image_stream", "rate_limit exceeded", DisposalTemporary)
	if action == DisposeQuarantinedTemporary {
		t.Fatal("must not claim quarantined_temporary while the account is still schedulable")
	}
	if action != DisposeCooledTemporary {
		t.Fatalf("action=%q want cooled_temporary", action)
	}
	account := accounts.GetAccount("stuck-temp")
	if account == nil || util.Clean(account["status"]) != "限流" {
		t.Fatalf("degraded account=%#v want status 限流", account)
	}
}

// 3.16: reconcile used to run only at startup, so a dual-presence row was scheduled
// until the next process restart.
func TestLimitedWatcherCycleReconcilesDualPresenceAtRuntime(t *testing.T) {
	accounts, backend, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"dual-runtime"})
	if _, err := accounts.UpdateAccount("dual-runtime", map[string]any{"status": "正常", "quota": 2}); err != nil {
		t.Fatal(err)
	}
	// Crash window: cabin row written, pool copy still present.
	if err := accounts.appendQuarantine(accounts.quarantinePath, quarantineEntry{
		AccessToken: "dual-runtime",
		TokenHash:   shortTokenHash("dual-runtime"),
		Grade:       string(DisposalPermanent),
		Source:      "crash-sim",
	}); err != nil {
		t.Fatal(err)
	}
	backend.failDelete = true
	accounts.runLimitedWatcherCycle(context.Background())
	if accounts.GetAccount("dual-runtime") == nil || len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("failed reconcile must keep both copies: pool=%#v cabin=%#v", accounts.GetAccount("dual-runtime"), accounts.ListQuarantine())
	}
	backend.failDelete = false
	accounts.runLimitedWatcherCycle(context.Background())
	if accounts.GetAccount("dual-runtime") != nil {
		t.Fatal("watcher cycle must drop the dual-presence pool copy once storage recovers")
	}
	if len(accounts.ListQuarantine()) != 1 {
		t.Fatalf("cabin must stay authoritative: %#v", accounts.ListQuarantine())
	}
}

// 3.17: the cabin row must only be dropped after the pool import is durable. Before the
// fix the row was deleted first, so a crash / failed rollback lost the token.
func TestRestoreQuarantineRollsBackPoolImportWhenCabinRowDeleteFails(t *testing.T) {
	accounts, _, dir := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"restore-write-fail"})
	if err := accounts.quarantineThenRemove("restore-write-fail", "test", "temporary", DisposalTemporary); err != nil {
		t.Fatal(err)
	}
	entry := accounts.temporaryQuarantineForProbe()[0]

	// Cabin cache is warm, but the row delete cannot be written: parent is a file.
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	accounts.quarantinePath = filepath.Join(blocker, quarantineFileName)

	result := accounts.RestoreQuarantine(entry.TokenHash)
	if util.ToBool(result["restored"]) || util.Clean(result["error"]) == "" {
		t.Fatalf("restore result = %#v", result)
	}
	if accounts.GetAccount("restore-write-fail") != nil {
		t.Fatal("pool import must be rolled back when the cabin row cannot be removed")
	}
	raw, readErr := os.ReadFile(filepath.Join(dir, quarantineFileName))
	if readErr != nil || !strings.Contains(string(raw), "restore-write-fail") {
		t.Fatalf("cabin row must survive a failed row delete: err=%v raw=%s", readErr, raw)
	}
}

// 3.17: two concurrent restores of one token must import it exactly once.
func TestRestoreQuarantineImportsOnceUnderConcurrentCalls(t *testing.T) {
	accounts, _, _ := newQuarantineFailureService(t)
	accounts.AddAccounts([]string{"race-token"})
	if err := accounts.quarantineThenRemove("race-token", "test", "temporary", DisposalTemporary); err != nil {
		t.Fatal(err)
	}
	entry := accounts.temporaryQuarantineForProbe()[0]

	results := make([]map[string]any, 2)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = accounts.RestoreQuarantine(entry.TokenHash)
		}(i)
	}
	wg.Wait()
	restored := 0
	for _, result := range results {
		if util.ToBool(result["restored"]) {
			restored++
		}
	}
	if restored != 1 {
		t.Fatalf("results=%#v, want exactly one successful restore", results)
	}
	if items := accounts.ListAccounts(); len(items) != 1 {
		t.Fatalf("pool=%#v, want a single import", items)
	}
	if cabin := accounts.ListQuarantine(); len(cabin) != 0 {
		t.Fatalf("cabin=%#v, want the row removed once", cabin)
	}
}

func poolOpCount(accounts *AccountService, kind string) int {
	accounts.mu.Lock()
	defer accounts.mu.Unlock()
	return accounts.poolOpCounts[kind]
}
