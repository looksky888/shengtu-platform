package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type tokenFailAccountBackend struct {
	*storage.JSONBackend
	failToken string
	saveErr   error
}

func (b *tokenFailAccountBackend) UpsertAccount(accessToken string, data map[string]any) error {
	if accessToken == b.failToken && b.saveErr != nil {
		return b.saveErr
	}
	return b.JSONBackend.UpsertAccount(accessToken, data)
}

func TestRefreshAccountsReportsPersistenceFailureAndRollsBack(t *testing.T) {
	server := newRefreshPersistenceServer(t)
	defer server.Close()

	dir := t.TempDir()
	backend := &tokenFailAccountBackend{JSONBackend: storage.NewJSONBackend(
		filepath.Join(dir, "accounts.json"),
		filepath.Join(dir, "auth_keys.json"),
	)}
	logs := NewLogService(dir)
	t.Cleanup(func() { _ = logs.Close() })
	accounts := NewAccountService(backend, testAccountConfig{}, NewProxyService(testAccountConfig{}), logs)
	accounts.remoteBaseURL = server.URL
	accounts.browserHTTPClient = func(string, time.Duration) *http.Client { return server.Client() }
	addResult := accounts.AddAccounts([]string{"token-ok", "token-fail"})
	if addResult["added"] != 2 {
		t.Fatalf("added = %#v, want 2", addResult["added"])
	}
	failedBefore := accounts.GetAccount("token-fail")
	backend.failToken = "token-fail"
	backend.saveErr = errors.New("forced account write failure")

	result := accounts.RefreshAccounts(context.Background(), []string{"token-ok", "token-fail"})
	if result["refreshed"] != 1 {
		t.Fatalf("refreshed = %#v, want 1", result["refreshed"])
	}
	refreshErrors, ok := result["errors"].([]map[string]string)
	if !ok || len(refreshErrors) != 1 {
		t.Fatalf("errors = %#v, want one persistence error", result["errors"])
	}
	if refreshErrors[0]["access_token"] != "token-fail" ||
		!strings.Contains(refreshErrors[0]["error"], "forced account write failure") {
		t.Fatalf("persistence error = %#v", refreshErrors[0])
	}
	if got := accounts.GetAccount("token-ok"); got["quota"] != 7 {
		t.Fatalf("successful account = %#v, want quota 7", got)
	}
	if got := accounts.GetAccount("token-fail"); got["quota"] != failedBefore["quota"] || got["email"] != failedBefore["email"] {
		t.Fatalf("failed account mutated: before=%#v after=%#v", failedBefore, got)
	}

	reloaded := NewAccountService(backend, testAccountConfig{}, nil, NewLogService(dir))
	if got := reloaded.GetAccount("token-fail"); got["quota"] != failedBefore["quota"] || got["email"] != failedBefore["email"] {
		t.Fatalf("failed account persisted: before=%#v after=%#v", failedBefore, got)
	}
}

func newRefreshPersistenceServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("<html>ok</html>"))
		case "/backend-api/me":
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			writeJSON(t, w, map[string]any{"email": token + "@example.test", "id": token})
		case "/backend-api/conversation/init":
			writeJSON(t, w, map[string]any{
				"default_model_slug": "gpt-5",
				"limits_progress": []map[string]any{{
					"feature_name": "image_gen",
					"remaining":    7,
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
}
