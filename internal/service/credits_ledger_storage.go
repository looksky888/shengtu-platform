package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const creditsLedgerDocumentName = "credits/ledger.json"

// loadLedgerEntries returns ledger rows, whether the load is trustworthy, and
// whether the rows came from the credit_ledger table (vs document/jsonl).
// Missing ledger is OK (empty). Unreadable storage is not (storeReady=false).
func (s *CreditService) loadLedgerEntries() ([]CreditLedgerEntry, bool, bool) {
	if s.ledgerStore != nil {
		rows, err := s.ledgerStore.LoadCreditLedger()
		if err != nil {
			return nil, false, false
		}
		if len(rows) > 0 {
			return ledgerRowsToEntries(rows), true, true
		}
		legacy, ok := s.loadLedgerFile()
		return legacy, ok, false
	}
	legacy, ok := s.loadLedgerFile()
	return legacy, ok, false
}

func (s *CreditService) loadLedgerFile() ([]CreditLedgerEntry, bool) {
	if s.store != nil {
		raw, err := s.store.LoadJSONDocument(creditsLedgerDocumentName)
		if err != nil {
			return nil, false
		}
		if raw != nil {
			switch value := raw.(type) {
			case map[string]any:
				var out []CreditLedgerEntry
				for _, item := range util.AsMapSlice(value["entries"]) {
					if entry := normalizeCreditLedgerEntry(item); entry.ID != "" && entry.UserID != "" {
						out = append(out, entry)
					}
				}
				if len(out) > 0 {
					return out, true
				}
				if text, ok := value["lines"].(string); ok && strings.TrimSpace(text) != "" {
					return parseLedgerJSONL(text), true
				}
				return nil, true
			case string:
				return parseLedgerJSONL(value), true
			}
			return nil, true
		}
	}
	data, err := os.ReadFile(s.ledgerFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, true
		}
		return nil, false
	}
	return parseLedgerJSONL(string(data)), true
}

func (s *CreditService) clearLegacyLedgerDocument() error {
	if s.store == nil {
		return nil
	}
	return s.store.SaveJSONDocument(creditsLedgerDocumentName, map[string]any{
		"entries":           []any{},
		"migrated_to_table": true,
	})
}

func entriesToLedgerRows(entries []CreditLedgerEntry) []storage.CreditLedgerRow {
	out := make([]storage.CreditLedgerRow, 0, len(entries))
	for _, entry := range entries {
		if entry.ID == "" || entry.UserID == "" {
			continue
		}
		out = append(out, storage.CreditLedgerRow{
			ID: entry.ID, UserID: entry.UserID, Delta: entry.Delta, BalanceAfter: entry.BalanceAfter,
			Reason: entry.Reason, RefID: entry.RefID, CreatedAt: entry.CreatedAt,
		})
	}
	return out
}

func ledgerRowsToEntries(rows []storage.CreditLedgerRow) []CreditLedgerEntry {
	out := make([]CreditLedgerEntry, 0, len(rows))
	for _, row := range rows {
		if row.ID == "" || row.UserID == "" {
			continue
		}
		out = append(out, CreditLedgerEntry{
			ID: row.ID, UserID: row.UserID, Delta: row.Delta, BalanceAfter: row.BalanceAfter,
			Reason: row.Reason, RefID: row.RefID, CreatedAt: row.CreatedAt,
		})
	}
	return out
}

func reconcileCreditBalancesFromLedger(state *creditState) {
	if state == nil {
		return
	}
	reconcileCreditBalancesFromEntries(state, state.Ledger)
}

func reconcileCreditBalancesFromEntries(state *creditState, entries []CreditLedgerEntry) {
	if state == nil || len(entries) == 0 {
		return
	}
	lastByUser := map[string]CreditLedgerEntry{}
	for _, entry := range entries {
		if entry.UserID != "" {
			lastByUser[entry.UserID] = entry
		}
	}
	if state.Accounts == nil {
		state.Accounts = map[string]CreditAccount{}
	}
	for userID, entry := range lastByUser {
		account, exists := state.Accounts[userID]
		if !exists {
			account = CreditAccount{UserID: userID, CreatedAt: entry.CreatedAt}
		}
		if exists && account.UpdatedAt != "" && entry.CreatedAt <= account.UpdatedAt {
			continue
		}
		if account.Balance != entry.BalanceAfter {
			account.Balance = entry.BalanceAfter
			if account.UpdatedAt == "" || account.UpdatedAt < entry.CreatedAt {
				account.UpdatedAt = entry.CreatedAt
			}
			state.Accounts[userID] = account
		} else if !exists {
			state.Accounts[userID] = account
		}
	}
}

func parseLedgerJSONL(text string) []CreditLedgerEntry {
	var out []CreditLedgerEntry
	scanner := bufio.NewScanner(strings.NewReader(text))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var item map[string]any
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			continue
		}
		entry := normalizeCreditLedgerEntry(item)
		if entry.ID != "" && entry.UserID != "" {
			out = append(out, entry)
		}
	}
	return out
}

func (s *CreditService) ledgerFilePath() string {
	return filepath.Join(s.dataDir, "credits", "ledger.jsonl")
}

func (s *CreditService) persistLedgerAppend(state creditState) ([]string, error) {
	if s.ledgerTableBacked && s.ledgerStore != nil {
		start := s.ledgerPersisted
		if start < 0 || start > len(state.Ledger) {
			start = 0
		}
		delta := state.Ledger[start:]
		if len(delta) == 0 {
			return nil, nil
		}
		appendedIDs := make([]string, 0, len(delta))
		for _, entry := range delta {
			if entry.ID != "" {
				appendedIDs = append(appendedIDs, entry.ID)
			}
		}
		if err := s.ledgerStore.AppendCreditLedger(entriesToLedgerRows(delta)); err != nil {
			return nil, err
		}
		s.ledgerPersisted = len(state.Ledger)
		return appendedIDs, nil
	}
	if s.ledgerPersisted <= 0 || s.ledgerPersisted > len(state.Ledger) {
		return nil, s.rewriteLedgerFile(state.Ledger)
	}
	if s.ledgerPersisted == len(state.Ledger) {
		return nil, nil
	}
	if err := s.appendLedgerEntries(state.Ledger[s.ledgerPersisted:]); err != nil {
		return nil, err
	}
	s.ledgerPersisted = len(state.Ledger)
	return nil, nil
}

func (s *CreditService) rewriteLedgerFile(entries []CreditLedgerEntry) error {
	if s.ledgerStore != nil {
		if err := s.ledgerStore.ReplaceCreditLedger(entriesToLedgerRows(entries)); err != nil {
			return err
		}
		s.ledgerPersisted = len(entries)
		return nil
	}
	if s.store != nil {
		if err := s.store.SaveJSONDocument(creditsLedgerDocumentName, map[string]any{"entries": entries}); err != nil {
			return err
		}
		s.ledgerPersisted = len(entries)
		return nil
	}
	var builder strings.Builder
	for _, entry := range entries {
		line, err := json.Marshal(entry)
		if err != nil {
			return err
		}
		builder.Write(line)
		builder.WriteByte('\n')
	}
	path := s.ledgerFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := storage.AtomicWriteFile(path, []byte(builder.String()), 0o644); err != nil {
		return err
	}
	s.ledgerPersisted = len(entries)
	return nil
}

func (s *CreditService) appendLedgerEntries(entries []CreditLedgerEntry) error {
	if len(entries) == 0 {
		return nil
	}
	if s.ledgerStore != nil {
		return s.ledgerStore.AppendCreditLedger(entriesToLedgerRows(entries))
	}
	if s.store != nil {
		all, ok := s.loadLedgerFile()
		if !ok {
			return fmt.Errorf("读取积分流水失败，已拒绝追加")
		}
		seen := map[string]struct{}{}
		merged := make([]CreditLedgerEntry, 0, len(all)+len(entries))
		for _, entry := range append(all, entries...) {
			if entry.ID == "" {
				continue
			}
			if _, exists := seen[entry.ID]; exists {
				continue
			}
			seen[entry.ID] = struct{}{}
			merged = append(merged, entry)
		}
		return s.rewriteLedgerFile(merged)
	}
	path := s.ledgerFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	for _, entry := range entries {
		line, err := json.Marshal(entry)
		if err != nil {
			return err
		}
		if _, err := file.Write(append(line, '\n')); err != nil {
			return err
		}
	}
	return file.Sync()
}
