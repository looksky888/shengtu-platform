package service

import (
	"errors"
	"testing"

	"chatgpt2api/internal/storage"
)

type failingAccountBackend struct {
	storage.JSONBackend
	loadErr error
}

func (b *failingAccountBackend) LoadAccounts() ([]map[string]any, error) {
	if b.loadErr != nil {
		return nil, b.loadErr
	}
	return b.JSONBackend.LoadAccounts()
}

func (b *failingAccountBackend) SaveAccounts(accounts []map[string]any) error {
	return b.JSONBackend.SaveAccounts(accounts)
}

func (b *failingAccountBackend) LoadAuthKeys() ([]map[string]any, error) {
	return []map[string]any{}, nil
}

func (b *failingAccountBackend) SaveAuthKeys([]map[string]any) error { return nil }

func (b *failingAccountBackend) HealthCheck() storage.BackendHealth {
	return storage.BackendHealth{Status: "ok", Backend: "test"}
}

func (b *failingAccountBackend) Info() storage.BackendInfo {
	return storage.BackendInfo{Type: "test"}
}

func TestAccountServiceRefusesSaveWhenLoadFailed(t *testing.T) {
	backend := &failingAccountBackend{loadErr: errors.New("disk read failed")}
	svc := NewAccountService(backend, nil, nil, NewLogService(""))
	if svc.StoreReady() {
		t.Fatal("StoreReady() = true, want false after load error")
	}
	svc.mu.Lock()
	err := svc.saveLocked()
	svc.mu.Unlock()
	if err == nil {
		t.Fatal("saveLocked() should refuse when store not ready")
	}
}
