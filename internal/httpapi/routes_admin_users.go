package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	base := "/api/admin/users"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			a.handleAdminUsersList(w, r)
		case http.MethodPost:
			a.handleAdminUsersCreate(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	parts := splitPath(r.URL.Path)
	if len(parts) < 4 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "users" {
		http.NotFound(w, r)
		return
	}
	// On-demand usage for current page (does not run on list open).
	if len(parts) == 4 && parts[3] == "usage" {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		a.handleAdminUsersUsage(w, r)
		return
	}
	userID := parts[3]
	if len(parts) == 5 && parts[4] == "key" {
		a.handleAdminUserRevealKey(w, r, userID)
		return
	}
	if len(parts) == 5 && parts[4] == "reset-key" {
		a.handleAdminUserResetKey(w, r, userID)
		return
	}
	if len(parts) != 4 {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPost:
		a.handleAdminUserUpdate(w, r, userID)
	case http.MethodDelete:
		a.handleAdminUserDelete(w, r, identity, userID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleAdminUsersList(w http.ResponseWriter, r *http.Request) {
	// List is intentionally usage-free (scheme B): only users + credits.
	// Usage curves load via GET /api/admin/users/usage?ids=... on demand.
	q := r.URL.Query()
	page := util.ToInt(q.Get("page"), 0)
	pageSize := util.ToInt(q.Get("page_size"), 0)
	query := service.AdminListQuery{
		Page:     page,
		PageSize: pageSize,
		Keyword:  strings.TrimSpace(q.Get("keyword")),
		Provider: strings.TrimSpace(q.Get("provider")),
		Status:   strings.TrimSpace(q.Get("status")),
		StartAt:  strings.TrimSpace(q.Get("start_at")),
		EndAt:    strings.TrimSpace(q.Get("end_at")),
	}
	// Cleanup presets / explicit filters (OR by default when both apply).
	if strings.TrimSpace(q.Get("cleanup")) == "inactive15_or_credit0" {
		query.InactiveDaysMin = 15
		zero := 0
		query.CreditMax = &zero
		query.CleanupMatchAny = true
	} else {
		if v := util.ToInt(q.Get("inactive_days_min"), 0); v > 0 {
			query.InactiveDaysMin = v
		}
		if raw := strings.TrimSpace(q.Get("credit_max")); raw != "" {
			v := util.ToInt(raw, 0)
			query.CreditMax = &v
		}
		// match=or|and ; default or when both set
		match := strings.ToLower(strings.TrimSpace(q.Get("match")))
		query.CleanupMatchAny = match != "and"
	}
	var creditAboveMax map[string]struct{}
	if query.CreditMax != nil && a.credits != nil {
		// Exclude set: balance > credit_max (usually small; missing id ⇒ balance 0).
		creditAboveMax = a.credits.IDsWithBalanceAbove(*query.CreditMax)
	}
	result, err := a.auth.QueryManagedUsersPage(query, creditAboveMax)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	a.enrichManagedUsersCreditsOnly(result.Items)
	result.UsageReady = false
	util.WriteJSON(w, http.StatusOK, result)
}

func (a *App) handleAdminUsersCreate(w http.ResponseWriter, r *http.Request) {
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	enabled := true
	if value, ok := body["enabled"]; ok {
		enabled = util.ToBool(value)
	}
	item, err := a.auth.CreatePasswordUser(
		util.Clean(body["username"]),
		util.Clean(body["password"]),
		util.Clean(body["name"]),
		util.Clean(body["role_id"]),
		enabled,
	)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[service.ManagedUserPublic]{Item: item})
}

// enrichManagedUsersCreditsOnly attaches credit balances for the page only.
// Intentionally does NOT touch usage stats / log scans (list path must stay light).
func (a *App) enrichManagedUsersCreditsOnly(items []service.ManagedUserPublic) {
	if len(items) == 0 || a.credits == nil {
		return
	}
	userIDs := make([]string, 0, len(items))
	for i := range items {
		userID := items[i].ID
		if userID == "" {
			userID = items[i].OwnerID
		}
		if userID != "" {
			userIDs = append(userIDs, userID)
		}
	}
	balances := a.credits.AccountsByUserIDs(userIDs)
	for i := range items {
		userID := items[i].ID
		if userID == "" {
			userID = items[i].OwnerID
		}
		if account, ok := balances[userID]; ok {
			items[i].CreditBalance = account.Balance
		}
	}
}
