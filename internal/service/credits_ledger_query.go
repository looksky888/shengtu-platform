package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

// CreditLedgerQuery controls server-side ledger listing (admin + profile).
type CreditLedgerQuery struct {
	Page     int
	PageSize int
	// UserID when set restricts results to one user (profile ledger).
	UserID  string
	Keyword string
	Reason  string
	StartAt string
	EndAt   string
}

// CreditLedgerPage is the paginated admin ledger response.
type CreditLedgerPage struct {
	Items    []CreditLedgerEntry `json:"items"`
	Total    int                 `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
}

const (
	defaultCreditLedgerPageSize = 20
	maxCreditLedgerPageSize     = 100
)

// QueryLedger filters, sorts, and pages ledger rows.
// When credit_ledger table is available (phase D), queries run in the database;
// otherwise filters the in-memory snapshot (JSON backend / tests).
func (s *CreditService) QueryLedger(query CreditLedgerQuery) (CreditLedgerPage, error) {
	page, pageSize, err := normalizeCreditLedgerPagination(query.Page, query.PageSize)
	if err != nil {
		return CreditLedgerPage{}, err
	}
	startAt, err := parseCreditLedgerBound(query.StartAt, false)
	if err != nil {
		return CreditLedgerPage{}, fmt.Errorf("start_at 无效")
	}
	endAt, err := parseCreditLedgerBound(query.EndAt, true)
	if err != nil {
		return CreditLedgerPage{}, fmt.Errorf("end_at 无效")
	}
	if startAt != nil && endAt != nil && startAt.After(*endAt) {
		return CreditLedgerPage{}, fmt.Errorf("start_at 不能晚于 end_at")
	}

	keyword := strings.ToLower(util.Clean(query.Keyword))
	reason := util.Clean(query.Reason)
	userID := util.Clean(query.UserID)

	// Prefer DB-backed query when the table store is wired.
	s.mu.Lock()
	ledgerStore := s.ledgerStore
	s.mu.Unlock()
	if ledgerStore != nil {
		filter := storage.CreditLedgerFilter{
			UserID:   userID,
			Keyword:  keyword,
			Reason:   reason,
			Page:     page,
			PageSize: pageSize,
		}
		// Date-only inputs stay as YYYY-MM-DD so SQL can match both ISO and local wall-clock rows.
		if startAt != nil {
			if raw := util.Clean(query.StartAt); len(raw) == 10 {
				filter.StartAt = raw
			} else {
				filter.StartAt = formatCreditLedgerSQLBound(*startAt)
			}
		}
		if endAt != nil {
			if raw := util.Clean(query.EndAt); len(raw) == 10 {
				filter.EndAt = raw
			} else {
				filter.EndAt = formatCreditLedgerSQLBound(*endAt)
			}
		}
		rows, total, qerr := ledgerStore.QueryCreditLedger(filter)
		if qerr != nil {
			return CreditLedgerPage{}, fmt.Errorf("查询积分流水失败: %w", qerr)
		}
		items := ledgerRowsToEntries(rows)
		if items == nil {
			items = []CreditLedgerEntry{}
		}
		return CreditLedgerPage{
			Items:    items,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		}, nil
	}

	s.mu.Lock()
	snapshot := append([]CreditLedgerEntry(nil), s.state.Ledger...)
	s.mu.Unlock()

	filtered := make([]CreditLedgerEntry, 0, len(snapshot))
	for _, entry := range snapshot {
		if userID != "" && entry.UserID != userID {
			continue
		}
		if reason != "" && entry.Reason != reason {
			continue
		}
		if !creditLedgerInTimeRange(entry.CreatedAt, startAt, endAt) {
			continue
		}
		if keyword != "" && !creditLedgerMatchesKeyword(entry, keyword) {
			continue
		}
		filtered = append(filtered, entry)
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].CreatedAt != filtered[j].CreatedAt {
			return filtered[i].CreatedAt > filtered[j].CreatedAt
		}
		return filtered[i].ID > filtered[j].ID
	})

	total := len(filtered)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	items := filtered[start:end]
	if items == nil {
		items = []CreditLedgerEntry{}
	}
	return CreditLedgerPage{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// formatCreditLedgerSQLBound produces a created_at-comparable string for SQL range filters.
// Uses RFC3339Nano in China time so it aligns with util.NowISO() write path.
func formatCreditLedgerSQLBound(t time.Time) string {
	return t.In(util.ChinaLocation()).Format(time.RFC3339Nano)
}

func normalizeCreditLedgerPagination(page, pageSize int) (int, int, error) {
	if page == 0 {
		page = 1
	}
	if pageSize == 0 {
		pageSize = defaultCreditLedgerPageSize
	}
	if page < 1 {
		return 0, 0, fmt.Errorf("page 必须从 1 开始")
	}
	if pageSize < 1 || pageSize > maxCreditLedgerPageSize {
		return 0, 0, fmt.Errorf("page_size 必须在 1-%d 之间", maxCreditLedgerPageSize)
	}
	return page, pageSize, nil
}

func creditLedgerMatchesKeyword(entry CreditLedgerEntry, keyword string) bool {
	parts := []string{
		entry.ID,
		entry.UserID,
		entry.Reason,
		entry.RefID,
		strconv.Itoa(entry.Delta),
		strconv.Itoa(entry.BalanceAfter),
	}
	for _, part := range parts {
		if strings.Contains(strings.ToLower(part), keyword) {
			return true
		}
	}
	return false
}

func creditLedgerInTimeRange(createdAt string, startAt, endAt *time.Time) bool {
	if startAt == nil && endAt == nil {
		return true
	}
	ts, ok := parseCreditLedgerTimestamp(createdAt)
	if !ok {
		return false
	}
	if startAt != nil && ts.Before(*startAt) {
		return false
	}
	if endAt != nil && ts.After(*endAt) {
		return false
	}
	return true
}

func parseCreditLedgerBound(raw string, endOfDay bool) (*time.Time, error) {
	raw = util.Clean(raw)
	if raw == "" {
		return nil, nil
	}
	// Date-only YYYY-MM-DD → China day bounds.
	if len(raw) == 10 && raw[4] == '-' && raw[7] == '-' {
		loc := util.ChinaLocation()
		day, err := time.ParseInLocation("2006-01-02", raw, loc)
		if err != nil {
			return nil, err
		}
		if endOfDay {
			// Inclusive end: last nanosecond of the China calendar day.
			next := day.Add(24 * time.Hour).Add(-time.Nanosecond)
			return &next, nil
		}
		return &day, nil
	}
	ts, ok := parseCreditLedgerTimestamp(raw)
	if !ok {
		return nil, fmt.Errorf("invalid time")
	}
	return &ts, nil
}

func parseCreditLedgerTimestamp(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t, true
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, true
	}
	// Naive local wall clock (China) as used by util.NowLocal().
	loc := util.ChinaLocation()
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"2006-01-02",
	} {
		if t, err := time.ParseInLocation(layout, raw, loc); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
