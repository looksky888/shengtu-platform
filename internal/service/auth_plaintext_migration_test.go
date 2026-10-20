package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

// TestAuthServiceMigratesLegacyPlaintextKey covers the boot-time migration for
// credentials stored before hash-only storage existed: the plaintext "key" must
// be erased from storage, the same secret must keep authenticating, and the
// secret must no longer be revealable through the API.
func TestAuthServiceMigratesLegacyPlaintextKey(t *testing.T) {
	dir := t.TempDir()
	accountsPath := filepath.Join(dir, "accounts.json")
	authKeysPath := filepath.Join(dir, "auth_keys.json")

	const legacySecret = "sk-legacy-plaintext-secret"
	legacy := map[string]any{
		"items": []map[string]any{{
			"id":         "legacy-1",
			"name":       "遗留密钥",
			"role":       AuthRoleUser,
			"kind":       AuthKindAPIKey,
			"provider":   AuthProviderLocal,
			"key":        legacySecret,
			"enabled":    true,
			"created_at": "2025-01-01T00:00:00+08:00",
		}},
	}
	payload, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy document: %v", err)
	}
	if err := os.WriteFile(authKeysPath, payload, 0o600); err != nil {
		t.Fatalf("write legacy document: %v", err)
	}

	backend := storage.NewJSONBackend(accountsPath, authKeysPath)
	auth := NewAuthService(backend)

	// Migration rewrites storage, never identity: the legacy secret must still work.
	if identity := auth.Authenticate(legacySecret); identity == nil {
		t.Fatal("Authenticate(legacy secret) = nil after migration; existing keys must not break")
	}
	// Plaintext is not retained in memory, so it cannot be revealed.
	filter := AuthKeyFilter{Role: AuthRoleUser, Kind: AuthKindAPIKey}
	if revealed, found := auth.RevealKey("legacy-1", filter); found || revealed != "" {
		t.Fatalf("RevealKey() = %q, %v; want empty, false after migration", revealed, found)
	}

	stored, err := os.ReadFile(authKeysPath)
	if err != nil {
		t.Fatalf("read migrated document: %v", err)
	}
	text := string(stored)
	if strings.Contains(text, legacySecret) {
		t.Fatalf("migrated document still contains the plaintext secret: %s", text)
	}
	if strings.Contains(text, `"key"`) {
		t.Fatalf(`migrated document still has a "key" field: %s`, text)
	}
	if !strings.Contains(text, util.SHA256Hex(legacySecret)) {
		t.Fatalf("migrated document lost key_hash: %s", text)
	}
}
