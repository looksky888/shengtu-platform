package service

import (
	"chatgpt2api/internal/util"
	"regexp"
	"strings"
	"time"
)

const (
	passwordAccountsDocumentName = "auth_users.json"
	passwordSessionName          = "登录会话"
	passwordSessionTTL           = 30 * 24 * time.Hour
)

var accountUsernameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{2,31}$`)

type PasswordAccount struct {
	ID              string
	Username        string
	Email           string
	EmailVerifiedAt string
	Name            string
	PasswordHash    string
	Role            string
	RoleID          string
	Enabled         bool
	CreatedAt       string
	UpdatedAt       string
	LastLoginAt     string
}

func (a PasswordAccount) DisplayName() string {
	if name := util.Clean(a.Name); name != "" {
		return name
	}
	if username := util.Clean(a.Username); username != "" {
		if local, _, ok := strings.Cut(a.Email, "@"); ok && local != "" {
			return local
		}
		return username
	}
	return "用户"
}

func (a PasswordAccount) ManagedRoleID() string {
	if a.Role != AuthRoleUser {
		return ""
	}
	if roleID := util.Clean(a.RoleID); roleID != "" {
		return roleID
	}
	return DefaultManagedRoleID
}

type BootstrapAdminResult struct {
	Created   bool
	Generated bool
	Username  string
	Password  string
}
