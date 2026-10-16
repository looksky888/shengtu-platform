package service

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPaymentSecretRoundTripAndFieldBinding(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	ciphertext, err := encryptPaymentSecret(key, "api_v3_key", "secret-value")
	if err != nil {
		t.Fatalf("encryptPaymentSecret() error = %v", err)
	}
	if ciphertext == "secret-value" || ciphertext == "" {
		t.Fatalf("ciphertext leaked or empty: %q", ciphertext)
	}
	plaintext, err := decryptPaymentSecret(key, "api_v3_key", ciphertext)
	if err != nil || plaintext != "secret-value" {
		t.Fatalf("decryptPaymentSecret() = %q err=%v", plaintext, err)
	}
	if _, err := decryptPaymentSecret(key, "merchant_private_key", ciphertext); err == nil {
		t.Fatal("decrypt with a different field unexpectedly succeeded")
	}
	if _, err := decryptPaymentSecret(append([]byte(nil), key[:31]...), "api_v3_key", ciphertext); err == nil {
		t.Fatal("decrypt with an invalid key unexpectedly succeeded")
	}
}

func TestPaymentSettingsKeyUsesEnvironmentAndOwnerOnlyFile(t *testing.T) {
	dataDir := t.TempDir()
	keyHex := hex.EncodeToString(make([]byte, 32))
	t.Setenv(paymentSettingsKeyEnv, keyHex)
	key, err := loadOrCreatePaymentSettingsKey(dataDir)
	if err != nil || len(key) != 32 {
		t.Fatalf("env key = %d bytes err=%v", len(key), err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, paymentSettingsKeyFile)); !os.IsNotExist(err) {
		t.Fatalf("env key unexpectedly created a key file: %v", err)
	}
	t.Setenv(paymentSettingsKeyEnv, "")
	key, err = loadOrCreatePaymentSettingsKey(dataDir)
	if err != nil || len(key) != 32 {
		t.Fatalf("generated key = %d bytes err=%v", len(key), err)
	}
	info, err := os.Stat(filepath.Join(dataDir, paymentSettingsKeyFile))
	if err != nil {
		t.Fatalf("key file stat: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("key file permissions = %o, want owner-only", info.Mode().Perm())
	}
}

func TestPaymentSettingsKeyRejectsInvalidEnvironmentValue(t *testing.T) {
	t.Setenv(paymentSettingsKeyEnv, "short")
	if _, err := loadOrCreatePaymentSettingsKey(t.TempDir()); err == nil {
		t.Fatal("invalid payment key unexpectedly accepted")
	}
}
