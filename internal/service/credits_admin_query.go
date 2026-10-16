package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"chatgpt2api/internal/util"
)

// CreditCardsQuery controls admin card listing (stage E).
type CreditCardsQuery struct {
	Page     int
	PageSize int
	Keyword  string
	Status   string
	StartAt  string
	EndAt    string
}

// CreditCardsPage is the paginated admin cards response.
type CreditCardsPage struct {
	Items       []CreditCard `json:"items"`
	Total       int          `json:"total"`
	Page        int          `json:"page"`
	PageSize    int          `json:"page_size"`
	ActiveCount int          `json:"active_count"`
	UsedCount   int          `json:"used_count"`
}

// CreditAccountsQuery controls admin credit-user listing (stage E).
type CreditAccountsQuery struct {
	Page     int
	PageSize int
	Keyword  string
	StartAt  string
	EndAt    string
}

// CreditAccountsPage is the paginated admin credit-users response.
type CreditAccountsPage struct {
	Items        []CreditAccount `json:"items"`
	Total        int             `json:"total"`
	Page         int             `json:"page"`
	PageSize     int             `json:"page_size"`
	TotalBalance int             `json:"total_balance"`
	AccountCount int             `json:"account_count"`
}

// QueryCards filters, sorts (created_at desc), and pages in-memory cards.
func (s *CreditService) QueryCards(query CreditCardsQuery) (CreditCardsPage, error) {
	page, pageSize, err := normalizeCreditLedgerPagination(query.Page, query.PageSize)
	if err != nil {
		return CreditCardsPage{}, err
	}
	startAt, err := parseCreditLedgerBound(query.StartAt, false)
	if err != nil {
		return CreditCardsPage{}, fmt.Errorf("start_at 无效")
	}
	endAt, err := parseCreditLedgerBound(query.EndAt, true)
	if err != nil {
		return CreditCardsPage{}, fmt.Errorf("end_at 无效")
	}
	if startAt != nil && endAt != nil && startAt.After(*endAt) {
		return CreditCardsPage{}, fmt.Errorf("start_at 不能晚于 end_at")
	}

	keyword := strings.ToLower(util.Clean(query.Keyword))
	status := util.Clean(query.Status)
	if status == "all" {
		status = ""
	}

	s.mu.Lock()
	snapshot := make([]CreditCard, 0, len(s.state.Cards))
	activeCount := 0
	usedCount := 0
	for _, card := range s.state.Cards {
		snapshot = append(snapshot, card)
		switch card.Status {
		case CreditCardStatusActive:
			activeCount++
		case CreditCardStatusUsed:
			usedCount++
		}
	}
	s.mu.Unlock()

	filtered := make([]CreditCard, 0, len(snapshot))
	for _, card := range snapshot {
		if status != "" && card.Status != status {
			continue
		}
		// Prefer created_at for time filter; fall back to used_at when created_at empty.
		ts := card.CreatedAt
		if ts == "" {
			ts = card.UsedAt
		}
		if !creditLedgerInTimeRange(ts, startAt, endAt) {
			continue
		}
		if keyword != "" && !creditCardMatchesKeyword(card, keyword) {
			continue
		}
		filtered = append(filtered, card)
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].CreatedAt != filtered[j].CreatedAt {
			return filtered[i].CreatedAt > filtered[j].CreatedAt
		}
		return filtered[i].ID > filtered[j].ID
	})

	items := pageCreditCards(filtered, page, pageSize)
	return CreditCardsPage{
		Items:       items,
		Total:       len(filtered),
		Page:        page,
		PageSize:    pageSize,
		ActiveCount: activeCount,
		UsedCount:   usedCount,
	}, nil
}

// QueryAccounts filters, sorts (user_id asc), and pages in-memory credit accounts.
func (s *CreditService) QueryAccounts(query CreditAccountsQuery) (CreditAccountsPage, error) {
	page, pageSize, err := normalizeCreditLedgerPagination(query.Page, query.PageSize)
	if err != nil {
		return CreditAccountsPage{}, err
	}
	startAt, err := parseCreditLedgerBound(query.StartAt, false)
	if err != nil {
		return CreditAccountsPage{}, fmt.Errorf("start_at 无效")
	}
	endAt, err := parseCreditLedgerBound(query.EndAt, true)
	if err != nil {
		return CreditAccountsPage{}, fmt.Errorf("end_at 无效")
	}
	if startAt != nil && endAt != nil && startAt.After(*endAt) {
		return CreditAccountsPage{}, fmt.Errorf("start_at 不能晚于 end_at")
	}

	keyword := strings.ToLower(util.Clean(query.Keyword))

	s.mu.Lock()
	snapshot := make([]CreditAccount, 0, len(s.state.Accounts))
	totalBalance := 0
	for _, account := range s.state.Accounts {
		snapshot = append(snapshot, account)
		totalBalance += account.Balance
	}
	accountCount := len(snapshot)
	s.mu.Unlock()

	filtered := make([]CreditAccount, 0, len(snapshot))
	for _, account := range snapshot {
		ts := account.UpdatedAt
		if ts == "" {
			ts = account.CreatedAt
		}
		if !creditLedgerInTimeRange(ts, startAt, endAt) {
			continue
		}
		if keyword != "" && !creditAccountMatchesKeyword(account, keyword) {
			continue
		}
		filtered = append(filtered, account)
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		return filtered[i].UserID < filtered[j].UserID
	})

	items := pageCreditAccounts(filtered, page, pageSize)
	return CreditAccountsPage{
		Items:        items,
		Total:        len(filtered),
		Page:         page,
		PageSize:     pageSize,
		TotalBalance: totalBalance,
		AccountCount: accountCount,
	}, nil
}

func creditCardMatchesKeyword(card CreditCard, keyword string) bool {
	parts := []string{
		card.ID,
		card.Key,
		card.Status,
		card.UsedBy,
		strconv.Itoa(card.Amount),
	}
	for _, part := range parts {
		if strings.Contains(strings.ToLower(part), keyword) {
			return true
		}
	}
	return false
}

func creditAccountMatchesKeyword(account CreditAccount, keyword string) bool {
	parts := []string{
		account.UserID,
		strconv.Itoa(account.Balance),
	}
	for _, part := range parts {
		if strings.Contains(strings.ToLower(part), keyword) {
			return true
		}
	}
	return false
}

func pageCreditCards(items []CreditCard, page, pageSize int) []CreditCard {
	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	out := items[start:end]
	if out == nil {
		return []CreditCard{}
	}
	return out
}

func pageCreditAccounts(items []CreditAccount, page, pageSize int) []CreditAccount {
	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	out := items[start:end]
	if out == nil {
		return []CreditAccount{}
	}
	return out
}
