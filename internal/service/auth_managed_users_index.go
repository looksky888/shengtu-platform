package service

import (
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// managedUserLite is a filter/sort index row without permission slices.
// Full ManagedUserPublic is projected only for the requested page.
type managedUserLite struct {
	ID         string
	Username   string
	Email      string
	Name       string
	RoleID     string
	RoleName   string
	Provider   string
	OwnerID    string
	OwnerName  string
	Enabled    bool
	CreatedAt  string
	LastUsedAt string
	UpdatedAt  string
	// ActivityUnix is last activity (last used, else created) as unix seconds; 0 = never.
	// Filled once when the lite index is built so cleanup inactive filters skip re-parsing.
	ActivityUnix int64
}

func listManagedUserLitesLocked(items []AuthKey, roles []ManagedRole, accounts []PasswordAccount) []managedUserLite {
	byID := map[string]*managedUserLite{}
	for _, account := range accounts {
		if account.Role != AuthRoleUser || account.ID == "" {
			continue
		}
		roleID := account.ManagedRoleID()
		byID[account.ID] = &managedUserLite{
			ID:         account.ID,
			Username:   account.Username,
			Email:      account.Email,
			Name:       account.DisplayName(),
			RoleID:     roleID,
			RoleName:   managedRoleName(roles, roleID),
			Provider:   AuthProviderLocal,
			OwnerID:    account.ID,
			OwnerName:  account.DisplayName(),
			Enabled:    account.Enabled,
			CreatedAt:  util.Clean(account.CreatedAt),
			LastUsedAt: util.Clean(account.LastLoginAt),
			UpdatedAt:  util.Clean(account.UpdatedAt),
		}
	}
	for _, item := range items {
		id := managedAuthUserID(item)
		if id == "" {
			continue
		}
		row := byID[id]
		if row == nil {
			row = &managedUserLite{
				ID:        id,
				Name:      managedAuthUserName(item),
				RoleID:    DefaultManagedRoleID,
				RoleName:  managedRoleName(roles, DefaultManagedRoleID),
				Provider:  util.Clean(item.Provider),
				OwnerID:   util.Clean(item.OwnerID),
				OwnerName: util.Clean(item.OwnerName),
			}
			byID[id] = row
		}
		mergeManagedUserLite(row, item)
	}
	out := make([]managedUserLite, 0, len(byID))
	for _, row := range byID {
		row.ActivityUnix = managedUserActivityUnix(row.LastUsedAt, row.CreatedAt)
		out = append(out, *row)
	}
	return out
}

// managedUserActivityUnix parses last-used (else created) once for index rows.
func managedUserActivityUnix(lastUsed, created string) int64 {
	last := parseManagedUserTime(lastUsed)
	if last.IsZero() {
		last = parseManagedUserTime(created)
	}
	if last.IsZero() {
		return 0
	}
	return last.Unix()
}

func mergeManagedUserLite(row *managedUserLite, item AuthKey) {
	if row == nil {
		return
	}
	provider := normalizeAuthProvider(util.Clean(item.Provider))
	if row.Provider == "" {
		row.Provider = provider
	}
	if ownerID := util.Clean(item.OwnerID); ownerID != "" {
		row.OwnerID = ownerID
	}
	if username := util.Clean(item.Username); username != "" {
		row.Username = username
	}
	if ownerName := util.Clean(item.OwnerName); ownerName != "" {
		row.OwnerName = ownerName
		row.Name = ownerName
	} else if row.Name == "" {
		row.Name = managedAuthUserName(item)
	}
	if roleID := managedAuthRoleID(item); roleID != "" {
		row.RoleID = roleID
	}
	if roleName := util.Clean(item.RoleName); roleName != "" {
		row.RoleName = roleName
	}
	if item.Enabled {
		row.Enabled = true
	}
	if created := util.Clean(item.CreatedAt); created != "" {
		if row.CreatedAt == "" || created < row.CreatedAt {
			row.CreatedAt = created
		}
	}
	if lastUsed := util.Clean(item.LastUsedAt); lastUsed != "" {
		if row.LastUsedAt == "" || lastUsed > row.LastUsedAt {
			row.LastUsedAt = lastUsed
		}
	}
	if updated := util.Clean(item.UpdatedAt); updated != "" {
		if row.UpdatedAt == "" || updated > row.UpdatedAt {
			row.UpdatedAt = updated
		}
	}
}

func managedUserLiteMatches(row managedUserLite, provider, status, keyword string, startAt, endAt *time.Time) bool {
	if provider != "" && util.Clean(row.Provider) != provider {
		return false
	}
	if status == "enabled" && !row.Enabled {
		return false
	}
	if status == "disabled" && row.Enabled {
		return false
	}
	timestamp := row.LastUsedAt
	if timestamp == "" {
		timestamp = row.CreatedAt
	}
	if !adminListInTimeRange(timestamp, startAt, endAt) {
		return false
	}
	if keyword != "" && !managedUserLiteMatchesKeyword(row, keyword) {
		return false
	}
	return true
}

func managedUserLiteMatchesKeyword(row managedUserLite, keyword string) bool {
	parts := []string{
		row.ID, row.Username, row.Email, row.Name, AuthRoleUser, row.RoleID, row.RoleName,
		row.Provider, row.OwnerID, row.OwnerName,
	}
	for _, part := range parts {
		if strings.Contains(strings.ToLower(part), keyword) {
			return true
		}
	}
	return false
}
