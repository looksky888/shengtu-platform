package service

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestCPAImportReportsAccountSaveFailure(t *testing.T) {
	service, poolID, pool, accounts, backend := newCPAImportPersistenceTest(t)
	backend.failAt = 1

	service.runImport(poolID, pool, []string{"account.json"})

	job := service.config.GetImportJob(poolID)
	if job["status"] != "failed" || util.ToInt(job["added"], -1) != 0 {
		t.Fatalf("job = %#v", job)
	}
	assertCPAJobErrorContains(t, job, "保存导入账号失败")
	if account := accounts.GetAccount("import-token"); account != nil {
		t.Fatalf("account should roll back after save failure: %#v", account)
	}
}

func TestCPAImportReportsRefreshPersistenceFailure(t *testing.T) {
	service, poolID, pool, accounts, backend := newCPAImportPersistenceTest(t)
	backend.failAt = 2

	service.runImport(poolID, pool, []string{"account.json"})

	job := service.config.GetImportJob(poolID)
	if job["status"] != "completed" || util.ToInt(job["refreshed"], -1) != 0 {
		t.Fatalf("job = %#v", job)
	}
	assertCPAJobErrorContains(t, job, "forced register account write failure")
	if account := accounts.GetAccount("import-token"); account == nil {
		t.Fatal("imported token should remain stored after refresh failure")
	}
}

func newCPAImportPersistenceTest(t *testing.T) (*CPAImportService, string, map[string]any, *AccountService, *registerAccountBackend) {
	t.Helper()
	server := newCPAImportPersistenceServer(t)
	t.Cleanup(server.Close)
	dir := t.TempDir()
	backend := &registerAccountBackend{JSONBackend: storage.NewJSONBackend(
		filepath.Join(dir, "accounts.json"),
		filepath.Join(dir, "auth_keys.json"),
	)}
	logs := NewLogService(dir)
	t.Cleanup(func() { _ = logs.Close() })
	proxy := NewProxyService(testAccountConfig{})
	accounts := NewAccountService(backend, testAccountConfig{}, proxy, logs)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	config := NewCPAConfig(dir, backend)
	publicPool, err := config.AddPool("test", server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := config.SetImportJob(publicPool.ID, newImportJobStruct(1).toMap()); err != nil {
		t.Fatal(err)
	}
	pool := map[string]any{"id": publicPool.ID, "base_url": server.URL, "secret_key": "secret"}
	return NewCPAImportService(config, accounts, proxy), publicPool.ID, pool, accounts, backend
}

func newCPAImportPersistenceServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
		case "/v0/management/auth-files/download":
			writeJSON(t, w, map[string]any{"access_token": "import-token"})
		case "/backend-api/me":
			writeJSON(t, w, map[string]any{"email": "import@example.test", "id": "import-user"})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{"limits_progress": []map[string]any{{"feature_name": "image_gen", "remaining": 7}}})
		default:
			http.NotFound(w, r)
		}
	}))
}

func assertCPAJobErrorContains(t *testing.T, job map[string]any, expected string) {
	t.Helper()
	for _, item := range anyList(job["errors"]) {
		entry, _ := item.(map[string]any)
		if strings.Contains(util.Clean(entry["error"]), expected) {
			return
		}
	}
	t.Fatalf("job errors = %#v, want text %q", job["errors"], expected)
}
