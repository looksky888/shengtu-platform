package service

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
)

func newEmailAccountAuthForTest(t *testing.T) *AuthService {
	t.Helper()
	dir := t.TempDir()
	return NewAuthService(storage.NewJSONBackend(
		filepath.Join(dir, "accounts.json"),
		filepath.Join(dir, "auth_keys.json"),
	))
}

func TestEmailAccountLoginKeepsLegacyUsernameCompatibility(t *testing.T) {
	auth := newEmailAccountAuthForTest(t)
	legacy, _, err := auth.RegisterPasswordUser("legacy_user", "Password123", "旧用户")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	emailUser, _, err := auth.RegisterEmailUser("New.User@Example.Test", "Password123", "新用户")
	if err != nil {
		t.Fatalf("RegisterEmailUser() error = %v", err)
	}
	if identity, _, err := auth.LoginPassword("legacy_user", "Password123"); err != nil || identity.ID != legacy.ID {
		t.Fatalf("legacy username login identity=%#v error=%v", identity, err)
	}
	if identity, _, err := auth.LoginPassword("new.user@example.test", "Password123"); err != nil || identity.ID != emailUser.ID {
		t.Fatalf("email login identity=%#v error=%v", identity, err)
	}

	auth.mu.Lock()
	_, account, ok := passwordAccountIndexByEmailLocked(auth.accounts, "new.user@example.test")
	auth.mu.Unlock()
	if !ok || !strings.HasPrefix(account.Username, "u_") || account.EmailVerifiedAt == "" {
		t.Fatalf("email account = %#v", account)
	}
	if _, _, err := auth.LoginPassword(account.Username, "Password123"); err == nil {
		t.Fatal("email account logged in with internal username")
	}
}

func TestEmailAccountRegistrationNormalizesAndRejectsDuplicateEmail(t *testing.T) {
	auth := newEmailAccountAuthForTest(t)
	if _, _, err := auth.RegisterEmailUser("Case.User@Example.Test", "Password123", ""); err != nil {
		t.Fatalf("first RegisterEmailUser() error = %v", err)
	}
	if !auth.EmailExists(" case.user@example.test ") {
		t.Fatal("EmailExists() did not normalize email")
	}
	if _, _, err := auth.RegisterEmailUser("case.user@example.test", "Password123", ""); err == nil {
		t.Fatal("case-insensitive duplicate email registration succeeded")
	}
	if _, _, err := auth.RegisterEmailUser("Display Name <user@example.test>", "Password123", ""); err == nil {
		t.Fatal("display-name email format was accepted")
	}
}

func TestResetPasswordByEmailRevokesSessionButKeepsAPIKey(t *testing.T) {
	auth := newEmailAccountAuthForTest(t)
	identity, oldSession, err := auth.RegisterEmailUser("reset@example.test", "Password123", "重置用户")
	if err != nil {
		t.Fatalf("RegisterEmailUser() error = %v", err)
	}
	_, apiKey, err := auth.UpsertAPIKeyForOwner("用户 API Key", AuthOwner{
		ID: identity.ID, Name: identity.Name, Provider: AuthProviderLocal,
	})
	if err != nil {
		t.Fatalf("UpsertAPIKeyForOwner() error = %v", err)
	}
	if err := auth.ResetPasswordByEmail(" RESET@example.test ", "NewPassword456"); err != nil {
		t.Fatalf("ResetPasswordByEmail() error = %v", err)
	}
	if authenticated := auth.Authenticate(oldSession); authenticated != nil {
		t.Fatalf("old session still authenticated: %#v", authenticated)
	}
	if authenticated := auth.Authenticate(apiKey); authenticated == nil || authenticated.ID != identity.ID {
		t.Fatalf("user API key was revoked: %#v", authenticated)
	}
	if _, _, err := auth.LoginPassword("reset@example.test", "Password123"); err == nil {
		t.Fatal("old password still logged in")
	}
	if loggedIn, _, err := auth.LoginPassword("reset@example.test", "NewPassword456"); err != nil || loggedIn.ID != identity.ID {
		t.Fatalf("new password login identity=%#v error=%v", loggedIn, err)
	}
}

func TestResetPasswordByEmailRejectsLegacyUsernameAccount(t *testing.T) {
	auth := newEmailAccountAuthForTest(t)
	if _, _, err := auth.RegisterPasswordUser("legacy_reset", "Password123", "旧账号"); err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	if err := auth.ResetPasswordByEmail("legacy_reset@example.test", "NewPassword456"); !errors.Is(err, ErrPasswordResetAccountUnavailable) {
		t.Fatalf("ResetPasswordByEmail() error = %v", err)
	}
	if _, _, err := auth.LoginPassword("legacy_reset", "Password123"); err != nil {
		t.Fatalf("legacy login changed after rejected reset: %v", err)
	}
}
