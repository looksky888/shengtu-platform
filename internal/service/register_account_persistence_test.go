package service

import (
	"context"
	"errors"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type registerAccountBackend struct {
	*storage.JSONBackend
	upsertCalls int
	failAt      int
}

func (b *registerAccountBackend) UpsertAccount(accessToken string, data map[string]any) error {
	b.upsertCalls++
	if b.upsertCalls == b.failAt {
		return errors.New("forced register account write failure")
	}
	return b.JSONBackend.UpsertAccount(accessToken, data)
}

func TestPersistAndRefreshRegisteredAccountReportsAddFailure(t *testing.T) {
	service, accounts, backend := newRegisterPersistenceTestService(t)
	backend.failAt = 1

	err := service.persistAndRefreshRegisteredAccount(context.Background(), "token-add-fail")
	if err == nil || !strings.Contains(err.Error(), "保存注册账号失败") {
		t.Fatalf("error = %v", err)
	}
	if account := accounts.GetAccount("token-add-fail"); account != nil {
		t.Fatalf("account should roll back after save failure: %#v", account)
	}
}

func TestPersistAndRefreshRegisteredAccountReportsRefreshFailure(t *testing.T) {
	server := newRefreshPersistenceServer(t)
	defer server.Close()
	service, accounts, backend := newRegisterPersistenceTestService(t)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	backend.failAt = 2

	err := service.persistAndRefreshRegisteredAccount(context.Background(), "token-refresh-fail")
	if err == nil || !strings.Contains(err.Error(), "刷新注册账号失败") {
		t.Fatalf("error = %v", err)
	}
	if account := accounts.GetAccount("token-refresh-fail"); account == nil {
		t.Fatal("account token should remain stored after refresh failure")
	}
}

func newRegisterPersistenceTestService(t *testing.T) (*RegisterService, *AccountService, *registerAccountBackend) {
	t.Helper()
	dir := t.TempDir()
	backend := &registerAccountBackend{JSONBackend: storage.NewJSONBackend(
		filepath.Join(dir, "accounts.json"),
		filepath.Join(dir, "auth_keys.json"),
	)}
	logs := NewLogService(dir)
	t.Cleanup(func() { _ = logs.Close() })
	accounts := NewAccountService(backend, testAccountConfig{}, NewProxyService(testAccountConfig{}), logs)
	return &RegisterService{accounts: accounts}, accounts, backend
}
