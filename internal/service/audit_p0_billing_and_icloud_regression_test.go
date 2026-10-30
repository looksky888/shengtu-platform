package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestPartialImageRefundBlocksSubsequentFullOrReconcileRefund(t *testing.T) {
	runCase := func(t *testing.T, svc *CreditService) {
		t.Helper()
		const userID = "u-partial-once"
		const refID = "api/creation-tasks/image-generations:task-partial-15"
		if _, _, err := svc.Add(userID, 30, "seed", "seed-1"); err != nil {
			t.Fatalf("Add() error = %v", err)
		}
		if _, _, _, err := svc.DeductOnce(userID, 15, CreditReasonImageGeneration, refID); err != nil {
			t.Fatalf("DeductOnce() error = %v", err)
		}
		// Partial refund for 14/15 delivered -> 1 credit refunded (balance 15 -> 16).
		if _, _, awarded, err := svc.AddOnce(userID, 1, CreditReasonImageRefund, refID+":partial:14_of_15"); err != nil || !awarded {
			t.Fatalf("partial AddOnce() awarded=%v err=%v", awarded, err)
		}
		// Subsequent full reconcile (e.g. cancelled task misreporting 0 delivered) MUST NOT refund another 15!
		if awarded, err := svc.ReconcileCreationCharge(userID, CreditReasonImageGeneration, refID, 15, 0); err != nil || awarded {
			t.Fatalf("ReconcileCreationCharge after partial refund awarded=%v err=%v, want false/nil", awarded, err)
		}
		if awarded, err := svc.RefundChargeByRef(userID, CreditReasonImageGeneration, refID); err != nil || awarded {
			t.Fatalf("RefundChargeByRef after partial refund awarded=%v err=%v, want false/nil", awarded, err)
		}
		if _, _, awarded, err := svc.AddOnce(userID, 15, CreditReasonImageRefund, refID); err != nil || awarded {
			t.Fatalf("full AddOnce after partial refund awarded=%v err=%v, want false/nil", awarded, err)
		}
		account, err := svc.Account(userID)
		if err != nil {
			t.Fatalf("Account() error = %v", err)
		}
		if account.Balance != 16 {
			t.Fatalf("balance = %d, want 16 (no >100%% double refund)", account.Balance)
		}
	}

	t.Run("memory_backed", func(t *testing.T) {
		runCase(t, newTestCreditService(t))
	})

	t.Run("sqlite_ledger_table_backed", func(t *testing.T) {
		dir := t.TempDir()
		dbPath := filepath.Join(dir, "chatgpt2api.db")
		backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
		if err != nil {
			t.Fatalf("NewDatabaseBackend() error = %v", err)
		}
		defer backend.Close()
		svc := NewCreditService(filepath.Join(dir, "credits.json"), backend)
		runCase(t, svc)
	})
}

func TestCancelledMultiImageTaskPreservesDeliveredDataForReconciliation(t *testing.T) {
	dir := t.TempDir()
	started := make(chan struct{})
	allowExit := make(chan struct{})
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		close(started)
		<-ctx.Done()
		<-allowExit
		return map[string]any{
			"data": []map[string]any{{"url": "https://example.test/img-1.png"}},
		}, ctx.Err()
	}

	svc := NewImageTaskService(filepath.Join(dir, "image_tasks.json"), handler, nil, nil, func() int { return 30 })
	defer svc.Close(context.Background())

	user := Identity{ID: "u1", Role: AuthRoleUser, Name: "Alice"}
	if _, err := svc.SubmitGeneration(context.Background(), user, "task-cancel-partial", "draw", "grok-imagine-image", "1024x1024", "high", "https://base.test", 4, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	<-started

	if _, err := svc.CancelTask(user, "task-cancel-partial"); err != nil {
		t.Fatalf("CancelTask() error = %v", err)
	}
	// While workerActive is still true, FailedBillingCandidates must wait so it never misreads SuccessCount as 0.
	if got := svc.FailedBillingCandidates(); len(got) != 0 {
		t.Fatalf("FailedBillingCandidates() while worker still exiting = %#v, want empty", got)
	}

	close(allowExit)
	var candidates []CreationBillingCandidate
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		candidates = svc.FailedBillingCandidates()
		if len(candidates) == 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(candidates) != 1 || candidates[0].BilledCount != 4 || candidates[0].SuccessCount != 1 {
		t.Fatalf("FailedBillingCandidates() after worker exit = %#v, want BilledCount=4 SuccessCount=1", candidates)
	}
}

func TestResolveICloudMailboxCodeURLRewritesRelativeAndBlocksForeignHost(t *testing.T) {
	got, err := resolveICloudMailboxCodeURL(
		"http://icloud-privacy-mail:8787",
		"/api/icloud/public/v1/mailboxes/alice%40icloud.com/code?key=tok123",
		"alice@icloud.com",
		"tok123",
	)
	if err != nil {
		t.Fatalf("resolveICloudMailboxCodeURL(relative) error = %v", err)
	}
	want := "http://icloud-privacy-mail:8787/api/v1/mailboxes/alice@icloud.com/code?key=tok123"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}

	foreign, err := resolveICloudMailboxCodeURL(
		"http://icloud-privacy-mail:8787",
		"https://attacker.example/steal?key=tok999",
		"alice@icloud.com",
		"",
	)
	if err != nil {
		t.Fatalf("resolveICloudMailboxCodeURL(foreign) error = %v", err)
	}
	wantForeign := "http://icloud-privacy-mail:8787/api/v1/mailboxes/alice@icloud.com/code?key=tok999"
	if foreign != wantForeign {
		t.Fatalf("foreign rewrite = %q, want %q", foreign, wantForeign)
	}
}

func TestBackupCollectFilesIncludesSettingsEnv(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	mustWriteFile(t, filepath.Join(dataDir, "settings.env"), "OPENAI_API_KEY=secret\n")
	mustWriteFile(t, filepath.Join(dataDir, "accounts.json"), `[]`)

	svc := NewBackupService(root, dataDir)
	for _, include := range []string{"config", "data"} {
		files, err := svc.collectFiles(backupConfigFromMap(map[string]any{"include": []string{include}}))
		if err != nil {
			t.Fatalf("collectFiles(%s) error = %v", include, err)
		}
		found := false
		for _, f := range files {
			if filepath.ToSlash(f.Name) == "data/settings.env" {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("collectFiles(%s) did not include data/settings.env: %#v", include, files)
		}
	}
}
