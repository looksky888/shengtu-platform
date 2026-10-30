package service

import (
	"crypto/hmac"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	AuthRoleAdmin = "admin"
	AuthRoleUser  = "user"

	AuthKindAPIKey  = "api_key"
	AuthKindSession = "session"

	AuthProviderLocal = "local"

	DefaultManagedRoleID = "default-user"

	rbacRolesDocumentName = "rbac_roles.json"
)

type Identity struct {
	ID             string
	Name           string
	Role           string
	RoleID         string
	RoleName       string
	Provider       string
	OwnerID        string
	CredentialID   string
	CredentialName string
	Kind           string
	RememberMe     bool
	MenuPaths      []string
	APIPermissions []string
}

func (i Identity) Map() map[string]any {
	return map[string]any{
		"id":              i.ID,
		"name":            i.Name,
		"role":            i.Role,
		"role_id":         i.RoleID,
		"role_name":       i.RoleName,
		"provider":        i.Provider,
		"owner_id":        i.OwnerID,
		"credential_id":   i.CredentialID,
		"credential_name": i.CredentialName,
		"kind":            i.Kind,
		"remember_me":     i.RememberMe,
		"menu_paths":      append([]string(nil), i.MenuPaths...),
		"api_permissions": append([]string(nil), i.APIPermissions...),
	}
}

type AuthOwner struct {
	ID       string
	Name     string
	Provider string
}

type AuthKeyFilter struct {
	Role    string
	Kind    string
	OwnerID string
}

type ManagedRole struct {
	ID             string
	Name           string
	Description    string
	Builtin        bool
	MenuPaths      []string
	APIPermissions []string
	CreatedAt      string
	UpdatedAt      string
}

func (r ManagedRole) PermissionSet() PermissionSet {
	return PermissionSet{
		MenuPaths:      NormalizeMenuPermissions(r.MenuPaths),
		APIPermissions: NormalizeAPIPermissions(r.APIPermissions),
	}
}

type AuthService struct {
	mu              sync.RWMutex
	storage         storage.Backend
	roleStore       storage.JSONDocumentBackend
	accounts        []PasswordAccount
	items           []AuthKey
	roles           []ManagedRole
	lastUsedFlushAt map[string]time.Time
	// storeReady is false when auth keys failed to load; saves are refused to avoid wipe.
	storeReady         bool
	roleStoreReady     bool
	passwordStoreReady bool
	// legacyPlaintextKeys counts credentials whose stored row still carried a
	// plaintext "key" field at load time; boot rewrites them hash-only.
	legacyPlaintextKeys int
	// keyIndex maps key_hash -> first index in items for O(1) Authenticate.
	keyIndex map[string]int
}

func NewAuthService(backend storage.Backend) *AuthService {
	s := &AuthService{
		storage:         backend,
		roleStore:       jsonDocumentStoreFromBackend(backend),
		lastUsedFlushAt: map[string]time.Time{},
		keyIndex:        map[string]int{},
	}
	s.roles, s.roleStoreReady = s.loadRoles()
	s.accounts, s.passwordStoreReady = s.loadPasswordAccounts()
	s.items, s.storeReady = s.load()
	s.syncPasswordAccountsToItems()
	s.applyRolesToItems()
	s.rebuildKeyIndexLocked()
	s.eraseLegacyPlaintextKeys()
	return s
}

// StoreReady reports whether auth credentials were loaded successfully from storage.
func (s *AuthService) StoreReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.storeReady && s.roleStoreReady && s.passwordStoreReady
}

// rebuildKeyIndexLocked rebuilds key_hash -> first item index. Caller must hold s.mu
// (or call only during construction before concurrent use).
func (s *AuthService) rebuildKeyIndexLocked() {
	index := make(map[string]int, len(s.items))
	for i, item := range s.items {
		hash := util.Clean(item.KeyHash)
		if hash == "" {
			continue
		}
		if _, exists := index[hash]; exists {
			continue // first enabled match wins (Authenticate historically used first)
		}
		index[hash] = i
	}
	s.keyIndex = index
}

func (s *AuthService) Authenticate(raw string) *Identity {
	candidate := util.Clean(raw)
	if candidate == "" {
		return nil
	}
	hash := util.SHA256Hex(candidate)
	now := time.Now().UTC()

	// Fast read-lock path when keyIndex is populated and lastUsedFlushAt is fresh.
	s.mu.RLock()
	if s.keyIndex != nil {
		index, ok := s.keyIndex[hash]
		if !ok || index < 0 || index >= len(s.items) {
			s.mu.RUnlock()
			return nil
		}
		item := s.items[index]
		stored := util.Clean(item.KeyHash)
		if stored != "" && hmac.Equal([]byte(stored), []byte(hash)) {
			if !item.Enabled || authSessionExpired(item, now) {
				s.mu.RUnlock()
				return nil
			}
			id := util.Clean(item.ID)
			if last, hasFlush := s.lastUsedFlushAt[id]; hasFlush && now.Sub(last) < time.Minute {
				next := item
				s.applyRoleToAuthItem(&next, managedAuthRoleID(next))
				s.mu.RUnlock()
				return identityForAuthItem(next)
			}
		}
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.keyIndex == nil {
		s.rebuildKeyIndexLocked()
	}
	index, ok := s.keyIndex[hash]
	if !ok || index < 0 || index >= len(s.items) {
		return nil
	}
	item := s.items[index]
	// Defense in depth: verify hash still matches (index drift / corruption).
	stored := util.Clean(item.KeyHash)
	if stored == "" || !hmac.Equal([]byte(stored), []byte(hash)) {
		s.rebuildKeyIndexLocked()
		index, ok = s.keyIndex[hash]
		if !ok || index < 0 || index >= len(s.items) {
			return nil
		}
		item = s.items[index]
		stored = util.Clean(item.KeyHash)
		if stored == "" || !hmac.Equal([]byte(stored), []byte(hash)) {
			return nil
		}
	}
	if !item.Enabled {
		return nil
	}
	if authSessionExpired(item, now) {
		return nil
	}
	next := item
	s.applyRoleToAuthItem(&next, managedAuthRoleID(next))
	next.LastUsedAt = now.Format(time.RFC3339Nano)
	s.items[index] = next
	// key_hash unchanged — index stays valid
	id := util.Clean(next.ID)
	// Throttle disk writes: at most once per minute per credential.
	// Prefer single-row upsert when backend supports it (avoids rewriting entire key table).
	if last, ok := s.lastUsedFlushAt[id]; !ok || now.Sub(last) >= time.Minute {
		if s.persistAuthKeyLocked(next) == nil {
			s.lastUsedFlushAt[id] = now
		}
	}
	return identityForAuthItem(next)
}
