package service

import (
	"chatgpt2api/internal/storage"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func TestCreditServiceAddCreatesAccountAndLedger(t *testing.T) {
	service := newTestCreditService(t)

	account, entry, err := service.Add("user-1", 30, "signup", "register:user-1")
	if err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if account.UserID != "user-1" || account.Balance != 30 || account.CreatedAt == "" || account.UpdatedAt == "" {
		t.Fatalf("account = %#v", account)
	}
	if entry.ID == "" || entry.UserID != "user-1" || entry.Delta != 30 || entry.BalanceAfter != 30 || entry.Reason != "signup" || entry.RefID != "register:user-1" || entry.CreatedAt == "" {
		t.Fatalf("ledger entry = %#v", entry)
	}

	ledger := service.Ledger("user-1")
	if len(ledger) != 1 || ledger[0].ID != entry.ID {
		t.Fatalf("Ledger() = %#v", ledger)
	}
}

func TestCreditServiceDeductWritesLedger(t *testing.T) {
	service := newTestCreditService(t)
	if _, _, err := service.Add("user-1", 30, "signup", ""); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	account, entry, err := service.Deduct("user-1", 12, "image_generation", "task-1")
	if err != nil {
		t.Fatalf("Deduct() error = %v", err)
	}
	if account.Balance != 18 {
		t.Fatalf("balance = %d, want 18", account.Balance)
	}
	if entry.Delta != -12 || entry.BalanceAfter != 18 || entry.Reason != "image_generation" || entry.RefID != "task-1" {
		t.Fatalf("ledger entry = %#v", entry)
	}
	if ledger := service.Ledger("user-1"); len(ledger) != 2 {
		t.Fatalf("ledger length = %d, want 2: %#v", len(ledger), ledger)
	}
}

func TestCreditServiceDeductInsufficientBalanceDoesNotWriteLedger(t *testing.T) {
	service := newTestCreditService(t)
	if _, _, err := service.Add("user-1", 5, "signup", ""); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	account, entry, err := service.Deduct("user-1", 6, "image_generation", "task-1")
	if !errors.Is(err, ErrInsufficientCredits) {
		t.Fatalf("Deduct() error = %v, want ErrInsufficientCredits", err)
	}
	if account.Balance != 5 {
		t.Fatalf("balance after failed deduct = %d, want 5", account.Balance)
	}
	if entry != (CreditLedgerEntry{}) {
		t.Fatalf("failed deduction wrote entry: %#v", entry)
	}
	if ledger := service.Ledger("user-1"); len(ledger) != 1 {
		t.Fatalf("ledger length = %d, want 1: %#v", len(ledger), ledger)
	}
}

func TestCreditServiceConcurrentDeductDoesNotGoNegative(t *testing.T) {
	service := newTestCreditService(t)
	if _, _, err := service.Add("user-1", 25, "signup", ""); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	const attempts = 80
	var wg sync.WaitGroup
	var mu sync.Mutex
	succeeded := 0
	insufficient := 0
	unexpected := []error{}
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, err := service.Deduct("user-1", 1, "image_generation", "")
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				succeeded++
			case errors.Is(err, ErrInsufficientCredits):
				insufficient++
			default:
				unexpected = append(unexpected, err)
			}
		}()
	}
	wg.Wait()

	if len(unexpected) != 0 {
		t.Fatalf("unexpected errors = %#v", unexpected)
	}
	if succeeded != 25 || insufficient != attempts-25 {
		t.Fatalf("succeeded=%d insufficient=%d", succeeded, insufficient)
	}
	account, err := service.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 0 {
		t.Fatalf("balance = %d, want 0", account.Balance)
	}
	if ledger := service.Ledger("user-1"); len(ledger) != 26 {
		t.Fatalf("ledger length = %d, want 26", len(ledger))
	}
}

func TestCreditServicePersistsState(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	service := NewCreditService(root, backend)
	if _, _, err := service.Add("user-1", 9, "signup", ""); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	reloaded := NewCreditService(root, backend)
	account, err := reloaded.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 9 {
		t.Fatalf("persisted balance = %d, want 9", account.Balance)
	}
	if ledger := reloaded.Ledger("user-1"); len(ledger) != 1 || ledger[0].BalanceAfter != 9 {
		t.Fatalf("persisted ledger = %#v", ledger)
	}
}

func TestCreditServiceAddOnceAndInviteRewardAreIdempotent(t *testing.T) {
	service := newTestCreditService(t)

	account, _, awarded, err := service.AddOnce("user-1", 10, CreditReasonSignup, "user-1")
	if err != nil {
		t.Fatalf("AddOnce() error = %v", err)
	}
	if !awarded || account.Balance != 10 {
		t.Fatalf("first AddOnce account=%#v awarded=%v", account, awarded)
	}
	account, _, awarded, err = service.AddOnce("user-1", 10, CreditReasonSignup, "user-1")
	if err != nil {
		t.Fatalf("duplicate AddOnce() error = %v", err)
	}
	if awarded || account.Balance != 10 {
		t.Fatalf("duplicate AddOnce account=%#v awarded=%v", account, awarded)
	}

	code, err := service.InviteCode("user-1")
	if err != nil {
		t.Fatalf("InviteCode() error = %v", err)
	}
	if code == "" || service.ResolveInviteCode(code) != "user-1" {
		t.Fatalf("invite code=%q resolved=%q", code, service.ResolveInviteCode(code))
	}
	account, _, awarded, err = service.RewardInvite("user-1", "user-2")
	if err != nil {
		t.Fatalf("RewardInvite() error = %v", err)
	}
	if !awarded || account.Balance != 20 {
		t.Fatalf("invite reward account=%#v awarded=%v", account, awarded)
	}
	account, _, awarded, err = service.RewardInvite("user-1", "user-2")
	if err != nil {
		t.Fatalf("duplicate RewardInvite() error = %v", err)
	}
	if awarded || account.Balance != 20 {
		t.Fatalf("duplicate invite reward account=%#v awarded=%v", account, awarded)
	}
}

func TestCreditServiceAdjustSupportsPositiveAndNegativeDelta(t *testing.T) {
	service := newTestCreditService(t)

	account, entry, err := service.Adjust("user-1", 12, "", "admin-1")
	if err != nil {
		t.Fatalf("Adjust(positive) error = %v", err)
	}
	if account.Balance != 12 || entry.Delta != 12 || entry.Reason != CreditReasonAdminManualAdjust {
		t.Fatalf("Adjust(positive) account=%#v entry=%#v", account, entry)
	}

	account, entry, err = service.Adjust("user-1", -5, "manual_deduction", "admin-1")
	if err != nil {
		t.Fatalf("Adjust(negative) error = %v", err)
	}
	if account.Balance != 7 || entry.Delta != -5 || entry.Reason != "manual_deduction" {
		t.Fatalf("Adjust(negative) account=%#v entry=%#v", account, entry)
	}

	if _, _, err := service.Adjust("user-1", 0, "", "admin-1"); err == nil {
		t.Fatal("Adjust() with zero delta succeeded")
	}
	if _, _, err := service.Adjust("user-1", -99, "", "admin-1"); !errors.Is(err, ErrInsufficientCredits) {
		t.Fatalf("Adjust() overdraft error = %v, want ErrInsufficientCredits", err)
	}
}

func TestCreditServiceGenerateRedeemAndDisableCards(t *testing.T) {
	service := newTestCreditService(t)

	generated, err := service.GenerateCards(2, 15)
	if err != nil {
		t.Fatalf("GenerateCards() error = %v", err)
	}
	if len(generated) != 2 || generated[0].Key == "" || generated[0].Card.CodeHash == "" || generated[0].Card.Status != CreditCardStatusActive {
		t.Fatalf("generated cards = %#v", generated)
	}
	if generated[0].Key == generated[1].Key || generated[0].Card.ID == generated[1].Card.ID {
		t.Fatalf("generated cards not unique: %#v", generated)
	}

	account, entry, card, err := service.RedeemCard("user-1", generated[0].Key)
	if err != nil {
		t.Fatalf("RedeemCard() error = %v", err)
	}
	if account.Balance != 15 || entry.Reason != CreditReasonCardRedeem || entry.RefID != card.ID || card.Status != CreditCardStatusUsed || card.UsedBy != "user-1" {
		t.Fatalf("redeem account=%#v entry=%#v card=%#v", account, entry, card)
	}
	if _, _, _, err := service.RedeemCard("user-1", generated[0].Key); !errors.Is(err, ErrCreditCardInactive) {
		t.Fatalf("duplicate RedeemCard() error = %v, want ErrCreditCardInactive", err)
	}
	if _, _, _, err := service.RedeemCard("user-1", "missing"); !errors.Is(err, ErrCreditCardNotFound) {
		t.Fatalf("missing RedeemCard() error = %v, want ErrCreditCardNotFound", err)
	}

	disabled, err := service.DisableCard(generated[1].Card.ID)
	if err != nil {
		t.Fatalf("DisableCard() error = %v", err)
	}
	if disabled.Status != CreditCardStatusDisabled {
		t.Fatalf("disabled card = %#v", disabled)
	}
	if _, _, _, err := service.RedeemCard("user-1", generated[1].Key); !errors.Is(err, ErrCreditCardInactive) {
		t.Fatalf("disabled RedeemCard() error = %v, want ErrCreditCardInactive", err)
	}
	if ledger := service.AllLedger(); len(ledger) != 1 || ledger[0].Delta != 15 {
		t.Fatalf("AllLedger() = %#v", ledger)
	}
	if accounts := service.Accounts(); len(accounts) != 1 || accounts[0].Balance != 15 {
		t.Fatalf("Accounts() = %#v", accounts)
	}
}
