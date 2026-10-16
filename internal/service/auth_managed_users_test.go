package service

import (
	"chatgpt2api/internal/storage"
	"path/filepath"
	"testing"
)

func TestAuthServiceOwnerOwnsAPIKeys(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	owner := AuthOwner{ID: "user:alice", Name: "alice", Provider: AuthProviderLocal}
	item, rawAPIKey, err := auth.CreateAPIKey(AuthRoleUser, "绘图 API", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey(owner) error = %v", err)
	}
	if rawAPIKey == "" {
		t.Fatal("CreateAPIKey(owner) returned empty key")
	}
	apiIdentity := auth.Authenticate(rawAPIKey)
	if apiIdentity == nil {
		t.Fatal("Authenticate(api key) returned nil")
	}
	if apiIdentity.ID != owner.ID || apiIdentity.OwnerID != owner.ID || apiIdentity.Provider != AuthProviderLocal || apiIdentity.CredentialID != item.ID || apiIdentity.CredentialName != "绘图 API" {
		t.Fatalf("api identity = %#v", apiIdentity)
	}

	ownerFilter := AuthKeyFilter{Role: AuthRoleUser, Kind: AuthKindAPIKey, OwnerID: owner.ID}
	keys := auth.ListKeysTyped(ownerFilter)
	if len(keys) != 1 || keys[0].OwnerID != owner.ID {
		t.Fatalf("owner scoped keys = %#v", keys)
	}
	allAPIKeys := auth.ListKeysTyped(AuthKeyFilter{Role: AuthRoleUser, Kind: AuthKindAPIKey})
	if len(allAPIKeys) != 1 {
		t.Fatalf("all API keys = %#v", allAPIKeys)
	}
}

func TestAuthServiceUpsertAPIKeyForOwnerKeepsOneToken(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	owner := AuthOwner{ID: "user:alice", Name: "alice", Provider: AuthProviderLocal}
	if items := auth.ListSingleAPIKeyForOwnerTyped(owner.ID); len(items) != 0 {
		t.Fatalf("new owner should start with no token, got %#v", items)
	}

	first, firstRaw, err := auth.UpsertAPIKeyForOwner("", owner)
	if err != nil {
		t.Fatalf("first UpsertAPIKeyForOwner() error = %v", err)
	}
	second, secondRaw, err := auth.UpsertAPIKeyForOwner("", owner)
	if err != nil {
		t.Fatalf("second UpsertAPIKeyForOwner() error = %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("upsert should keep the same item id, first=%#v second=%#v", first, second)
	}
	if firstRaw == secondRaw {
		t.Fatal("upsert should rotate the raw token")
	}
	if auth.Authenticate(firstRaw) != nil {
		t.Fatal("old owner token still authenticated after reset")
	}
	if identity := auth.Authenticate(secondRaw); identity == nil || identity.ID != owner.ID {
		t.Fatalf("new owner token identity = %#v", identity)
	}
	keys := auth.ListKeysTyped(AuthKeyFilter{Role: AuthRoleUser, Kind: AuthKindAPIKey, OwnerID: owner.ID})
	if len(keys) != 1 {
		t.Fatalf("owner should have exactly one token, got %#v", keys)
	}
}

func TestAuthServiceListSingleAPIKeyForOwnerIsReadOnly(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	owner := AuthOwner{ID: "user:alice", Name: "alice", Provider: AuthProviderLocal}
	first, firstRaw, err := auth.CreateAPIKey(AuthRoleUser, "first", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey(first) error = %v", err)
	}
	_, secondRaw, err := auth.CreateAPIKey(AuthRoleUser, "second", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey(second) error = %v", err)
	}
	items := auth.ListSingleAPIKeyForOwnerTyped(owner.ID)
	if len(items) != 1 || items[0].ID != first.ID {
		t.Fatalf("ListSingleAPIKeyForOwnerTyped() = %#v, want first token only for display", items)
	}
	// Listing must not prune or invalidate either credential.
	if auth.Authenticate(firstRaw) == nil {
		t.Fatal("first token should still authenticate after list")
	}
	if auth.Authenticate(secondRaw) == nil {
		t.Fatal("second token should still authenticate after list (read-only)")
	}
	// Write path still enforces one-token-per-owner.
	_, thirdRaw, err := auth.UpsertAPIKeyForOwner("rotated", owner)
	if err != nil {
		t.Fatalf("UpsertAPIKeyForOwner() error = %v", err)
	}
	if auth.Authenticate(firstRaw) != nil || auth.Authenticate(secondRaw) != nil {
		t.Fatal("upsert should replace owner API keys")
	}
	if auth.Authenticate(thirdRaw) == nil {
		t.Fatal("rotated token should authenticate")
	}
}

func TestAuthServiceManagedUsersGroupAndControlCredentials(t *testing.T) {
	backend := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	auth := NewAuthService(backend)

	owner := AuthOwner{ID: "user:alice", Name: "alice", Provider: AuthProviderLocal}
	_, ownerRaw, err := auth.CreateAPIKey(AuthRoleUser, "alice api", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey(owner) error = %v", err)
	}
	local, localRaw, err := auth.CreateAPIKey(AuthRoleUser, "local user", AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(local) error = %v", err)
	}

	users := auth.ListUsersTyped()
	if len(users) != 2 {
		t.Fatalf("ListUsersTyped() length = %d users = %#v", len(users), users)
	}
	ownedUser := findAuthUserTyped(users, owner.ID)
	if ownedUser == nil {
		t.Fatalf("missing owned user in %#v", users)
	}
	if ownedUser.Name != owner.Name || ownedUser.Provider != AuthProviderLocal || !ownedUser.HasAPIKey {
		t.Fatalf("owned user = %#v", ownedUser)
	}
	localID := local.ID
	localUser := findAuthUserTyped(users, localID)
	if localUser == nil || localUser.Provider != AuthProviderLocal || !localUser.HasAPIKey {
		t.Fatalf("local user = %#v in %#v", localUser, users)
	}

	disabled, _ := auth.UpdateUser(owner.ID, ManagedUserUpdate{Enabled: BoolPtr(false)})
	if disabled.ID == "" || disabled.Enabled {
		t.Fatalf("disabled managed user = %#v", disabled)
	}
	if auth.Authenticate(ownerRaw) != nil {
		t.Fatal("disabled owner API key still authenticated")
	}
	if auth.Authenticate(localRaw) == nil {
		t.Fatal("disabling owned user should not affect local user")
	}

	managedUser, apiKey, rotatedRaw, found, err := auth.ResetUserAPIKey(owner.ID, "rotated")
	if err != nil || !found {
		t.Fatalf("ResetUserAPIKey(owner) found=%v err=%v", found, err)
	}
	if managedUser.ID != owner.ID || apiKey.OwnerID != owner.ID || rotatedRaw == "" || rotatedRaw == ownerRaw {
		t.Fatalf("ResetUserAPIKey(owner) user=%#v apiKey=%#v raw=%q old=%q", managedUser, apiKey, rotatedRaw, ownerRaw)
	}
	if auth.Authenticate(ownerRaw) != nil {
		t.Fatal("old owner API key still authenticated after managed reset")
	}
	if auth.Authenticate(rotatedRaw) != nil {
		t.Fatal("rotated owner API key should keep the disabled user state")
	}

	enabled, _ := auth.UpdateUser(owner.ID, ManagedUserUpdate{Enabled: BoolPtr(true)})
	if enabled.ID == "" || !enabled.Enabled {
		t.Fatalf("enabled managed user = %#v", enabled)
	}
	if identity := auth.Authenticate(rotatedRaw); identity == nil || identity.ID != owner.ID {
		t.Fatalf("enabled rotated owner API identity = %#v", identity)
	}

	_, _, localRotatedRaw, found, err := auth.ResetUserAPIKey(localID, "")
	if err != nil || !found {
		t.Fatalf("ResetUserAPIKey(local) found=%v err=%v", found, err)
	}
	if localRotatedRaw == "" || localRotatedRaw == localRaw {
		t.Fatalf("local reset raw = %q old = %q", localRotatedRaw, localRaw)
	}
	if auth.Authenticate(localRaw) != nil {
		t.Fatal("old local key still authenticated after managed reset")
	}
	if identity := auth.Authenticate(localRotatedRaw); identity == nil || identity.ID != localID {
		t.Fatalf("local rotated identity = %#v", identity)
	}

	if okDel, _ := auth.DeleteUser(owner.ID); !okDel {
		t.Fatal("DeleteUser(owner) = false")
	}
	if auth.Authenticate(rotatedRaw) != nil {
		t.Fatal("deleted owned user still authenticated")
	}
	if findAuthUserTyped(auth.ListUsersTyped(), owner.ID) != nil {
		t.Fatalf("deleted owned user still listed: %#v", auth.ListUsersTyped())
	}
}

func findAuthUserTyped(users []ManagedUserPublic, id string) *ManagedUserPublic {
	for i := range users {
		if users[i].ID == id {
			return &users[i]
		}
	}
	return nil
}

func findManagedRoleTyped(roles []ManagedRolePublic, id string) *ManagedRolePublic {
	for i := range roles {
		if roles[i].ID == id {
			return &roles[i]
		}
	}
	return nil
}
