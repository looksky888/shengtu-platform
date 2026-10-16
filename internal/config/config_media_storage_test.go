package config

import (
	"strings"
	"testing"
)

func TestStoreRejectsUnknownMediaStorageProvider(t *testing.T) {
	t.Setenv("CHATGPT2API_ROOT", t.TempDir())
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	if _, err := store.Update(map[string]any{"media_storage_provider": "s3"}); err == nil || !strings.Contains(err.Error(), "local 或 r2") {
		t.Fatalf("Update() error = %v", err)
	}
}

func TestStoreR2SecretIsWriteOnlyAndBlankUpdateKeepsSecret(t *testing.T) {
	t.Setenv("CHATGPT2API_ROOT", t.TempDir())
	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	secret := "test-secret-value"
	got, err := store.Update(map[string]any{
		"media_storage_provider":       "r2",
		"media_r2_account_id":          "account",
		"media_r2_access_key_id":       "access",
		"media_r2_secret_access_key":   secret,
		"media_r2_bucket":              "bucket",
		"media_r2_prefix":              "media/test",
		"media_auto_cleanup_enabled":   false,
		"media_r2_presign_ttl_seconds": 300,
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if _, ok := got["media_r2_secret_access_key"]; ok {
		t.Fatal("Update() returned plaintext media secret")
	}
	if got["media_r2_secret_access_key_configured"] != true {
		t.Fatalf("configured = %#v", got["media_r2_secret_access_key_configured"])
	}
	if _, err := store.Update(map[string]any{"media_r2_secret_access_key": ""}); err != nil {
		t.Fatalf("blank secret Update() error = %v", err)
	}
	if store.MediaR2SecretAccessKey() != secret {
		t.Fatal("blank update replaced configured secret")
	}
}
