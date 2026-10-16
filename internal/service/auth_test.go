package service

import (
	"chatgpt2api/internal/storage"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

type failingAuthSaveBackend struct {
	storage.Backend
	fail bool
}

func TestAuthServiceSessionExpiresAndRevokes(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)
	_, raw, err := auth.RegisterPasswordUser("session_user", "Password123", "Session User")
	if err != nil {
		t.Fatalf("RegisterPasswordUser: %v", err)
	}
	auth.mu.Lock()
	for index := range auth.items {
		if auth.items[index].Kind == AuthKindSession {
			auth.items[index].ExpiresAt = time.Now().Add(-time.Minute).Format(time.RFC3339Nano)
		}
	}
	auth.mu.Unlock()
	if identity := auth.Authenticate(raw); identity != nil {
		t.Fatalf("expired session authenticated: %#v", identity)
	}

	_, rotated, err := auth.LoginPassword("session_user", "Password123")
	if err != nil {
		t.Fatalf("LoginPassword: %v", err)
	}
	if identity := auth.Authenticate(rotated); identity == nil {
		t.Fatal("rotated session did not authenticate")
	}
	if revoked, err := auth.RevokeSession(rotated); err != nil || !revoked {
		t.Fatalf("RevokeSession = %v, %v", revoked, err)
	}
	if identity := auth.Authenticate(rotated); identity != nil {
		t.Fatalf("revoked session authenticated: %#v", identity)
	}
}

func (b *failingAuthSaveBackend) SaveAuthKeys(items []map[string]any) error {
	if b.fail {
		return errors.New("forced auth save failure")
	}
	return b.Backend.SaveAuthKeys(items)
}

func TestAuthCredentialMutationRollsBackOnSaveFailure(t *testing.T) {
	base := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	backend := &failingAuthSaveBackend{Backend: base}
	auth := NewAuthService(backend)
	owner := AuthOwner{ID: "owner-1", Name: "Owner", Provider: AuthProviderLocal}

	_, originalKey, err := auth.UpsertAPIKeyForOwner("original", owner)
	if err != nil {
		t.Fatalf("initial UpsertAPIKeyForOwner() error = %v", err)
	}
	originalHash := auth.items[0].KeyHash
	backend.fail = true
	if _, _, err := auth.UpsertAPIKeyForOwner("rotated", owner); err == nil {
		t.Fatal("UpsertAPIKeyForOwner() succeeded during forced save failure")
	}
	if len(auth.items) != 1 || auth.items[0].KeyHash != originalHash {
		t.Fatalf("failed rotation was not rolled back: %#v", auth.items)
	}
	if identity := auth.Authenticate(originalKey); identity == nil || identity.ID != owner.ID {
		t.Fatalf("original key index was not preserved: %#v", identity)
	}
	if _, _, err := auth.CreateAPIKey(AuthRoleUser, "should-fail", AuthOwner{}); err == nil {
		t.Fatal("CreateAPIKey() succeeded during forced save failure")
	}
	if len(auth.items) != 1 {
		t.Fatalf("failed credential creation changed in-memory items: %#v", auth.items)
	}
}

func TestAuthServiceCreateAuthenticateDisableAndDelete(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	filter := AuthKeyFilter{Role: AuthRoleUser, Kind: AuthKindAPIKey}
	public, raw, err := auth.CreateAPIKey(AuthRoleUser, "绘图用户", AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if raw == "" {
		t.Fatal("CreateAPIKey() returned empty raw key")
	}
	if public.ID == "" {
		t.Fatalf("public key item missing id: %#v", public)
	}

	identity := auth.Authenticate(raw)
	if identity == nil {
		t.Fatal("Authenticate(raw) returned nil")
	}
	if identity.Role != "user" || identity.Name != "绘图用户" {
		t.Fatalf("identity = %#v", identity)
	}
	if !HasAPIPermission(PermissionSet{APIPermissions: identity.APIPermissions}, "POST", "/v1/images/generations") {
		t.Fatalf("default user permissions missing image generation: %#v", identity.APIPermissions)
	}

	keyID := public.ID
	// New credentials only persist key_hash; plaintext is returned once at create time.
	if revealed, found := auth.RevealKey(keyID, filter); found || revealed != "" {
		t.Fatalf("RevealKey() = %q, %v; want empty, false for hash-only storage", revealed, found)
	}

	updated, _ := auth.UpdateKey(keyID, AuthKeyUpdate{Enabled: BoolPtr(false)}, filter)
	if updated.ID == "" {
		t.Fatal("UpdateKey() returned empty item")
	}
	if auth.Authenticate(raw) != nil {
		t.Fatal("disabled key still authenticated")
	}

	if okDel, _ := auth.DeleteKey(keyID, filter); !okDel {
		t.Fatal("DeleteKey() = false")
	}
	if len(auth.ListKeysTyped(filter)) != 0 {
		t.Fatalf("ListKeysTyped(user) after delete = %#v", auth.ListKeysTyped(filter))
	}
}

func TestAuthServiceAssignsManagedRolesToUsers(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	user, raw, err := auth.CreateAPIKey(AuthRoleUser, "operator", AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	role, err := auth.CreateRole(ManagedRoleCreate{
		Name:           "accounts viewer",
		MenuPaths:      []string{"/accounts", "/missing"},
		APIPermissions: []string{APIPermissionKey("GET", "/api/accounts"), "get/missing"},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if _, err := auth.CreateRole(ManagedRoleCreate{Name: "accounts viewer"}); err == nil {
		t.Fatal("duplicate role name creation succeeded")
	}
	roleID := role.ID
	userID := user.ID
	updated, _ := auth.UpdateUser(userID, ManagedUserUpdate{RoleID: StringPtr(roleID)})
	if updated.ID == "" {
		t.Fatal("UpdateUser() returned empty user")
	}
	if updated.RoleID != roleID || updated.RoleName != "accounts viewer" {
		t.Fatalf("updated role fields = %#v", updated)
	}
	identity := auth.Authenticate(raw)
	if identity == nil {
		t.Fatal("Authenticate(raw) returned nil")
	}
	if identity.RoleID != roleID || identity.RoleName != "accounts viewer" {
		t.Fatalf("identity role fields = %#v", identity)
	}
	if !HasAPIPermission(PermissionSet{APIPermissions: identity.APIPermissions}, "GET", "/api/accounts") {
		t.Fatalf("updated API permissions missing accounts read: %#v", identity.APIPermissions)
	}
	if HasAPIPermission(PermissionSet{APIPermissions: identity.APIPermissions}, "POST", "/api/accounts") {
		t.Fatalf("unexpected accounts write permission: %#v", identity.APIPermissions)
	}

	apis := []string{APIPermissionKey("POST", "/api/accounts")}
	if _, err := auth.UpdateRole(roleID, ManagedRoleUpdate{APIPermissions: &apis}); err != nil {
		t.Fatalf("UpdateRole() error = %v", err)
	}
	identity = auth.Authenticate(raw)
	if identity == nil || !HasAPIPermission(PermissionSet{APIPermissions: identity.APIPermissions}, "POST", "/api/accounts") {
		t.Fatalf("role update did not affect user identity: %#v", identity)
	}

	if deleted, err := auth.DeleteRole(roleID); err == nil || deleted {
		t.Fatalf("DeleteRole(in use) = %v, %v; want false and error", deleted, err)
	}
}

func TestAuthServicePasswordAccountLoginAndRoleUpdates(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	bootstrap, err := auth.EnsureBootstrapAdmin("admin", "AdminPass123!")
	if err != nil {
		t.Fatalf("EnsureBootstrapAdmin() error = %v", err)
	}
	if !bootstrap.Created || bootstrap.Generated {
		t.Fatalf("bootstrap result = %#v", bootstrap)
	}
	admin, adminRaw, err := auth.LoginPassword("admin", "AdminPass123!")
	if err != nil {
		t.Fatalf("LoginPassword(admin) error = %v", err)
	}
	if admin == nil || admin.Role != AuthRoleAdmin || adminRaw == "" {
		t.Fatalf("admin identity=%#v raw=%q", admin, adminRaw)
	}

	user, raw, err := auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	if user == nil || user.Role != AuthRoleUser || user.RoleID != DefaultManagedRoleID || raw == "" {
		t.Fatalf("registered identity=%#v raw=%q", user, raw)
	}
	if authenticated := auth.Authenticate(raw); authenticated == nil || authenticated.ID != user.ID || authenticated.Name != "Alice" {
		t.Fatalf("Authenticate(registered) = %#v", authenticated)
	}
	if _, _, err := auth.RegisterPasswordUser("alice", "Password123", "Alice again"); err == nil {
		t.Fatal("duplicate username registration succeeded")
	}

	created, err := auth.CreatePasswordUser("bob", "Password123", "Bob", DefaultManagedRoleID, false)
	if err != nil {
		t.Fatalf("CreatePasswordUser() error = %v", err)
	}
	if created.ID == "" || created.Username != "bob" || created.Enabled || created.HasSession {
		t.Fatalf("created password user = %#v", created)
	}
	if _, _, err := auth.LoginPassword("bob", "Password123"); err == nil {
		t.Fatal("disabled admin-created password account logged in")
	}
	if _, err := auth.CreatePasswordUser("bob", "Password123", "Bob", DefaultManagedRoleID, true); err == nil {
		t.Fatal("duplicate admin-created username succeeded")
	}

	role, err := auth.CreateRole(ManagedRoleCreate{
		Name:           "logs viewer",
		MenuPaths:      []string{"/logs"},
		APIPermissions: []string{APIPermissionKey("GET", "/api/logs")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	updated, _ := auth.UpdateUser(user.ID, ManagedUserUpdate{RoleID: StringPtr(role.ID)})
	if updated.ID == "" || updated.RoleID != role.ID {
		t.Fatalf("UpdateUser(role) = %#v", updated)
	}
	assignedRole := findManagedRoleTyped(auth.ListRolesTyped(), role.ID)
	if assignedRole == nil || assignedRole.UserCount != 1 {
		t.Fatalf("assigned role count = %#v", assignedRole)
	}
	if deleted, err := auth.DeleteRole(role.ID); err == nil || deleted {
		t.Fatalf("DeleteRole(password account in use) = %v, %v; want false and error", deleted, err)
	}
	identity := auth.Authenticate(raw)
	if identity == nil || identity.RoleID != role.ID || !HasAPIPermission(PermissionSet{APIPermissions: identity.APIPermissions}, "GET", "/api/logs") {
		t.Fatalf("role-updated identity = %#v", identity)
	}

	disabled, _ := auth.UpdateUser(user.ID, ManagedUserUpdate{Enabled: BoolPtr(false)})
	if disabled.ID == "" || disabled.Enabled {
		t.Fatalf("UpdateUser(disable) = %#v", disabled)
	}
	if auth.Authenticate(raw) != nil {
		t.Fatal("disabled password account session still authenticated")
	}
	if _, _, err := auth.LoginPassword("alice", "Password123"); err == nil {
		t.Fatal("disabled password account logged in")
	}
}
