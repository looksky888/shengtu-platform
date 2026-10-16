package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRegistrationQuotaRejectsEmptyDeviceSecretFile(t *testing.T) {
	t.Setenv("CHATGPT2API_DEVICE_ID_SECRET", "")
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "device_id.secret"), []byte(" \n"), 0o600); err != nil {
		t.Fatalf("write empty secret: %v", err)
	}
	if _, err := NewRegistrationQuotaService(dir, nil, RegistrationQuotaConfig{}); err == nil {
		t.Fatal("NewRegistrationQuotaService() succeeded with empty device secret")
	}
}

func TestRegistrationQuotaPropagatesDeviceSecretWriteFailure(t *testing.T) {
	t.Setenv("CHATGPT2API_DEVICE_ID_SECRET", "")
	dataDir := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(dataDir, []byte("block"), 0o600); err != nil {
		t.Fatalf("write data-dir blocker: %v", err)
	}
	if _, err := NewRegistrationQuotaService(dataDir, nil, RegistrationQuotaConfig{}); err == nil {
		t.Fatal("NewRegistrationQuotaService() succeeded with invalid data directory")
	}
}

func TestRegistrationQuotaPersistsGeneratedDeviceSecret(t *testing.T) {
	t.Setenv("CHATGPT2API_DEVICE_ID_SECRET", "")
	dir := t.TempDir()
	first, err := NewRegistrationQuotaService(dir, nil, RegistrationQuotaConfig{})
	if err != nil {
		t.Fatalf("first NewRegistrationQuotaService() error = %v", err)
	}
	second, err := NewRegistrationQuotaService(dir, nil, RegistrationQuotaConfig{})
	if err != nil {
		t.Fatalf("second NewRegistrationQuotaService() error = %v", err)
	}
	if len(first.secret) == 0 || string(first.secret) != string(second.secret) {
		t.Fatalf("generated device secret was not stable")
	}
}
