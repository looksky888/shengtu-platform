package storage

import (
	"path/filepath"
	"testing"
)

func TestCreditLedgerAppendQueryAndReplace(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "ledger.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()

	rows := []CreditLedgerRow{
		{ID: "e1", UserID: "u1", Delta: 10, BalanceAfter: 10, Reason: "signup", RefID: "r1", CreatedAt: "2026-07-01T10:00:00+08:00"},
		{ID: "e2", UserID: "u1", Delta: -3, BalanceAfter: 7, Reason: "image_generation", RefID: "task-1", CreatedAt: "2026-07-02T11:00:00+08:00"},
		{ID: "e3", UserID: "u2", Delta: 5, BalanceAfter: 5, Reason: "card_redeem", RefID: "c1", CreatedAt: "2026-07-03T12:00:00+08:00"},
	}
	if err := backend.AppendCreditLedger(rows); err != nil {
		t.Fatalf("AppendCreditLedger() error = %v", err)
	}
	// Idempotent re-append must not duplicate.
	if err := backend.AppendCreditLedger(rows[:1]); err != nil {
		t.Fatalf("re-append error = %v", err)
	}
	n, err := backend.CountCreditLedger()
	if err != nil || n != 3 {
		t.Fatalf("CountCreditLedger() = %d, %v want 3", n, err)
	}

	loaded, err := backend.LoadCreditLedger()
	if err != nil {
		t.Fatalf("LoadCreditLedger() error = %v", err)
	}
	if len(loaded) != 3 || loaded[0].ID != "e1" || loaded[2].ID != "e3" {
		t.Fatalf("LoadCreditLedger() = %#v", loaded)
	}

	page, total, err := backend.QueryCreditLedger(CreditLedgerFilter{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatalf("QueryCreditLedger() error = %v", err)
	}
	if total != 3 || len(page) != 2 || page[0].ID != "e3" || page[1].ID != "e2" {
		t.Fatalf("page1 = %#v total=%d", page, total)
	}

	byReason, total, err := backend.QueryCreditLedger(CreditLedgerFilter{Page: 1, PageSize: 20, Reason: "signup"})
	if err != nil || total != 1 || byReason[0].ID != "e1" {
		t.Fatalf("reason filter = %#v total=%d err=%v", byReason, total, err)
	}

	byKW, total, err := backend.QueryCreditLedger(CreditLedgerFilter{Page: 1, PageSize: 20, Keyword: "task-1"})
	if err != nil || total != 1 || byKW[0].ID != "e2" {
		t.Fatalf("keyword filter = %#v total=%d err=%v", byKW, total, err)
	}

	byDate, total, err := backend.QueryCreditLedger(CreditLedgerFilter{
		Page: 1, PageSize: 20,
		StartAt: "2026-07-02",
		EndAt:   "2026-07-02",
	})
	if err != nil || total != 1 || byDate[0].ID != "e2" {
		t.Fatalf("date filter = %#v total=%d err=%v", byDate, total, err)
	}

	if err := backend.ReplaceCreditLedger([]CreditLedgerRow{
		{ID: "only", UserID: "u9", Delta: 1, BalanceAfter: 1, Reason: "signup", CreatedAt: "2026-07-10T00:00:00+08:00"},
	}); err != nil {
		t.Fatalf("ReplaceCreditLedger() error = %v", err)
	}
	n, err = backend.CountCreditLedger()
	if err != nil || n != 1 {
		t.Fatalf("after replace count = %d err=%v", n, err)
	}
}
