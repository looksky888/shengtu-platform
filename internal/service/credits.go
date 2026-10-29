package service

import (
	"chatgpt2api/internal/storage"
	"errors"
	"sync"
)

const (
	creditsDocumentName = "credits/state.json"
	// creditsLedgerDocumentName is a JSON document (entries array), not pure JSONL when using storage.Backend.
	CreditReasonSignup              = "signup"
	CreditReasonCheckin             = "checkin"
	CreditReasonInvite              = "invite"
	CreditReasonCardRedeem          = "card_redeem"
	CreditReasonPaymentRecharge     = "payment_recharge"
	CreditReasonAdminManualAdjust   = "admin_manual_adjust"
	CreditReasonImageGeneration     = "image_generation"
	CreditReasonImageEdit           = "image_edit"
	CreditReasonImageRefund         = "image_refund"
	CreditReasonVideoGeneration     = "video_generation"
	CreditReasonVideoRefund         = "video_refund"
	CreditCardStatusActive          = "active"
	CreditCardStatusUsed            = "used"
	CreditCardStatusDisabled        = "disabled"
	DefaultSignupCreditAmount         = 10
	DefaultDailyCheckinCreditAmount   = 1
	DefaultInviteCreditAmount         = 10
	maxInMemoryCreditLedgerEntries    = 2048
	trimInMemoryCreditLedgerThreshold = 2560
)

var (
	ErrInsufficientCredits = errors.New("insufficient credits")
	ErrCreditCardNotFound  = errors.New("credit card not found")
	ErrCreditCardInactive  = errors.New("credit card is not active")
)

type CreditAccount struct {
	UserID    string `json:"user_id"`
	Balance   int    `json:"balance"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type CreditLedgerEntry struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	Delta        int    `json:"delta"`
	BalanceAfter int    `json:"balance_after"`
	Reason       string `json:"reason"`
	RefID        string `json:"ref_id"`
	CreatedAt    string `json:"created_at"`
}

type CreditCard struct {
	ID        string `json:"id"`
	Key       string `json:"key,omitempty"`
	CodeHash  string `json:"code_hash"`
	Amount    int    `json:"amount"`
	Status    string `json:"status"`
	UsedBy    string `json:"used_by"`
	UsedAt    string `json:"used_at"`
	CreatedAt string `json:"created_at"`
}

type GeneratedCreditCard struct {
	Card CreditCard `json:"card"`
	Key  string     `json:"key"`
}

type CreditService struct {
	mu      sync.Mutex
	dataDir string
	store   storage.JSONDocumentBackend
	// ledgerStore is optional (SQLite/MySQL/Postgres). When set, append/query go through
	// the credit_ledger table instead of rewriting credits/ledger.json.
	ledgerStore  storage.CreditLedgerBackend
	paymentStore storage.PaymentBackend
	state        creditState
	// storeReady is false when the initial load failed. Saves are refused so a
	// transient read error cannot wipe balances / cards with an empty state.
	storeReady bool
	// ledgerPersisted is the number of in-memory ledger rows already flushed to durable storage.
	// New rows are append-only so we do not rewrite the full ledger on every charge.
	ledgerPersisted int
	// ledgerTableBacked is true when durable ledger history lives in ledgerStore (credit_ledger table),
	// allowing state.Ledger to hold only a bounded recent window while historical lookups use SQL.
	ledgerTableBacked bool
	// ledgerRefIndex maps user|reason|ref_id -> ledger index for O(1) DeductOnce/AddOnce.
	ledgerRefIndex map[string]int
}

type creditState struct {
	Accounts map[string]CreditAccount `json:"accounts"`
	Ledger   []CreditLedgerEntry      `json:"ledger"`
	Cards    map[string]CreditCard    `json:"cards"`
	Invites  map[string]string        `json:"invites"`
}

func NewCreditService(dataDir string, backend ...storage.Backend) *CreditService {
	service := &CreditService{
		dataDir:      dataDir,
		store:        firstJSONDocumentStore(backend),
		ledgerStore:  firstCreditLedgerStore(backend),
		paymentStore: firstPaymentStore(backend),
		state:        emptyCreditState(),
	}
	service.state, service.storeReady = service.load()
	service.rebuildLedgerRefIndexLocked()
	return service
}

func ledgerRefKey(userID, reason, refID string) string {
	return userID + "\x00" + reason + "\x00" + refID
}

func (s *CreditService) rebuildLedgerRefIndexLocked() {
	s.ledgerRefIndex = make(map[string]int, len(s.state.Ledger))
	for i, entry := range s.state.Ledger {
		if entry.UserID == "" || entry.Reason == "" || entry.RefID == "" {
			continue
		}
		s.ledgerRefIndex[ledgerRefKey(entry.UserID, entry.Reason, entry.RefID)] = i
	}
}

func (s *CreditService) trimInMemoryLedgerLocked() {
	if !s.ledgerTableBacked || len(s.state.Ledger) <= trimInMemoryCreditLedgerThreshold {
		return
	}
	if s.ledgerPersisted < len(s.state.Ledger) {
		return
	}
	trimmed := make([]CreditLedgerEntry, maxInMemoryCreditLedgerEntries)
	copy(trimmed, s.state.Ledger[len(s.state.Ledger)-maxInMemoryCreditLedgerEntries:])
	s.state.Ledger = trimmed
	s.ledgerPersisted = len(trimmed)
	s.rebuildLedgerRefIndexLocked()
}

func (s *CreditService) findLedgerByRefLocked(userID, reason, refID string) (CreditLedgerEntry, bool, error) {
	if s.ledgerRefIndex == nil {
		s.rebuildLedgerRefIndexLocked()
	}
	if idx, ok := s.ledgerRefIndex[ledgerRefKey(userID, reason, refID)]; ok && idx >= 0 && idx < len(s.state.Ledger) {
		return s.state.Ledger[idx], true, nil
	}
	if s.ledgerTableBacked && s.ledgerStore != nil {
		row, found, err := s.ledgerStore.FindCreditLedgerByRef(userID, reason, refID)
		if err != nil {
			return CreditLedgerEntry{}, false, err
		}
		if !found {
			return CreditLedgerEntry{}, false, nil
		}
		return CreditLedgerEntry{
			ID:           row.ID,
			UserID:       row.UserID,
			Delta:        row.Delta,
			BalanceAfter: row.BalanceAfter,
			Reason:       row.Reason,
			RefID:        row.RefID,
			CreatedAt:    row.CreatedAt,
		}, true, nil
	}
	return CreditLedgerEntry{}, false, nil
}

// StoreReady reports whether credit state was loaded successfully from storage.
func (s *CreditService) StoreReady() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.storeReady
}
