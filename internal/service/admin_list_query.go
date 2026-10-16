package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// AdminListQuery is shared pagination for admin list endpoints.
// When PageSize is 0, the service returns the full filtered set (legacy clients).
type AdminListQuery struct {
	Page     int
	PageSize int
	Keyword  string
	// IncludeAccessTokenInKeyword allows callers with explicit token-view
	// permission to search the sensitive AccessToken field.
	IncludeAccessTokenInKeyword bool
	// Status for users: "", "all", "enabled", "disabled"
	// Status for accounts: "", "all", or account status text (正常/限流/异常/禁用)
	Status string
	// Provider for users only.
	Provider string
	// Type for accounts only (Free/Plus/...).
	Type string
	// StartAt/EndAt optional time bounds (same parsing as credit ledger).
	StartAt string
	EndAt   string

	// --- user cleanup filters (managed users list) ---
	// InactiveDaysMin: keep users idle at least this many calendar days (0 = off).
	// "Never active" (no last_used/created) counts as inactive.
	InactiveDaysMin int
	// CreditMax: when non-nil, users with balance <= *CreditMax match the credit clause.
	CreditMax *int
	// CleanupMatchAny: when both inactive and credit filters are set,
	// true = OR (default for cleanup presets), false = AND.
	CleanupMatchAny bool
}

const (
	defaultAdminListPageSize = 20
	maxAdminListPageSize     = 100
)

func normalizeAdminListPagination(page, pageSize int) (int, int, bool, error) {
	if page < 0 {
		return 0, 0, false, fmt.Errorf("page 无效")
	}
	if pageSize < 0 {
		return 0, 0, false, fmt.Errorf("page_size 无效")
	}
	if page == 0 {
		page = 1
	}
	// page_size == 0 → unlimited (legacy full list).
	if pageSize == 0 {
		return page, 0, true, nil
	}
	if pageSize > maxAdminListPageSize {
		return 0, 0, false, fmt.Errorf("page_size 必须在 1-%d 之间", maxAdminListPageSize)
	}
	return page, pageSize, false, nil
}

func pageSlice[T any](items []T, page, pageSize int, unlimited bool) []T {
	if unlimited || pageSize <= 0 {
		if items == nil {
			return []T{}
		}
		return items
	}
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
		return []T{}
	}
	return out
}

func adminListInTimeRange(raw any, startAt, endAt *time.Time) bool {
	if startAt == nil && endAt == nil {
		return true
	}
	text := strings.TrimSpace(fmt.Sprint(raw))
	if text == "" || text == "<nil>" {
		return false
	}
	return creditLedgerInTimeRange(text, startAt, endAt)
}

// ManagedUsersPage is the paginated admin users response.
// Production list path: QueryManagedUsersPage (lite index → page project).
// Full inventory: ListUsersTyped only (e.g. image owner name map).
type ManagedUsersPage struct {
	Items      []ManagedUserPublic `json:"items"`
	Total      int                 `json:"total"`
	Page       int                 `json:"page"`
	PageSize   int                 `json:"page_size"`
	UsageReady bool                `json:"usage_ready"`
}

// AccountsPage is the paginated admin accounts response.
type AccountsPage struct {
	Items    []AccountPublic `json:"items"`
	Total    int             `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"page_size"`
}

// QueryAccounts filters and pages public account records in memory.
func (s *AccountService) QueryAccounts(query AdminListQuery) (AccountsPage, error) {
	page, pageSize, unlimited, err := normalizeAdminListPagination(query.Page, query.PageSize)
	if err != nil {
		return AccountsPage{}, err
	}
	keyword := strings.ToLower(util.Clean(query.Keyword))
	typeFilter := util.Clean(query.Type)
	if typeFilter == "all" {
		typeFilter = ""
	}
	status := util.Clean(query.Status)
	if status == "all" {
		status = ""
	}

	all := s.ListAccountsTyped()
	filtered := make([]AccountPublic, 0, len(all))
	for _, acc := range all {
		if typeFilter != "" && acc.Type != typeFilter {
			continue
		}
		if status != "" && acc.Status != status {
			continue
		}
		if keyword != "" && !accountMatchesKeyword(acc, keyword, query.IncludeAccessTokenInKeyword) {
			continue
		}
		filtered = append(filtered, acc)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].Email != filtered[j].Email {
			return filtered[i].Email < filtered[j].Email
		}
		return filtered[i].ID < filtered[j].ID
	})

	items := pageSlice(filtered, page, pageSize, unlimited)
	outPageSize := pageSize
	if unlimited {
		outPageSize = len(items)
		if outPageSize == 0 {
			outPageSize = defaultAdminListPageSize
		}
	}
	return AccountsPage{
		Items:    items,
		Total:    len(filtered),
		Page:     page,
		PageSize: outPageSize,
	}, nil
}

func accountMatchesKeyword(acc AccountPublic, keyword string, includeAccessToken bool) bool {
	parts := []string{acc.ID, acc.Email, acc.Type, acc.Status}
	if includeAccessToken {
		parts = append(parts, acc.AccessToken)
	}
	for _, part := range parts {
		if strings.Contains(strings.ToLower(part), keyword) {
			return true
		}
	}
	return false
}
