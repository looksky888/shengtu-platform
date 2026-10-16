package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

// handleAdminUsersUsage returns usage for requested user ids only (scheme B).
// Query: ?ids=id1,id2&days=14  (ids required, max 100).
// Scans logs once accumulating only those ids — never blocks the list endpoint.
func (a *App) handleAdminUsersUsage(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rawIDs := strings.TrimSpace(q.Get("ids"))
	if rawIDs == "" {
		util.WriteError(w, http.StatusBadRequest, "请提供 ids 参数（逗号分隔）")
		return
	}
	parts := strings.Split(rawIDs, ",")
	ids := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, p := range parts {
		id := strings.TrimSpace(p)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
		if len(ids) >= 100 {
			break
		}
	}
	if len(ids) == 0 {
		util.WriteError(w, http.StatusBadRequest, "ids 为空")
		return
	}
	days := util.ToInt(q.Get("days"), 14)
	if days <= 0 {
		days = 14
	}
	if days > 90 {
		days = 90
	}

	items := map[string]service.UserUsageSummary{}
	if a.logs != nil {
		items = a.logs.UserUsageStatsForIDs(days, ids)
	} else {
		zero := service.ZeroUserUsageStats(days)
		for _, id := range ids {
			items[id] = zero
		}
	}
	// Scoped scan is synchronous: always ready when the response returns.
	util.WriteJSON(w, http.StatusOK, userUsageResponse{Ready: true, Days: days, Items: items})
}
