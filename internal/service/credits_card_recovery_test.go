package service

import (
	"errors"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

type redeemCrashBackend struct {
	storage.Backend
	storage.JSONDocumentBackend
	crash bool
}

func (b *redeemCrashBackend) SaveJSONDocument(name string, value any) error {
	if b.crash && name == creditsDocumentName {
		panic("simulated process termination after ledger commit")
	}
	return b.JSONDocumentBackend.SaveJSONDocument(name, value)
}

type redeemCrashSQLBackend struct {
	*redeemCrashBackend
	storage.CreditLedgerBackend
}

func TestCardRedeemCrashRecoveryAcrossBackends(t *testing.T) {
	for _, kind := range []string{"json", "sqlite"} {
		t.Run(kind, func(t *testing.T) {
			root := t.TempDir()
			var original storage.Backend
			if kind == "sqlite" {
				db, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(root, "credits.db")))
				if err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { _ = db.Close() })
				original = db
			} else {
				original = storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "keys.json"))
			}
			fault := &redeemCrashBackend{Backend: original, JSONDocumentBackend: original.(storage.JSONDocumentBackend)}
			var backend storage.Backend = fault
			if ledger, ok := original.(storage.CreditLedgerBackend); ok {
				backend = &redeemCrashSQLBackend{redeemCrashBackend: fault, CreditLedgerBackend: ledger}
			}
			s := NewCreditService(root, backend)
			cards, err := s.GenerateCards(1, 7)
			if err != nil {
				t.Fatal(err)
			}
			fault.crash = true
			func() {
				defer func() {
					if recover() == nil {
						t.Error("crash injection did not execute")
					}
				}()
				_, _, _, _ = s.RedeemCard("first-user", cards[0].Key)
			}()
			fault.crash = false
			for boot := 0; boot < 2; boot++ {
				reloaded := NewCreditService(root, backend)
				if !reloaded.StoreReady() {
					t.Fatal("recovery failed")
				}
				account, err := reloaded.Account("first-user")
				if err != nil || account.Balance != 7 {
					t.Fatalf("balance=%d want=7 err=%v", account.Balance, err)
				}
				for _, user := range []string{"first-user", "second-user"} {
					if _, _, _, err := reloaded.RedeemCard(user, cards[0].Key); !errors.Is(err, ErrCreditCardInactive) {
						t.Fatalf("boot=%d user=%s redeem error=%v", boot, user, err)
					}
				}
				recovered := reloaded.Cards()[0]
				if recovered.Status != CreditCardStatusUsed || recovered.UsedBy != "first-user" || recovered.UsedAt == "" {
					t.Fatalf("recovered card state=%+v", recovered)
				}
			}
		})
	}
}
