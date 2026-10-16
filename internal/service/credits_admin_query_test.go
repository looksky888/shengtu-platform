package service

import (
	"testing"
)

func TestQueryCardsPaginationAndFilters(t *testing.T) {
	svc := newTestCreditService(t)
	if _, err := svc.GenerateCards(5, 10); err != nil {
		t.Fatalf("GenerateCards: %v", err)
	}
	// Disable one for status filter.
	cards := svc.Cards()
	if len(cards) < 2 {
		t.Fatalf("want >=2 cards, got %d", len(cards))
	}
	if _, err := svc.DisableCard(cards[0].ID); err != nil {
		t.Fatalf("DisableCard: %v", err)
	}

	page1, err := svc.QueryCards(CreditCardsQuery{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if page1.Total != 5 || len(page1.Items) != 2 || page1.ActiveCount != 4 || page1.UsedCount != 0 {
		t.Fatalf("page1 = %#v", page1)
	}

	byStatus, err := svc.QueryCards(CreditCardsQuery{Page: 1, PageSize: 20, Status: CreditCardStatusDisabled})
	if err != nil || byStatus.Total != 1 {
		t.Fatalf("status filter = %#v err=%v", byStatus, err)
	}

	byKW, err := svc.QueryCards(CreditCardsQuery{Page: 1, PageSize: 20, Keyword: cards[1].ID})
	if err != nil || byKW.Total != 1 || byKW.Items[0].ID != cards[1].ID {
		t.Fatalf("keyword filter = %#v err=%v", byKW, err)
	}
}

func TestQueryAccountsPaginationAndFilters(t *testing.T) {
	svc := newTestCreditService(t)
	for _, id := range []string{"alice", "bob", "carol"} {
		if _, _, err := svc.Add(id, 10, CreditReasonSignup, id); err != nil {
			t.Fatalf("Add(%s): %v", id, err)
		}
	}
	if _, _, err := svc.Add("alice", 5, CreditReasonCheckin, "c1"); err != nil {
		t.Fatalf("Add checkin: %v", err)
	}

	page1, err := svc.QueryAccounts(CreditAccountsQuery{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if page1.Total != 3 || len(page1.Items) != 2 || page1.AccountCount != 3 || page1.TotalBalance != 35 {
		t.Fatalf("page1 = %#v", page1)
	}
	// Sorted by user_id asc.
	if page1.Items[0].UserID != "alice" || page1.Items[1].UserID != "bob" {
		t.Fatalf("order = %#v", page1.Items)
	}

	byKW, err := svc.QueryAccounts(CreditAccountsQuery{Page: 1, PageSize: 20, Keyword: "bob"})
	if err != nil || byKW.Total != 1 || byKW.Items[0].UserID != "bob" {
		t.Fatalf("keyword = %#v err=%v", byKW, err)
	}

	// Global totals stay unfiltered.
	if byKW.AccountCount != 3 || byKW.TotalBalance != 35 {
		t.Fatalf("global totals on filtered page = %#v", byKW)
	}
}
