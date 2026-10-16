package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// QueryManagedUsersPage filters and sorts a lightweight index, then projects only
// the requested page into typed responses (avoids full projection for all users).
//
// creditAboveMax is used when query.CreditMax != nil: user ids with balance >
// *CreditMax (from CreditService.IDsWithBalanceAbove). Missing id ⇒ balance 0.
// Pass nil when no credit filter is active.
//
// Lock strategy: snapshot lite index under lock, filter/sort unlocked, then
// re-lock only to project the page (keeps auth mutex free during O(n) filter).
func (s *AuthService) QueryManagedUsersPage(query AdminListQuery, creditAboveMax map[string]struct{}) (ManagedUsersPage, error) {
	page, pageSize, err := normalizeManagedUsersPage(query)
	if err != nil {
		return ManagedUsersPage{}, err
	}
	startAt, endAt, err := managedUsersTimeBounds(query)
	if err != nil {
		return ManagedUsersPage{}, err
	}
	keyword := strings.ToLower(util.Clean(query.Keyword))
	provider := util.Clean(query.Provider)
	if provider == "all" {
		provider = ""
	}
	status := util.Clean(query.Status)
	if status == "all" {
		status = ""
	}
	now := time.Now()

	// Snapshot lite index quickly; heavy filter/sort runs without holding s.mu.
	s.mu.Lock()
	lites := listManagedUserLitesLocked(s.items, s.roles, s.accounts)
	s.mu.Unlock()

	filtered := make([]managedUserLite, 0, len(lites))
	for _, row := range lites {
		if !managedUserLiteMatches(row, provider, status, keyword, startAt, endAt) {
			continue
		}
		if !managedUserMatchesCleanup(row, query, creditAboveMax, now) {
			continue
		}
		filtered = append(filtered, row)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].CreatedAt != filtered[j].CreatedAt {
			return filtered[i].CreatedAt > filtered[j].CreatedAt
		}
		return filtered[i].ID > filtered[j].ID
	})
	total := len(filtered)
	pageLites := pageSlice(filtered, page, pageSize, false)
	ids := make([]string, 0, len(pageLites))
	for _, row := range pageLites {
		ids = append(ids, row.ID)
	}

	s.mu.Lock()
	items := projectManagedUsersByIDsLocked(s.items, s.roles, s.accounts, ids)
	// Attach inactive_days for cleanup UI (page only); reuse lite timestamps by id.
	liteByID := make(map[string]managedUserLite, len(pageLites))
	for _, row := range pageLites {
		liteByID[row.ID] = row
	}
	for i := range items {
		if row, ok := liteByID[items[i].ID]; ok {
			items[i].InactiveDays = managedUserInactiveDays(row, now)
		} else {
			items[i].InactiveDays = inactiveDaysSince(items[i].LastUsedAt, items[i].CreatedAt, now)
		}
	}
	s.mu.Unlock()

	return ManagedUsersPage{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func normalizeManagedUsersPage(query AdminListQuery) (int, int, error) {
	page, pageSize, _, err := normalizeAdminListPagination(query.Page, query.PageSize)
	if err != nil {
		return 0, 0, err
	}
	if pageSize == 0 {
		pageSize = defaultAdminListPageSize
	}
	return page, pageSize, nil
}

func managedUsersTimeBounds(query AdminListQuery) (startAt, endAt *time.Time, err error) {
	startAt, err = parseCreditLedgerBound(query.StartAt, false)
	if err != nil {
		return nil, nil, fmt.Errorf("start_at 无效")
	}
	endAt, err = parseCreditLedgerBound(query.EndAt, true)
	if err != nil {
		return nil, nil, fmt.Errorf("end_at 无效")
	}
	if startAt != nil && endAt != nil && startAt.After(*endAt) {
		return nil, nil, fmt.Errorf("start_at 不能晚于 end_at")
	}
	return startAt, endAt, nil
}
