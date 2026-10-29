package service

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"chatgpt2api/internal/util"
)

type creditCoreState struct {
	Accounts       map[string]CreditAccount `json:"accounts"`
	Cards          map[string]CreditCard    `json:"cards"`
	Invites        map[string]string        `json:"invites"`
	LedgerMigrated bool                     `json:"ledger_migrated,omitempty"`
}

func (s *CreditService) load() (creditState, bool) {
	path := filepath.Join(s.dataDir, "credits", "state.json")
	raw, err := loadStoredJSONWithError(s.store, creditsDocumentName, path)
	if err != nil {
		return emptyCreditState(), false
	}
	state := emptyCreditState()
	root := util.StringMap(raw)
	for _, item := range util.AsMapSlice(root["accounts"]) {
		account := normalizeCreditAccount(item)
		if account.UserID != "" {
			state.Accounts[account.UserID] = account
		}
	}
	for key, value := range util.StringMap(root["accounts"]) {
		account := normalizeCreditAccount(util.StringMap(value))
		if account.UserID == "" {
			account.UserID = util.Clean(key)
		}
		if account.UserID != "" {
			state.Accounts[account.UserID] = account
		}
	}
	for _, item := range util.AsMapSlice(root["ledger"]) {
		entry := normalizeCreditLedgerEntry(item)
		if entry.ID != "" && entry.UserID != "" {
			state.Ledger = append(state.Ledger, entry)
		}
	}
	for _, item := range util.AsMapSlice(root["cards"]) {
		card := normalizeCreditCard(item)
		if card.ID != "" {
			state.Cards[card.ID] = card
		}
	}
	for key, value := range util.StringMap(root["cards"]) {
		card := normalizeCreditCard(util.StringMap(value))
		if card.ID == "" {
			card.ID = util.Clean(key)
		}
		if card.ID != "" {
			state.Cards[card.ID] = card
		}
	}
	for key, value := range util.StringMap(root["invites"]) {
		code := strings.ToLower(util.Clean(key))
		userID := util.Clean(value)
		if code != "" && userID != "" {
			state.Invites[code] = userID
		}
	}

	if s.ledgerStore != nil {
		tableCount, err := s.ledgerStore.CountCreditLedger()
		if err != nil {
			return emptyCreditState(), false
		}
		if tableCount > 0 {
			if len(state.Ledger) > 0 {
				if err := s.ledgerStore.AppendCreditLedger(entriesToLedgerRows(state.Ledger)); err != nil {
					return emptyCreditState(), false
				}
			}
			latestRows, err := s.ledgerStore.LatestCreditLedgerByUser()
			if err != nil {
				return emptyCreditState(), false
			}
			reconcileCreditBalancesFromEntries(&state, ledgerRowsToEntries(latestRows))
			redeemRows, err := s.ledgerStore.LoadCreditLedgerByReason(CreditReasonCardRedeem)
			if err != nil {
				return emptyCreditState(), false
			}
			reconcileRedeemedCardsFromEntries(&state, ledgerRowsToEntries(redeemRows))
			recentRows, err := s.ledgerStore.LoadRecentCreditLedger(maxInMemoryCreditLedgerEntries)
			if err != nil {
				return emptyCreditState(), false
			}
			state.Ledger = ledgerRowsToEntries(recentRows)
			s.ledgerTableBacked = true
			s.ledgerPersisted = len(state.Ledger)
			return state, true
		}

		fileEntries, ledgerOK := s.loadLedgerFile()
		if !ledgerOK {
			return emptyCreditState(), false
		}
		mergeAndSortCreditLedger(&state, fileEntries)
		if len(state.Ledger) > 0 {
			if err := s.ledgerStore.ReplaceCreditLedger(entriesToLedgerRows(state.Ledger)); err != nil {
				return emptyCreditState(), false
			}
			_ = s.clearLegacyLedgerDocument()
		}
		reconcileCreditBalancesFromLedger(&state)
		reconcileRedeemedCardsFromEntries(&state, state.Ledger)
		if len(state.Ledger) > maxInMemoryCreditLedgerEntries {
			trimmed := make([]CreditLedgerEntry, maxInMemoryCreditLedgerEntries)
			copy(trimmed, state.Ledger[len(state.Ledger)-maxInMemoryCreditLedgerEntries:])
			state.Ledger = trimmed
		}
		s.ledgerTableBacked = true
		s.ledgerPersisted = len(state.Ledger)
		return state, true
	}

	fileEntries, ledgerOK := s.loadLedgerFile()
	if !ledgerOK {
		return emptyCreditState(), false
	}
	mergeAndSortCreditLedger(&state, fileEntries)
	reconcileCreditBalancesFromLedger(&state)
	reconcileRedeemedCardsFromEntries(&state, state.Ledger)
	s.ledgerTableBacked = false
	if len(fileEntries) > 0 {
		s.ledgerPersisted = len(state.Ledger)
	} else {
		s.ledgerPersisted = 0
	}
	return state, true
}

func mergeAndSortCreditLedger(state *creditState, fileEntries []CreditLedgerEntry) {
	if len(fileEntries) > 0 {
		byID := make(map[string]CreditLedgerEntry, len(fileEntries)+len(state.Ledger))
		for _, entry := range fileEntries {
			byID[entry.ID] = entry
		}
		for _, entry := range state.Ledger {
			if _, exists := byID[entry.ID]; !exists {
				byID[entry.ID] = entry
			}
		}
		state.Ledger = state.Ledger[:0]
		for _, entry := range byID {
			state.Ledger = append(state.Ledger, entry)
		}
	}
	sort.SliceStable(state.Ledger, func(i, j int) bool {
		if state.Ledger[i].CreatedAt != state.Ledger[j].CreatedAt {
			return state.Ledger[i].CreatedAt < state.Ledger[j].CreatedAt
		}
		return state.Ledger[i].ID < state.Ledger[j].ID
	})
}

func reconcileRedeemedCardsFromEntries(state *creditState, entries []CreditLedgerEntry) {
	// A crash can persist the redeem ledger before the card/core document.
	// Replaying the ledger makes the card terminal state durable on next start.
	for _, entry := range entries {
		if entry.Reason != CreditReasonCardRedeem {
			continue
		}
		if card, ok := state.Cards[entry.RefID]; ok && card.Status == CreditCardStatusActive {
			card.Status = CreditCardStatusUsed
			card.UsedBy = entry.UserID
			card.UsedAt = entry.CreatedAt
			state.Cards[entry.RefID] = card
		}
	}
}

// saveLocked persists ledger first, then core balances. If the core write fails,
// it rolls back only the newly appended rows (table backend) or rewrites the prefix (legacy file backend).
func (s *CreditService) saveLocked(state creditState) error {
	if !s.storeReady {
		return fmt.Errorf("积分数据未成功加载，已拒绝写入以防清空存储")
	}
	previousPersisted := s.ledgerPersisted
	appendedIDs, err := s.persistLedgerAppend(state)
	if err != nil {
		s.ledgerPersisted = previousPersisted
		return err
	}
	path := filepath.Join(s.dataDir, "credits", "state.json")
	core := creditCoreState{
		Accounts: state.Accounts, Cards: state.Cards, Invites: state.Invites, LedgerMigrated: true,
	}
	if err := saveStoredJSON(s.store, creditsDocumentName, path, core); err != nil {
		if s.ledgerTableBacked && s.ledgerStore != nil {
			if rollbackErr := s.ledgerStore.DeleteCreditLedgerByIDs(appendedIDs); rollbackErr != nil {
				s.ledgerPersisted = len(state.Ledger)
				return fmt.Errorf("保存积分余额失败且回滚流水失败: %v (rollback: %w)", err, rollbackErr)
			}
			s.ledgerPersisted = previousPersisted
			return err
		}
		var rollback []CreditLedgerEntry
		if previousPersisted > 0 && previousPersisted <= len(state.Ledger) {
			rollback = state.Ledger[:previousPersisted]
		}
		if rollbackErr := s.rewriteLedgerFile(rollback); rollbackErr != nil {
			s.ledgerPersisted = len(state.Ledger)
			return fmt.Errorf("保存积分余额失败且回滚流水失败: %v (rollback: %w)", err, rollbackErr)
		}
		s.ledgerPersisted = previousPersisted
		return err
	}
	s.ledgerPersisted = len(state.Ledger)
	return nil
}

func emptyCreditState() creditState {
	return creditState{
		Accounts: map[string]CreditAccount{}, Ledger: []CreditLedgerEntry{},
		Cards: map[string]CreditCard{}, Invites: map[string]string{},
	}
}

// cloneCreditState shares the ledger backing array. Appends must cap capacity or
// mutate the live state with rollback so a failed save cannot grow it in place.
func cloneCreditState(state creditState) creditState {
	next := emptyCreditState()
	for userID, account := range state.Accounts {
		next.Accounts[userID] = account
	}
	next.Ledger = state.Ledger
	for id, card := range state.Cards {
		next.Cards[id] = card
	}
	for code, userID := range state.Invites {
		next.Invites[code] = userID
	}
	return next
}

func normalizeCreditAccount(item map[string]any) CreditAccount {
	return CreditAccount{
		UserID: util.Clean(item["user_id"]), Balance: util.ToInt(item["balance"], 0),
		CreatedAt: util.Clean(item["created_at"]), UpdatedAt: util.Clean(item["updated_at"]),
	}
}

func normalizeCreditLedgerEntry(item map[string]any) CreditLedgerEntry {
	return CreditLedgerEntry{
		ID: util.Clean(item["id"]), UserID: util.Clean(item["user_id"]),
		Delta: util.ToInt(item["delta"], 0), BalanceAfter: util.ToInt(item["balance_after"], 0),
		Reason: util.Clean(item["reason"]), RefID: util.Clean(item["ref_id"]),
		CreatedAt: util.Clean(item["created_at"]),
	}
}

func normalizeCreditCard(item map[string]any) CreditCard {
	status := util.Clean(item["status"])
	if status == "" {
		status = CreditCardStatusActive
	}
	return CreditCard{
		ID: util.Clean(item["id"]), Key: "", CodeHash: util.Clean(item["code_hash"]),
		Amount: util.ToInt(item["amount"], 0), Status: status, UsedBy: util.Clean(item["used_by"]),
		UsedAt: util.Clean(item["used_at"]), CreatedAt: util.Clean(item["created_at"]),
	}
}
