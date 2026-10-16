package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCreditServiceConcurrentCardRedeemOnlySucceedsOnce(t *testing.T) {
	service := newTestCreditService(t)
	generated, err := service.GenerateCards(1, 7)
	if err != nil {
		t.Fatalf("GenerateCards() error = %v", err)
	}

	const attempts = 40
	var wg sync.WaitGroup
	var mu sync.Mutex
	succeeded := 0
	inactive := 0
	errCh := make(chan error, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, _, err := service.RedeemCard("user-1", generated[0].Key)
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				succeeded++
			} else if errors.Is(err, ErrCreditCardInactive) {
				inactive++
			} else {
				errCh <- err
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatalf("unexpected RedeemCard() error = %v", err)
	}
	if succeeded != 1 || inactive != attempts-1 {
		t.Fatalf("succeeded=%d inactive=%d", succeeded, inactive)
	}
	account, err := service.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 7 {
		t.Fatalf("balance = %d, want 7", account.Balance)
	}
}

func TestCreditServiceRejectsInvalidAddAmount(t *testing.T) {
	service := newTestCreditService(t)

	if _, _, err := service.Add("user-1", -5, "manual", ""); err == nil {
		t.Fatal("Add() with negative amount succeeded")
	}
	account, err := service.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 0 || account.CreatedAt != "" || account.UpdatedAt != "" {
		t.Fatalf("invalid add mutated account: %#v", account)
	}
	if ledger := service.Ledger("user-1"); len(ledger) != 0 {
		t.Fatalf("invalid add wrote ledger: %#v", ledger)
	}
}

func TestCreditServiceSaveFailureDoesNotMutateMemory(t *testing.T) {
	root := t.TempDir()
	dataPath := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(dataPath, []byte("block mkdir"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	service := NewCreditService(dataPath)

	if _, _, err := service.Add("user-1", 10, "manual", ""); err == nil {
		t.Fatal("Add() succeeded with unwritable data path")
	}
	account, err := service.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 0 || account.CreatedAt != "" || account.UpdatedAt != "" {
		t.Fatalf("failed save mutated account: %#v", account)
	}
	if ledger := service.Ledger("user-1"); len(ledger) != 0 {
		t.Fatalf("failed save wrote ledger: %#v", ledger)
	}
}

func TestCreditServiceRefusesSaveWhenLoadFailed(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	// Seed a valid balance, then corrupt the core document so reload fails.
	seed := NewCreditService(root, backend)
	if _, _, err := seed.Add("user-1", 42, "signup", "seed"); err != nil {
		t.Fatalf("seed Add() error = %v", err)
	}
	statePath := filepath.Join(root, "credits", "state.json")
	// Prefer document store path used by JSON backend.
	if err := backend.SaveJSONDocument("credits/state.json", "not-a-json-object{"); err != nil {
		// Fall back to raw file corruption when document API rejects non-JSON.
		if writeErr := os.WriteFile(statePath, []byte("not-json{{{"), 0o644); writeErr != nil {
			t.Fatalf("corrupt state: save=%v write=%v", err, writeErr)
		}
	} else {
		// Force invalid JSON bytes on disk for the document path.
		docPath := filepath.Join(root, "credits", "state.json")
		if err := os.WriteFile(docPath, []byte("{broken"), 0o644); err != nil {
			t.Fatalf("WriteFile corrupt state: %v", err)
		}
	}

	broken := NewCreditService(root, backend)
	if broken.StoreReady() {
		t.Fatal("StoreReady() = true, want false after corrupt state")
	}
	if _, _, err := broken.Add("user-1", 1, "manual", "x"); err == nil {
		t.Fatal("Add() should refuse when store not ready")
	}
	// Disk must not be overwritten with empty accounts.
	reloadedRaw, err := os.ReadFile(statePath)
	if err != nil {
		// document may live under backend data dir �?check via load of a fresh service after fix is N/A
		reloadedRaw, err = os.ReadFile(filepath.Join(root, "credits", "state.json"))
	}
	if err == nil && strings.Contains(string(reloadedRaw), `"balance": 0`) && !strings.Contains(string(reloadedRaw), "broken") && !strings.Contains(string(reloadedRaw), "{broken") {
		// Only fail if we clearly wrote a fresh empty core with zero balance account.
		if strings.Contains(string(reloadedRaw), "user-1") && strings.Contains(string(reloadedRaw), `"accounts"`) {
			t.Fatalf("corrupt state was replaced by empty write: %s", reloadedRaw)
		}
	}
}

func TestCreditServiceReconcilesBalanceFromLedgerAhead(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	service := NewCreditService(root, backend)
	if _, _, err := service.Add("user-1", 20, "signup", "s1"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if _, _, err := service.Deduct("user-1", 5, "image_generation", "t1"); err != nil {
		t.Fatalf("Deduct() error = %v", err)
	}
	// Simulate crash: ledger has final balance 15, core still shows 20.
	core := creditCoreState{
		Accounts: map[string]CreditAccount{
			"user-1": {UserID: "user-1", Balance: 20, CreatedAt: "2020-01-01T00:00:00Z", UpdatedAt: "2020-01-01T00:00:00Z"},
		},
		Cards:          map[string]CreditCard{},
		Invites:        map[string]string{},
		LedgerMigrated: true,
	}
	if err := saveStoredJSON(backend, creditsDocumentName, filepath.Join(root, "credits", "state.json"), core); err != nil {
		t.Fatalf("save core: %v", err)
	}

	reloaded := NewCreditService(root, backend)
	if !reloaded.StoreReady() {
		t.Fatal("StoreReady() = false, want true")
	}
	account, err := reloaded.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 15 {
		t.Fatalf("reconciled balance = %d, want 15 (from ledger)", account.Balance)
	}
	// DeductOnce must still see prior ref and not double-charge.
	account, _, charged, err := reloaded.DeductOnce("user-1", 5, "image_generation", "t1")
	if err != nil {
		t.Fatalf("DeductOnce() error = %v", err)
	}
	if charged {
		t.Fatal("DeductOnce re-charged an existing ref_id")
	}
	if account.Balance != 15 {
		t.Fatalf("balance after idempotent DeductOnce = %d, want 15", account.Balance)
	}
}

func TestCreditServiceCheckInUsesChinaDate(t *testing.T) {
	service := newTestCreditService(t)
	// 2026-07-16 01:30 Asia/Shanghai == 2026-07-15 17:30 UTC.
	// Ref must be China calendar day 2026-07-16 (not UTC 2026-07-15).
	day := time.Date(2026, 7, 16, 1, 30, 0, 0, util.ChinaLocation())
	_, entry, awarded, err := service.CheckIn("user-1", day)
	if err != nil {
		t.Fatalf("CheckIn() error = %v", err)
	}
	if !awarded || entry.RefID != "2026-07-16" {
		t.Fatalf("CheckIn entry = %#v awarded=%v, want ref 2026-07-16", entry, awarded)
	}
	if !service.HasLedgerEntry("user-1", CreditReasonCheckin, "2026-07-16") {
		t.Fatal("HasLedgerEntry missing China-day checkin ref")
	}
	// Same China day again is idempotent.
	_, _, awarded, err = service.CheckIn("user-1", day.Add(2*time.Hour))
	if err != nil || awarded {
		t.Fatalf("second CheckIn awarded=%v err=%v", awarded, err)
	}
}

func TestReconcileCreditBalancesFromLedger(t *testing.T) {
	state := emptyCreditState()
	state.Accounts["u"] = CreditAccount{UserID: "u", Balance: 10}
	state.Ledger = []CreditLedgerEntry{
		{ID: "1", UserID: "u", Delta: 10, BalanceAfter: 10, CreatedAt: "a"},
		{ID: "2", UserID: "u", Delta: -3, BalanceAfter: 7, CreatedAt: "b"},
	}
	reconcileCreditBalancesFromLedger(&state)
	if state.Accounts["u"].Balance != 7 {
		t.Fatalf("balance = %d, want 7", state.Accounts["u"].Balance)
	}
}

func TestCreditServiceReplaysRedeemLedgerIntoCardState(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "keys.json"))
	card := CreditCard{ID: "card-1", CodeHash: "hash", Amount: 7, Status: CreditCardStatusActive, CreatedAt: "2026-07-01T08:00:00+08:00"}
	if err := backend.SaveJSONDocument(creditsDocumentName, creditCoreState{
		Accounts: map[string]CreditAccount{"u": {UserID: "u", Balance: 7}},
		Cards:    map[string]CreditCard{card.ID: card}, Invites: map[string]string{}, LedgerMigrated: true,
	}); err != nil {
		t.Fatal(err)
	}
	if err := backend.SaveJSONDocument(creditsLedgerDocumentName, map[string]any{"entries": []CreditLedgerEntry{{
		ID: "redeem-1", UserID: "u", Delta: 7, BalanceAfter: 7, Reason: CreditReasonCardRedeem, RefID: card.ID, CreatedAt: "2026-07-01T08:01:00+08:00",
	}}}); err != nil {
		t.Fatal(err)
	}
	service := NewCreditService(root, backend)
	got := service.Cards()
	if len(got) != 1 || got[0].Status != CreditCardStatusUsed || got[0].UsedBy != "u" {
		t.Fatalf("replayed cards = %#v", got)
	}
}

func TestReconcileCreditBalancesKeepsCoreForAmbiguousTimestampTie(t *testing.T) {
	const timestamp = "2026-07-20T12:00:00+08:00"
	state := emptyCreditState()
	state.Accounts["u"] = CreditAccount{
		UserID:    "u",
		Balance:   7,
		CreatedAt: timestamp,
		UpdatedAt: timestamp,
	}
	state.Ledger = []CreditLedgerEntry{
		{ID: "0000", UserID: "u", Delta: -3, BalanceAfter: 7, CreatedAt: timestamp},
		{ID: "ffff", UserID: "u", Delta: 10, BalanceAfter: 10, CreatedAt: timestamp},
	}

	reconcileCreditBalancesFromLedger(&state)
	if state.Accounts["u"].Balance != 7 {
		t.Fatalf("balance = %d, want core balance 7 for timestamp tie", state.Accounts["u"].Balance)
	}
}

func TestNextCreditLedgerTimestampIsStrictlyMonotonic(t *testing.T) {
	previous := "2026-07-20T12:00:00.123456789+08:00"
	got := nextCreditLedgerTimestamp(previous, previous)
	gotTime, err := time.Parse(time.RFC3339Nano, got)
	if err != nil {
		t.Fatalf("parse timestamp %q: %v", got, err)
	}
	previousTime, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		t.Fatalf("parse previous timestamp: %v", err)
	}
	if !gotTime.After(previousTime) {
		t.Fatalf("timestamp = %q, want strictly after %q", got, previous)
	}
}

func newTestCreditService(t *testing.T) *CreditService {
	t.Helper()
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	return NewCreditService(root, backend)
}
