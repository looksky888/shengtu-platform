package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"sort"
	"time"
)

func (s *CreditService) Account(userID string) (CreditAccount, error) {
	userID = util.Clean(userID)
	if userID == "" {
		return CreditAccount{}, fmt.Errorf("请提供 user_id")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	account, ok := s.state.Accounts[userID]
	if !ok {
		account = CreditAccount{UserID: userID}
	}
	return account, nil
}

func (s *CreditService) Accounts() []CreditAccount {
	s.mu.Lock()
	defer s.mu.Unlock()

	items := make([]CreditAccount, 0, len(s.state.Accounts))
	for _, account := range s.state.Accounts {
		items = append(items, account)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].UserID < items[j].UserID })
	return items
}

// AccountsByUserIDs returns requested balances under one read lock.
func (s *CreditService) AccountsByUserIDs(userIDs []string) map[string]CreditAccount {
	result := make(map[string]CreditAccount, len(userIDs))
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, rawID := range userIDs {
		userID := util.Clean(rawID)
		if userID == "" {
			continue
		}
		account, ok := s.state.Accounts[userID]
		if !ok {
			account = CreditAccount{UserID: userID}
		}
		result[userID] = account
	}
	return result
}

// BalanceIndex snapshots user_id → balance for all credit accounts (one lock).
// Missing users are treated as balance 0 by callers — no need to list every user id first.
// Prefer IDsWithBalanceAbove for admin cleanup filters (smaller set when most balances are 0).
func (s *CreditService) BalanceIndex() map[string]int {
	if s == nil {
		return map[string]int{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]int, len(s.state.Accounts))
	for userID, account := range s.state.Accounts {
		out[userID] = account.Balance
	}
	return out
}

// IDsWithBalanceAbove returns user ids whose credit balance is strictly greater than max.
// Used by managed-user cleanup (credit_max): match ⇔ id not in this set (missing id ⇒ balance 0).
// Typically much smaller than BalanceIndex when most users sit at 0.
func (s *CreditService) IDsWithBalanceAbove(max int) map[string]struct{} {
	if s == nil {
		return map[string]struct{}{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]struct{})
	for userID, account := range s.state.Accounts {
		if account.Balance > max {
			out[userID] = struct{}{}
		}
	}
	return out
}

// CreditAboveMaxSet builds the same exclude set from a full balance map (tests / adapters).
func CreditAboveMaxSet(balances map[string]int, max int) map[string]struct{} {
	if len(balances) == 0 {
		return map[string]struct{}{}
	}
	out := make(map[string]struct{})
	for id, bal := range balances {
		if bal > max {
			out[id] = struct{}{}
		}
	}
	return out
}

func (s *CreditService) Add(userID string, amount int, reason, refID string) (CreditAccount, CreditLedgerEntry, error) {
	if amount <= 0 {
		return CreditAccount{}, CreditLedgerEntry{}, fmt.Errorf("金额必须为正数")
	}
	return s.changeBalance(userID, amount, reason, refID)
}

func (s *CreditService) Adjust(userID string, delta int, reason, refID string) (CreditAccount, CreditLedgerEntry, error) {
	if delta == 0 {
		return CreditAccount{}, CreditLedgerEntry{}, fmt.Errorf("调整量不能为 0")
	}
	reason = util.Clean(reason)
	if reason == "" {
		reason = CreditReasonAdminManualAdjust
	}
	return s.changeBalance(userID, delta, reason, refID)
}

func (s *CreditService) AddOnce(userID string, amount int, reason, refID string) (CreditAccount, CreditLedgerEntry, bool, error) {
	userID = util.Clean(userID)
	if amount <= 0 {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("金额必须为正数")
	}
	reason = util.Clean(reason)
	refID = util.Clean(refID)
	if reason == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("请填写原因")
	}
	if userID == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("请提供 user_id")
	}
	if refID == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("请提供 ref_id")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok, err := s.findLedgerByRefLocked(userID, reason, refID)
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	if ok {
		account, exists := s.state.Accounts[entry.UserID]
		if !exists {
			account = CreditAccount{UserID: entry.UserID}
		}
		return account, entry, false, nil
	}
	account, entry, err := s.changeBalanceLocked(userID, amount, reason, refID)
	return account, entry, err == nil, err
}

func (s *CreditService) Deduct(userID string, amount int, reason, refID string) (CreditAccount, CreditLedgerEntry, error) {
	if amount <= 0 {
		return CreditAccount{}, CreditLedgerEntry{}, fmt.Errorf("金额必须为正数")
	}
	return s.changeBalance(userID, -amount, reason, refID)
}

// DeductOnce deducts amount once for (userID, reason, refID). If the same triple already exists, returns the prior entry without charging again.
func (s *CreditService) DeductOnce(userID string, amount int, reason, refID string) (CreditAccount, CreditLedgerEntry, bool, error) {
	userID = util.Clean(userID)
	reason = util.Clean(reason)
	refID = util.Clean(refID)
	if amount <= 0 {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("金额必须为正数")
	}
	if reason == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("请填写原因")
	}
	if userID == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("请提供 user_id")
	}
	if refID == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("请提供 ref_id")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok, err := s.findLedgerByRefLocked(userID, reason, refID)
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	if ok {
		account, exists := s.state.Accounts[entry.UserID]
		if !exists {
			account = CreditAccount{UserID: entry.UserID}
		}
		return account, entry, false, nil
	}
	account, entry, err := s.changeBalanceLocked(userID, -amount, reason, refID)
	return account, entry, err == nil, err
}

func (s *CreditService) Ledger(userID string) []CreditLedgerEntry {
	userID = util.Clean(userID)
	if userID == "" {
		return []CreditLedgerEntry{}
	}

	s.mu.Lock()
	tableBacked := s.ledgerTableBacked && s.ledgerStore != nil
	ledgerStore := s.ledgerStore
	if !tableBacked {
		entries := make([]CreditLedgerEntry, 0)
		for _, entry := range s.state.Ledger {
			if entry.UserID == userID {
				entries = append(entries, entry)
			}
		}
		s.mu.Unlock()
		return entries
	}
	s.mu.Unlock()

	rows, err := ledgerStore.LoadCreditLedgerByUser(userID)
	if err == nil {
		entries := ledgerRowsToEntries(rows)
		if entries == nil {
			return []CreditLedgerEntry{}
		}
		return entries
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	entries := make([]CreditLedgerEntry, 0)
	for _, entry := range s.state.Ledger {
		if entry.UserID == userID {
			entries = append(entries, entry)
		}
	}
	return entries
}

func (s *CreditService) AllLedger() []CreditLedgerEntry {
	s.mu.Lock()
	tableBacked := s.ledgerTableBacked && s.ledgerStore != nil
	ledgerStore := s.ledgerStore
	if !tableBacked {
		entries := append([]CreditLedgerEntry(nil), s.state.Ledger...)
		s.mu.Unlock()
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].CreatedAt > entries[j].CreatedAt })
		return entries
	}
	s.mu.Unlock()

	if rows, err := ledgerStore.LoadCreditLedger(); err == nil {
		entries := ledgerRowsToEntries(rows)
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].CreatedAt > entries[j].CreatedAt })
		if entries == nil {
			return []CreditLedgerEntry{}
		}
		return entries
	}

	s.mu.Lock()
	entries := append([]CreditLedgerEntry(nil), s.state.Ledger...)
	s.mu.Unlock()
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].CreatedAt > entries[j].CreatedAt })
	return entries
}

func (s *CreditService) HasLedgerEntry(userID, reason, refID string) bool {
	userID = util.Clean(userID)
	reason = util.Clean(reason)
	refID = util.Clean(refID)
	if userID == "" || reason == "" || refID == "" {
		return false
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok, err := s.findLedgerByRefLocked(userID, reason, refID)
	return err == nil && ok
}

// RefundChargeByRef refunds a prior negative ledger row (e.g. image_generation) for the same
// ref_id, if it has not already been fully refunded via CreditReasonImageRefund + same ref.
// Used when a creation task is interrupted by process restart after deduct but before completion.
func (s *CreditService) RefundChargeByRef(userID, chargeReason, refID string) (bool, error) {
	return s.ReconcileCreationCharge(userID, chargeReason, refID, 1, 0)
}

// ReconcileCreationCharge idempotently restores the failed portion of one
// image/video charge. It is safe for both the request path and background
// reconciliation after a transient persistence failure.
func (s *CreditService) ReconcileCreationCharge(userID, chargeReason, refID string, billedCount, successCount int) (bool, error) {
	userID = util.Clean(userID)
	chargeReason = util.Clean(chargeReason)
	refID = util.Clean(refID)
	if userID == "" || chargeReason == "" || refID == "" {
		return false, fmt.Errorf("请提供 user_id / reason / ref_id")
	}

	s.mu.Lock()
	entry, ok, err := s.findLedgerByRefLocked(userID, chargeReason, refID)
	if err != nil {
		s.mu.Unlock()
		return false, err
	}
	if !ok || entry.Delta >= 0 {
		s.mu.Unlock()
		return false, nil
	}
	if billedCount < 1 {
		billedCount = 1
	}
	if successCount < 0 {
		successCount = 0
	}
	if successCount >= billedCount {
		s.mu.Unlock()
		return false, nil
	}
	refundReason := CreditReasonImageRefund
	if chargeReason == CreditReasonVideoGeneration {
		refundReason = CreditReasonVideoRefund
	}
	refundRefID := refID
	amount := -entry.Delta
	if successCount > 0 {
		unit := amount / billedCount
		if unit <= 0 {
			s.mu.Unlock()
			return false, nil
		}
		amount = unit * (billedCount - successCount)
		refundRefID = fmt.Sprintf("%s:partial:%d_of_%d", refID, successCount, billedCount)
	}
	refundedEntry, refunded, err := s.findLedgerByRefLocked(userID, refundReason, refundRefID)
	_ = refundedEntry
	if err != nil {
		s.mu.Unlock()
		return false, err
	}
	if refunded {
		s.mu.Unlock()
		return false, nil
	}
	s.mu.Unlock()

	_, _, awarded, err := s.AddOnce(userID, amount, refundReason, refundRefID)
	return awarded, err
}

func (s *CreditService) changeBalance(userID string, delta int, reason, refID string) (CreditAccount, CreditLedgerEntry, error) {
	userID = util.Clean(userID)
	reason = util.Clean(reason)
	refID = util.Clean(refID)
	if userID == "" {
		return CreditAccount{}, CreditLedgerEntry{}, fmt.Errorf("请提供 user_id")
	}
	if delta == 0 {
		return CreditAccount{}, CreditLedgerEntry{}, fmt.Errorf("金额必须为正数")
	}
	if reason == "" {
		return CreditAccount{}, CreditLedgerEntry{}, fmt.Errorf("请填写原因")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return s.changeBalanceLocked(userID, delta, reason, refID)
}

func (s *CreditService) changeBalanceLocked(userID string, delta int, reason, refID string) (CreditAccount, CreditLedgerEntry, error) {
	// In-place mutate under s.mu: append-only ledger is O(1) amortized.
	// On save failure, roll back the account map entry and truncate the new ledger row.
	prevAccount, hadAccount := s.state.Accounts[userID]
	now := nextCreditLedgerTimestamp(util.NowISO(), prevAccount.UpdatedAt)
	account := ensureCreditAccount(s.state, userID, now)
	nextBalance := account.Balance + delta
	if nextBalance < 0 {
		return account, CreditLedgerEntry{}, ErrInsufficientCredits
	}

	account.Balance = nextBalance
	account.UpdatedAt = now
	entry := CreditLedgerEntry{
		ID:           util.NewUUID(),
		UserID:       userID,
		Delta:        delta,
		BalanceAfter: nextBalance,
		Reason:       reason,
		RefID:        refID,
		CreatedAt:    now,
	}
	ledgerLen := len(s.state.Ledger)
	if s.state.Accounts == nil {
		s.state.Accounts = map[string]CreditAccount{}
	}
	s.state.Accounts[userID] = account
	s.state.Ledger = append(s.state.Ledger, entry)
	if err := s.saveLocked(s.state); err != nil {
		s.state.Ledger = s.state.Ledger[:ledgerLen]
		if hadAccount {
			s.state.Accounts[userID] = prevAccount
		} else {
			delete(s.state.Accounts, userID)
		}
		return CreditAccount{}, CreditLedgerEntry{}, err
	}
	if entry.RefID != "" {
		if s.ledgerRefIndex == nil {
			s.ledgerRefIndex = map[string]int{}
		}
		s.ledgerRefIndex[ledgerRefKey(userID, reason, entry.RefID)] = len(s.state.Ledger) - 1
	}
	s.trimInMemoryLedgerLocked()
	return account, entry, nil
}

func nextCreditLedgerTimestamp(now, previous string) string {
	current, currentErr := time.Parse(time.RFC3339Nano, now)
	prior, priorErr := time.Parse(time.RFC3339Nano, previous)
	if currentErr != nil || priorErr != nil || current.After(prior) {
		return now
	}
	return prior.Add(time.Nanosecond).Format(time.RFC3339Nano)
}

func ensureCreditAccount(state creditState, userID, now string) CreditAccount {
	if state.Accounts == nil {
		state.Accounts = map[string]CreditAccount{}
	}
	account, ok := state.Accounts[userID]
	if ok {
		return account
	}
	return CreditAccount{UserID: userID, CreatedAt: now, UpdatedAt: now}
}
