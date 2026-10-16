package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"strings"
)

func normalizePasswordAccounts(raw any) []PasswordAccount {
	items := util.AsMapSlice(raw)
	if obj, ok := raw.(map[string]any); ok {
		items = util.AsMapSlice(obj["items"])
	}
	out := make([]PasswordAccount, 0, len(items))
	seenIDs := map[string]struct{}{}
	seenUsernames := map[string]struct{}{}
	for _, item := range items {
		account := normalizePasswordAccount(item)
		if account.ID == "" || account.Username == "" || account.PasswordHash == "" {
			continue
		}
		if _, ok := seenIDs[account.ID]; ok {
			continue
		}
		if _, ok := seenUsernames[account.Username]; ok {
			continue
		}
		seenIDs[account.ID] = struct{}{}
		seenUsernames[account.Username] = struct{}{}
		out = append(out, account)
	}
	return out
}

func normalizePasswordAccount(raw map[string]any) PasswordAccount {
	username, err := normalizeAccountUsername(util.Clean(raw["username"]))
	if err != nil {
		return PasswordAccount{}
	}
	role := normalizeAuthRole(util.Clean(raw["role"]))
	if role == "" {
		return PasswordAccount{}
	}
	id := util.Clean(raw["id"])
	if id == "" {
		return PasswordAccount{}
	}
	created := util.Clean(raw["created_at"])
	if created == "" {
		created = util.NowISO()
	}
	updated := util.Clean(raw["updated_at"])
	if updated == "" {
		updated = created
	}
	account := PasswordAccount{
		ID:              id,
		Username:        username,
		Email:           strings.ToLower(strings.TrimSpace(util.Clean(raw["email"]))),
		EmailVerifiedAt: util.Clean(raw["email_verified_at"]),
		Name:            normalizeAccountDisplayName(util.Clean(raw["name"]), username),
		PasswordHash:    util.Clean(raw["password_hash"]),
		Role:            role,
		RoleID:          util.Clean(raw["role_id"]),
		Enabled:         util.ToBool(util.ValueOr(raw["enabled"], true)),
		CreatedAt:       created,
		UpdatedAt:       updated,
		LastLoginAt:     util.Clean(raw["last_login_at"]),
	}
	if account.Role != AuthRoleUser {
		account.RoleID = ""
	} else if account.RoleID == "" {
		account.RoleID = DefaultManagedRoleID
	}
	return account
}

func storedPasswordAccount(account PasswordAccount) map[string]any {
	return map[string]any{
		"id":                account.ID,
		"username":          account.Username,
		"email":             account.Email,
		"email_verified_at": account.EmailVerifiedAt,
		"name":              account.Name,
		"password_hash":     account.PasswordHash,
		"role":              account.Role,
		"role_id":           account.ManagedRoleID(),
		"enabled":           account.Enabled,
		"created_at":        account.CreatedAt,
		"updated_at":        account.UpdatedAt,
		"last_login_at":     account.LastLoginAt,
	}
}

func validateLoadedPasswordAccounts(accounts []PasswordAccount) error {
	seen := make(map[string]string, len(accounts))
	for _, account := range accounts {
		if account.Email == "" {
			continue
		}
		email, err := normalizeAccountEmail(account.Email)
		if err != nil {
			return fmt.Errorf("账号 %s 的邮箱无效: %w", account.ID, err)
		}
		if previousID, ok := seen[email]; ok {
			return fmt.Errorf("账号 %s 与 %s 使用重复邮箱", previousID, account.ID)
		}
		seen[email] = account.ID
	}
	return nil
}

func passwordAccountByIDLocked(accounts []PasswordAccount, id string) (PasswordAccount, bool) {
	id = util.Clean(id)
	for _, account := range accounts {
		if account.ID == id {
			return account, true
		}
	}
	return PasswordAccount{}, false
}

func passwordAccountByUsernameLocked(accounts []PasswordAccount, username string) (PasswordAccount, bool) {
	_, account, ok := passwordAccountIndexByUsernameLocked(accounts, username)
	return account, ok
}

func passwordAccountIndexByUsernameLocked(accounts []PasswordAccount, username string) (int, PasswordAccount, bool) {
	username, err := normalizeAccountUsername(username)
	if err != nil {
		return -1, PasswordAccount{}, false
	}
	for index, account := range accounts {
		if account.Username == username {
			return index, account, true
		}
	}
	return -1, PasswordAccount{}, false
}

func passwordAccountIndexByEmailLocked(accounts []PasswordAccount, email string) (int, PasswordAccount, bool) {
	email, err := normalizeAccountEmail(email)
	if err != nil {
		return -1, PasswordAccount{}, false
	}
	for index, account := range accounts {
		if account.Email == email {
			return index, account, true
		}
	}
	return -1, PasswordAccount{}, false
}
