package service

import (
	"errors"
	"testing"
)

type refundQueueTestApplier struct {
	fail  bool
	calls int
}

func (a *refundQueueTestApplier) AddOnce(string, int, string, string) (CreditAccount, CreditLedgerEntry, bool, error) {
	a.calls++
	if a.fail {
		return CreditAccount{}, CreditLedgerEntry{}, false, errors.New("temporary store failure")
	}
	return CreditAccount{}, CreditLedgerEntry{}, true, nil
}

func TestCreditRefundQueuePersistsAndRetries(t *testing.T) {
	root := t.TempDir()
	failing := &refundQueueTestApplier{fail: true}
	queue, err := newCreditRefundQueue(root, failing)
	if err != nil {
		t.Fatal(err)
	}
	intent := CreditRefundIntent{UserID: "u1", Amount: 4, Reason: CreditReasonImageRefund, RefID: "image:task-1"}
	if err := queue.Refund(intent); err == nil {
		t.Fatal("Refund() succeeded while the credit store was failing")
	}
	if queue.PendingCount() != 1 {
		t.Fatalf("pending=%d want=1", queue.PendingCount())
	}

	recovered := &refundQueueTestApplier{}
	reloaded, err := newCreditRefundQueue(root, recovered)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := reloaded.RetryPending()
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 1 || summary.Refunded != 1 || summary.Failed != 0 {
		t.Fatalf("summary=%+v", summary)
	}
	if reloaded.PendingCount() != 0 || recovered.calls != 1 {
		t.Fatalf("pending=%d calls=%d", reloaded.PendingCount(), recovered.calls)
	}
}

func TestCreditRefundQueueRejectsConflictingAmount(t *testing.T) {
	applier := &refundQueueTestApplier{fail: true}
	queue, err := newCreditRefundQueue(t.TempDir(), applier)
	if err != nil {
		t.Fatal(err)
	}
	first := CreditRefundIntent{UserID: "u1", Amount: 4, Reason: CreditReasonImageRefund, RefID: "same-ref"}
	if err := queue.Refund(first); err == nil {
		t.Fatal("first Refund() unexpectedly succeeded")
	}
	second := first
	second.Amount = 5
	if err := queue.Refund(second); err == nil {
		t.Fatal("conflicting Refund() unexpectedly succeeded")
	}
}
