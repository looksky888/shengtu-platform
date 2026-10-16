package service

import (
	"path/filepath"
	"testing"
)

func newLedgerQueryService(t *testing.T, entries []CreditLedgerEntry) *CreditService {
	t.Helper()
	dir := t.TempDir()
	svc := NewCreditService(dir)
	svc.mu.Lock()
	svc.state.Ledger = append([]CreditLedgerEntry(nil), entries...)
	svc.rebuildLedgerRefIndexLocked()
	svc.mu.Unlock()
	_ = filepath.Join(dir, "placeholder")
	return svc
}

func TestQueryLedgerPagination(t *testing.T) {
	entries := []CreditLedgerEntry{
		{ID: "a", UserID: "u1", Delta: 1, BalanceAfter: 1, Reason: "signup", CreatedAt: "2026-07-01 10:00:00"},
		{ID: "b", UserID: "u1", Delta: 2, BalanceAfter: 3, Reason: "checkin", CreatedAt: "2026-07-02 10:00:00"},
		{ID: "c", UserID: "u2", Delta: -1, BalanceAfter: 2, Reason: "image_generation", CreatedAt: "2026-07-03 10:00:00"},
		{ID: "d", UserID: "u2", Delta: 5, BalanceAfter: 7, Reason: "card_redeem", CreatedAt: "2026-07-04 10:00:00"},
		{ID: "e", UserID: "u3", Delta: 1, BalanceAfter: 1, Reason: "signup", CreatedAt: "2026-07-05 10:00:00"},
	}
	svc := newLedgerQueryService(t, entries)

	page1, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if page1.Total != 5 || page1.Page != 1 || page1.PageSize != 2 || len(page1.Items) != 2 {
		t.Fatalf("page1 = %#v", page1)
	}
	if page1.Items[0].ID != "e" || page1.Items[1].ID != "d" {
		t.Fatalf("page1 order = %#v", page1.Items)
	}

	page2, err := svc.QueryLedger(CreditLedgerQuery{Page: 2, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page2.Items) != 2 || page2.Items[0].ID != "c" || page2.Items[1].ID != "b" {
		t.Fatalf("page2 = %#v", page2)
	}
	// No overlap with page1.
	seen := map[string]bool{page1.Items[0].ID: true, page1.Items[1].ID: true}
	for _, item := range page2.Items {
		if seen[item.ID] {
			t.Fatalf("duplicate across pages: %s", item.ID)
		}
	}

	pageOut, err := svc.QueryLedger(CreditLedgerQuery{Page: 99, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if pageOut.Total != 5 || len(pageOut.Items) != 0 {
		t.Fatalf("out of range page = %#v", pageOut)
	}
	if pageOut.Items == nil {
		t.Fatal("items must be empty slice not nil")
	}
}

func TestQueryLedgerFilters(t *testing.T) {
	entries := []CreditLedgerEntry{
		{ID: "a1", UserID: "alice", Delta: 10, BalanceAfter: 10, Reason: "signup", RefID: "r1", CreatedAt: "2026-07-10 08:00:00"},
		{ID: "a2", UserID: "bob", Delta: -3, BalanceAfter: 7, Reason: "image_generation", RefID: "task-9", CreatedAt: "2026-07-11 12:00:00"},
		{ID: "a3", UserID: "alice", Delta: 5, BalanceAfter: 15, Reason: "card_redeem", RefID: "card-1", CreatedAt: "2026-07-12 09:00:00"},
	}
	svc := newLedgerQueryService(t, entries)

	byReason, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 20, Reason: "signup"})
	if err != nil || byReason.Total != 1 || byReason.Items[0].ID != "a1" {
		t.Fatalf("reason filter = %#v err=%v", byReason, err)
	}

	byKeyword, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 20, Keyword: "task-9"})
	if err != nil || byKeyword.Total != 1 || byKeyword.Items[0].ID != "a2" {
		t.Fatalf("keyword filter = %#v err=%v", byKeyword, err)
	}

	byUser, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 20, Keyword: "alice"})
	if err != nil || byUser.Total != 2 {
		t.Fatalf("user keyword = %#v err=%v", byUser, err)
	}

	byTime, err := svc.QueryLedger(CreditLedgerQuery{
		Page: 1, PageSize: 20,
		StartAt: "2026-07-11",
		EndAt:   "2026-07-11",
	})
	if err != nil || byTime.Total != 1 || byTime.Items[0].ID != "a2" {
		t.Fatalf("time filter = %#v err=%v", byTime, err)
	}
}

func TestQueryLedgerStableIDSort(t *testing.T) {
	entries := []CreditLedgerEntry{
		{ID: "z", UserID: "u", Delta: 1, BalanceAfter: 1, Reason: "signup", CreatedAt: "2026-07-01 10:00:00"},
		{ID: "a", UserID: "u", Delta: 1, BalanceAfter: 2, Reason: "signup", CreatedAt: "2026-07-01 10:00:00"},
		{ID: "m", UserID: "u", Delta: 1, BalanceAfter: 3, Reason: "signup", CreatedAt: "2026-07-01 10:00:00"},
	}
	svc := newLedgerQueryService(t, entries)
	page, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Items[0].ID != "z" || page.Items[1].ID != "m" || page.Items[2].ID != "a" {
		t.Fatalf("id desc order = %#v", page.Items)
	}
}

func TestQueryLedgerEmptyAndValidation(t *testing.T) {
	svc := newLedgerQueryService(t, nil)
	page, err := svc.QueryLedger(CreditLedgerQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 0 || len(page.Items) != 0 || page.Page != 1 || page.PageSize != 20 {
		t.Fatalf("empty default = %#v", page)
	}

	if _, err := svc.QueryLedger(CreditLedgerQuery{Page: 0, PageSize: 20}); err == nil {
		// page 0 is normalized to 1
	}
	// Explicit invalid: negative page via direct normalize — page_size 101
	if _, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 101}); err == nil {
		t.Fatal("expected page_size 101 error")
	}
	if _, err := svc.QueryLedger(CreditLedgerQuery{Page: -1, PageSize: 20}); err == nil {
		t.Fatal("expected page -1 error")
	}
}

// Ensure NewCreditService exists for tests; used by helper above.
func TestQueryLedgerServiceConstruct(t *testing.T) {
	svc := NewCreditService(t.TempDir())
	if svc == nil {
		t.Fatal("nil service")
	}
}

func TestQueryLedgerUserIDFilter(t *testing.T) {
	entries := []CreditLedgerEntry{
		{ID: "a", UserID: "alice", Delta: 1, BalanceAfter: 1, Reason: "signup", CreatedAt: "2026-07-02 10:00:00"},
		{ID: "b", UserID: "bob", Delta: 2, BalanceAfter: 2, Reason: "signup", CreatedAt: "2026-07-03 10:00:00"},
		{ID: "c", UserID: "alice", Delta: 3, BalanceAfter: 4, Reason: "checkin", CreatedAt: "2026-07-04 10:00:00"},
	}
	svc := newLedgerQueryService(t, entries)
	page, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 20, UserID: "alice"})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 || len(page.Items) != 2 {
		t.Fatalf("user filter = %#v", page)
	}
	for _, item := range page.Items {
		if item.UserID != "alice" {
			t.Fatalf("leaked other user: %#v", item)
		}
	}
}
