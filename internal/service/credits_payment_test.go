package service

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestCompletePaymentRechargeUpdatesExistingCreditAccountOnce(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	order := storage.PaymentOrderRecord{
		ID: "order-1", OutTradeNo: "trade-1", UserID: "user-1", IdempotencyKey: "idem-1",
		ChannelID: "channel-1", ChannelVersionID: "version-1", ProductID: "product-1",
		ProductNameSnapshot: "测试套餐", AmountFen: 100, CreditsSnapshot: 10,
		Currency: "CNY", ExpireMinutesSnapshot: 15, ExpiresAt: "2026-08-30T12:00:00+08:00",
		Status: storage.PaymentOrderStatusPending, CreatedAt: "2026-08-30T11:45:00+08:00", UpdatedAt: "2026-08-30T11:45:00+08:00",
	}
	if _, created, err := backend.CreatePaymentOrder(order); err != nil || !created {
		t.Fatalf("CreatePaymentOrder() created=%v err=%v", created, err)
	}
	credits := NewCreditService(dataDir, backend)
	if _, _, err := credits.Add("user-1", 5, "test_seed", "seed-1"); err != nil {
		t.Fatalf("seed credits: %v", err)
	}
	input := PaymentRechargeCreditInput{
		OrderID: "order-1", UserID: "user-1", Amount: 10, MerchantID: "merchant-1",
		TransactionID: "wx-1", PaidAt: "2026-08-30T12:01:00+08:00",
		TradeState: "SUCCESS", TradeStateDesc: "支付成功",
	}
	account, entry, credited, err := credits.CompletePaymentRecharge(input)
	if err != nil || !credited || account.Balance != 15 || entry.Reason != CreditReasonPaymentRecharge {
		t.Fatalf("CompletePaymentRecharge() account=%#v entry=%#v credited=%v err=%v", account, entry, credited, err)
	}
	account, _, credited, err = credits.CompletePaymentRecharge(input)
	if err != nil || credited || account.Balance != 15 {
		t.Fatalf("retry account=%#v credited=%v err=%v", account, credited, err)
	}
	completed, err := backend.LoadPaymentOrderByID("order-1")
	if err != nil || completed.Status != storage.PaymentOrderStatusSucceeded || completed.TransactionID != "wx-1" {
		t.Fatalf("completed order=%#v err=%v", completed, err)
	}
	reloaded := NewCreditService(dataDir, backend)
	reloadedAccount, err := reloaded.Account("user-1")
	if err != nil || reloadedAccount.Balance != 15 {
		t.Fatalf("reloaded account=%#v err=%v", reloadedAccount, err)
	}
}

func TestCompletePaymentRechargeRejectsSnapshotMismatchWithoutChangingBalance(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	order := storage.PaymentOrderRecord{
		ID: "order-1", OutTradeNo: "trade-1", UserID: "user-1", IdempotencyKey: "idem-1",
		ChannelID: "channel-1", ChannelVersionID: "version-1", ProductID: "product-1",
		ProductNameSnapshot: "测试套餐", AmountFen: 100, CreditsSnapshot: 10,
		ExpireMinutesSnapshot: 15, ExpiresAt: "later", Status: storage.PaymentOrderStatusPending,
		CreatedAt: "now", UpdatedAt: "now",
	}
	if _, _, err := backend.CreatePaymentOrder(order); err != nil {
		t.Fatal(err)
	}
	credits := NewCreditService(dataDir, backend)
	_, _, _, err = credits.CompletePaymentRecharge(PaymentRechargeCreditInput{
		OrderID: "order-1", UserID: "user-1", Amount: 99, MerchantID: "merchant-1",
		TransactionID: "wx-1", PaidAt: "now",
	})
	if err == nil {
		t.Fatal("snapshot mismatch unexpectedly succeeded")
	}
	account, err := credits.Account("user-1")
	if err != nil || account.Balance != 0 {
		t.Fatalf("account after rejected completion=%#v err=%v", account, err)
	}
	current, err := backend.LoadPaymentOrderByID("order-1")
	if err != nil || current.Status != storage.PaymentOrderStatusPending {
		t.Fatalf("order after rejected completion=%#v err=%v", current, err)
	}
}
