package service

import (
	"errors"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

type authDocumentFailureBackend struct {
	storage.Backend
	documents       storage.JSONDocumentBackend
	failLoadName    string
	failAuthSaves   int
	documentSaveCnt int
}

func (b *authDocumentFailureBackend) LoadJSONDocument(name string) (any, error) {
	if name == b.failLoadName {
		return nil, errors.New("forced document load failure")
	}
	return b.documents.LoadJSONDocument(name)
}

func (b *authDocumentFailureBackend) SaveJSONDocument(name string, value any) error {
	b.documentSaveCnt++
	return b.documents.SaveJSONDocument(name, value)
}

func (b *authDocumentFailureBackend) DeleteJSONDocument(name string) error {
	return b.documents.DeleteJSONDocument(name)
}

func (b *authDocumentFailureBackend) SaveAuthKeys(items []map[string]any) error {
	if b.failAuthSaves > 0 {
		b.failAuthSaves--
		return errors.New("forced auth key save failure")
	}
	return b.Backend.SaveAuthKeys(items)
}

func newAuthDocumentFailureBackend(t *testing.T) (*authDocumentFailureBackend, storage.JSONDocumentBackend) {
	t.Helper()
	base := storage.NewJSONBackend(
		filepath.Join(t.TempDir(), "accounts.json"),
		filepath.Join(t.TempDir(), "auth_keys.json"),
	)
	var documents storage.JSONDocumentBackend = base
	return &authDocumentFailureBackend{Backend: base, documents: documents}, documents
}

func TestAuthDocumentLoadFailureDisablesRelatedWrites(t *testing.T) {
	backend, documents := newAuthDocumentFailureBackend(t)
	if err := documents.SaveJSONDocument(passwordAccountsDocumentName, map[string]any{"items": []any{map[string]any{
		"id": "user_existing", "username": "existing", "name": "Existing", "password_hash": "preserve",
		"role": AuthRoleUser, "enabled": true,
	}}}); err != nil {
		t.Fatalf("seed password accounts: %v", err)
	}
	backend.failLoadName = passwordAccountsDocumentName
	auth := NewAuthService(backend)
	if auth.StoreReady() {
		t.Fatal("StoreReady = true after password account load failure")
	}
	beforeSaves := backend.documentSaveCnt
	if _, _, err := auth.RegisterPasswordUser("new_user", "Password123", "New User"); err == nil {
		t.Fatal("registration succeeded while password account store was unavailable")
	}
	if backend.documentSaveCnt != beforeSaves {
		t.Fatalf("password account load failure triggered writes: %d -> %d", beforeSaves, backend.documentSaveCnt)
	}

	backend.failLoadName = rbacRolesDocumentName
	auth = NewAuthService(backend)
	beforeSaves = backend.documentSaveCnt
	if _, err := auth.CreateRole(ManagedRoleCreate{Name: "must fail"}); err == nil {
		t.Fatal("role creation succeeded while RBAC store was unavailable")
	}
	if backend.documentSaveCnt != beforeSaves {
		t.Fatalf("RBAC load failure triggered writes: %d -> %d", beforeSaves, backend.documentSaveCnt)
	}
}

func TestRegisterPasswordUserRollsBackBothStores(t *testing.T) {
	backend, documents := newAuthDocumentFailureBackend(t)
	auth := NewAuthService(backend)
	backend.failAuthSaves = 1
	if _, _, err := auth.RegisterPasswordUser("rollback_user", "Password123", "Rollback User"); err == nil {
		t.Fatal("registration succeeded during auth key save failure")
	}
	if len(auth.accounts) != 0 || len(auth.items) != 0 {
		t.Fatalf("failed registration changed memory: accounts=%#v items=%#v", auth.accounts, auth.items)
	}
	raw, err := documents.LoadJSONDocument(passwordAccountsDocumentName)
	if err != nil {
		t.Fatalf("load rolled-back password accounts: %v", err)
	}
	if items := normalizePasswordAccounts(raw); len(items) != 0 {
		t.Fatalf("failed registration remained durable: %#v", items)
	}
	keys, err := backend.LoadAuthKeys()
	if err != nil {
		t.Fatalf("load rolled-back auth keys: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("failed registration keys remained durable: %#v", keys)
	}
}
