package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBillingRefForTask(t *testing.T) {
	_, reason, ref := BillingRefForTask(&ImageTask{ID: "t1", Mode: "generate"})
	if reason != CreditReasonImageGeneration || ref != "api/creation-tasks/image-generations:t1" {
		t.Fatalf("generate ref = %q reason=%q", ref, reason)
	}
	_, reason, ref = BillingRefForTask(&ImageTask{ID: "t2", Mode: "edit"})
	if reason != CreditReasonImageEdit || ref != "api/creation-tasks/image-edits:t2" {
		t.Fatalf("edit ref = %q reason=%q", ref, reason)
	}
	_, reason, ref = BillingRefForTask(&ImageTask{ID: "t3", Mode: "chat"})
	if reason != "" || ref != "" {
		t.Fatalf("chat should not bill: reason=%q ref=%q", reason, ref)
	}
	_, reason, ref = BillingRefForTask(&ImageTask{ID: "t4", Mode: "video"})
	if reason != CreditReasonVideoGeneration || ref != "api/creation-tasks/video-generations:t4" {
		t.Fatalf("video ref = %q reason=%q", ref, reason)
	}
}

func TestRefundVideoChargeByRefUsesVideoRefundReason(t *testing.T) {
	svc := newTestCreditService(t)
	if _, _, err := svc.Add("u1", 20, "seed", "video-seed"); err != nil {
		t.Fatal(err)
	}
	refID := "api/creation-tasks/video-generations:v1"
	if _, _, _, err := svc.DeductOnce("u1", 6, CreditReasonVideoGeneration, refID); err != nil {
		t.Fatal(err)
	}
	if ok, err := svc.RefundChargeByRef("u1", CreditReasonVideoGeneration, refID); err != nil || !ok {
		t.Fatalf("video refund ok=%v err=%v", ok, err)
	}
	if !svc.HasLedgerEntry("u1", CreditReasonVideoRefund, refID) {
		t.Fatal("video refund ledger entry missing")
	}
}

func TestRecoverUnfinishedDrainsInterrupted(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "image_tasks.json")
	// Seed a running task as if the process crashed mid-flight.
	doc := map[string]any{
		"tasks": []map[string]any{
			{
				"id":         "crash-1",
				"owner_id":   "user-1",
				"status":     TaskStatusRunning,
				"mode":       "generate",
				"count":      1,
				"created_at": "2026-07-15 10:00:00",
				"updated_at": "2026-07-15 10:00:01",
				"progress":   50,
			},
			{
				"id":         "done-1",
				"owner_id":   "user-1",
				"status":     TaskStatusSuccess,
				"mode":       "generate",
				"count":      1,
				"created_at": "2026-07-15 09:00:00",
				"updated_at": "2026-07-15 09:01:00",
				"progress":   100,
			},
		},
	}
	raw, _ := json.Marshal(doc)
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	svc := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })
	interrupted := svc.DrainRecoveredInterrupted()
	if len(interrupted) != 1 || interrupted[0].ID != "crash-1" {
		t.Fatalf("interrupted = %#v", interrupted)
	}
	if interrupted[0].Status != TaskStatusError {
		t.Fatalf("status = %q, want error", interrupted[0].Status)
	}
	// Second drain is empty.
	if again := svc.DrainRecoveredInterrupted(); len(again) != 0 {
		t.Fatalf("second drain = %#v", again)
	}
}

func TestRefundChargeByRefAfterDeduct(t *testing.T) {
	svc := newTestCreditService(t)
	if _, _, err := svc.Add("u1", 20, "seed", "s"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, _, _, err := svc.DeductOnce("u1", 3, CreditReasonImageGeneration, "api/creation-tasks/image-generations:t1"); err != nil {
		t.Fatalf("DeductOnce: %v", err)
	}
	ok, err := svc.RefundChargeByRef("u1", CreditReasonImageGeneration, "api/creation-tasks/image-generations:t1")
	if err != nil || !ok {
		t.Fatalf("RefundChargeByRef = %v err=%v", ok, err)
	}
	account, _ := svc.Account("u1")
	if account.Balance != 20 {
		t.Fatalf("balance = %d, want 20 after refund", account.Balance)
	}
	// Second refund is no-op.
	ok, err = svc.RefundChargeByRef("u1", CreditReasonImageGeneration, "api/creation-tasks/image-generations:t1")
	if err != nil || ok {
		t.Fatalf("second refund ok=%v err=%v", ok, err)
	}
}
