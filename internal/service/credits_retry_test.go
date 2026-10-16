package service

import (
	"sync"
	"testing"
)

func TestCreditRetryConcurrentReloadAndRefund(t *testing.T) {
	s, backend := newSQLiteCreditService(t)
	if _, _, err := s.Add("u", 50, "seed", "seed"); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.DeductOnce("u", 2, CreditReasonImageGeneration, "r"); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.AddOnce("u", 2, CreditReasonImageRefund, "r"); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	winners := make(chan CreditLedgerEntry, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, entry, charged, err := s.DeductRetryOnce("u", 2, CreditReasonImageGeneration, CreditReasonImageRefund, "r")
			if err != nil {
				t.Error(err)
			}
			if charged {
				winners <- entry
			}
		}()
	}
	wg.Wait()
	close(winners)
	var entries []CreditLedgerEntry
	for entry := range winners {
		entries = append(entries, entry)
	}
	if len(entries) != 1 {
		t.Fatalf("charged retries=%d want=1", len(entries))
	}
	reloaded := NewCreditService(s.dataDir, backend)
	if account, _ := reloaded.Account("u"); account.Balance != 48 {
		t.Fatalf("balance=%d want=48", account.Balance)
	}
	if _, _, _, err := reloaded.AddOnce("u", 2, CreditReasonImageRefund, entries[0].RefID); err != nil {
		t.Fatal(err)
	}
	if _, _, charged, err := reloaded.DeductRetryOnce("u", 2, CreditReasonImageGeneration, CreditReasonImageRefund, "r"); err != nil || charged {
		t.Fatalf("retry reused after refund: charged=%v err=%v", charged, err)
	}
}

func TestCreditRetryRejectsInvalidAmountsAndHistoricalRetry(t *testing.T) {
	s := newTestCreditService(t)
	if _, _, err := s.Add("u", 10, "seed", "seed"); err != nil {
		t.Fatal(err)
	}
	for _, amount := range []int{0, -5} {
		if _, _, _, err := s.DeductRetryOnce("u", amount, CreditReasonImageGeneration, CreditReasonImageRefund, "r"); err == nil {
			t.Fatalf("accepted amount %d", amount)
		}
	}
	if _, _, _, err := s.DeductOnce("u", 2, CreditReasonImageGeneration, "r"); err != nil {
		t.Fatal(err)
	}
	if _, _, charged, err := s.DeductRetryOnce("u", 2, CreditReasonImageGeneration, CreditReasonImageRefund, "r"); err != nil || charged {
		t.Fatalf("accepted unrefunded retry: %v %v", charged, err)
	}
	if _, _, _, err := s.AddOnce("u", 2, CreditReasonImageRefund, "r"); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.DeductOnce("u", 2, CreditReasonImageGeneration, "r:retry:old-random"); err != nil {
		t.Fatal(err)
	}
	if _, _, charged, err := s.DeductRetryOnce("u", 2, CreditReasonImageGeneration, CreditReasonImageRefund, "r"); err != nil || charged {
		t.Fatalf("ignored historical retry: %v %v", charged, err)
	}
	if account, _ := s.Account("u"); account.Balance != 8 {
		t.Fatalf("balance=%d want=8", account.Balance)
	}
}
