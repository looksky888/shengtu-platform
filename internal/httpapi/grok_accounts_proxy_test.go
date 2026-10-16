package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestGrokFullSSOExportRequiresAdmin(t *testing.T) {
	var upstreamCalls int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "Grok operator",
		APIPermissions: []string{service.APIPermissionKey(http.MethodGet, "/api/grok")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if _, err := app.auth.CreatePasswordUser("grok-operator", "Password123", "Grok Operator", role.ID, true); err != nil {
		t.Fatalf("CreatePasswordUser() error = %v", err)
	}
	token := loginTestUser(t, app, "grok-operator", "Password123")
	request := httptest.NewRequest(http.MethodGet, "/api/grok/accounts/export?include_sso=true", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("response = %d %s, want 403", recorder.Code, recorder.Body.String())
	}
	if upstreamCalls != 0 {
		t.Fatalf("upstream calls = %d, want 0", upstreamCalls)
	}

	request = httptest.NewRequest(http.MethodGet, "/api/grok/accounts/export?include_sso=false", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder = httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || upstreamCalls != 1 {
		t.Fatalf("redacted export response = %d, upstream calls = %d", recorder.Code, upstreamCalls)
	}
}

func TestGrokAdminCanExportFullSSO(t *testing.T) {
	var gotPath, gotQuery string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"items":[{"sso":"secret"}]}`)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	request := httptest.NewRequest(http.MethodGet, "/api/grok/accounts/export?include_sso=true", nil)
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"sso":"secret"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/api/grok/accounts/export" || gotQuery != "include_sso=true" {
		t.Fatalf("upstream request = %q?%s", gotPath, gotQuery)
	}
}

func TestGrokProviderCredentialExportRequiresAdmin(t *testing.T) {
	var upstreamCalls int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"provider":"web","mode":"redacted","count":1,"accounts":[]}`)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name: "Grok exporter", APIPermissions: []string{service.APIPermissionKey(http.MethodPost, "/api/grok")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.CreatePasswordUser("grok-exporter", "Password123", "Grok Exporter", role.ID, true); err != nil {
		t.Fatal(err)
	}
	auth := "Bearer " + loginTestUser(t, app, "grok-exporter", "Password123")

	fullBody := `{"provider":"web","account_ids":["web-1"],"mode":"credentials"}`
	request := httptest.NewRequest(http.MethodPost, "/api/grok/provider-account-exports", strings.NewReader(fullBody))
	request.Header.Set("Authorization", auth)
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden || upstreamCalls != 0 {
		t.Fatalf("full export response=%d upstream=%d", recorder.Code, upstreamCalls)
	}

	redactedBody := `{"provider":"web","account_ids":["web-1"],"mode":"redacted"}`
	request = httptest.NewRequest(http.MethodPost, "/api/grok/provider-account-exports", strings.NewReader(redactedBody))
	request.Header.Set("Authorization", auth)
	recorder = httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || upstreamCalls != 1 {
		t.Fatalf("redacted export response=%d upstream=%d", recorder.Code, upstreamCalls)
	}
	if recorder.Header().Get("Cache-Control") != "no-store" || recorder.Header().Get("Pragma") != "no-cache" {
		t.Fatalf("export cache headers = %#v", recorder.Header())
	}
}

func TestGrokAdminCanExportProviderCredentials(t *testing.T) {
	var gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		gotBody = string(data)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"provider":"build","mode":"credentials","count":0,"accounts":[]}`)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	body := `{"provider":"build","account_ids":["build-1"],"mode":"credentials"}`
	request := httptest.NewRequest(http.MethodPost, "/api/grok/provider-account-exports", strings.NewReader(body))
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || gotBody != body {
		t.Fatalf("response=%d body=%q forwarded=%q", recorder.Code, body, gotBody)
	}
}

func TestRequestsFullGrokSSOExportRecognizesTruthyValues(t *testing.T) {
	for _, value := range []string{"true", "1", "yes", "on"} {
		request := httptest.NewRequest(http.MethodGet, "/api/grok/accounts/export?include_sso="+value, nil)
		if !requestsFullGrokSSOExport(request) {
			t.Errorf("include_sso=%q was not recognized", value)
		}
	}
}

func TestGrokProviderAccountsUsesReadPermissionAndPreservesContract(t *testing.T) {
	var gotPath, gotQuery string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"items":[],"total":0,"page":1,"page_size":25,"summary":{"total":0,"by_provider":{"build":0,"web":0,"console":0},"by_status":{"active":0,"disabled":0,"error":0,"unknown":0},"with_credentials":0,"linked":0},"projection":{"status":"success","account_count":0,"link_count":0,"quota_count":0,"source_counts":{},"warnings":[],"error_code":"","started_at":"now","finished_at":"now","sources":{},"consistency":{}}}`)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "Grok viewer",
		APIPermissions: []string{service.APIPermissionKey(http.MethodGet, "/api/grok")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if _, err := app.auth.CreatePasswordUser("grok-viewer", "Password123", "Grok Viewer", role.ID, true); err != nil {
		t.Fatalf("CreatePasswordUser() error = %v", err)
	}
	token := loginTestUser(t, app, "grok-viewer", "Password123")
	request := httptest.NewRequest(http.MethodGet, "/api/grok/provider-accounts?page=1&page_size=25&provider=web", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/api/grok/provider-accounts" || gotQuery != "page=1&page_size=25&provider=web" {
		t.Fatalf("upstream request = %q?%s", gotPath, gotQuery)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	for _, key := range []string{"items", "total", "page", "page_size", "summary", "projection"} {
		if _, ok := payload[key]; !ok {
			t.Fatalf("response missing %q: %s", key, recorder.Body.String())
		}
	}
}

func TestGrokProviderConversionTaskRequiresPostPermissionAndForwardsBody(t *testing.T) {
	var upstreamCalls int
	var gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		data, _ := io.ReadAll(r.Body)
		gotBody = string(data)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = io.WriteString(w, `{"task":{"id":"provider-task-1","status":"queued"},"reused":false}`)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	readRole, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name: "Grok task viewer", APIPermissions: []string{service.APIPermissionKey(http.MethodGet, "/api/grok")},
	})
	if err != nil {
		t.Fatal(err)
	}
	writeRole, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name: "Grok task operator", APIPermissions: []string{service.APIPermissionKey(http.MethodPost, "/api/grok")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.CreatePasswordUser("task-viewer", "Password123", "Task Viewer", readRole.ID, true); err != nil {
		t.Fatalf("CreatePasswordUser(task-viewer) error = %v", err)
	}
	if _, err := app.auth.CreatePasswordUser("task-operator", "Password123", "Task Operator", writeRole.ID, true); err != nil {
		t.Fatalf("CreatePasswordUser(task-operator) error = %v", err)
	}
	body := `{"operation":"convert","target":"console","strategy":"missing"}`

	request := httptest.NewRequest(http.MethodPost, "/api/grok/provider-account-tasks", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+loginTestUser(t, app, "task-viewer", "Password123"))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden || upstreamCalls != 0 {
		t.Fatalf("read-only response=%d upstream=%d", recorder.Code, upstreamCalls)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/grok/provider-account-tasks", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+loginTestUser(t, app, "task-operator", "Password123"))
	recorder = httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusAccepted || upstreamCalls != 1 || gotBody != body {
		t.Fatalf("write response=%d upstream=%d body=%q", recorder.Code, upstreamCalls, gotBody)
	}
}

func TestGrokProviderDeleteRequiresDeletePermissionAndForwardsBody(t *testing.T) {
	var upstreamCalls int
	var gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		data, _ := io.ReadAll(r.Body)
		gotBody = string(data)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"deleted":1,"roots_deleted":1,"linked_deleted":0}`)
	}))
	defer upstream.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	postRole, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name: "Grok writer", APIPermissions: []string{service.APIPermissionKey(http.MethodPost, "/api/grok")},
	})
	if err != nil {
		t.Fatal(err)
	}
	deleteRole, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name: "Grok deleter", APIPermissions: []string{service.APIPermissionKey(http.MethodDelete, "/api/grok")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.CreatePasswordUser("grok-writer", "Password123", "Grok Writer", postRole.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.CreatePasswordUser("grok-deleter", "Password123", "Grok Deleter", deleteRole.ID, true); err != nil {
		t.Fatal(err)
	}
	body := `{"provider":"web","account_ids":["web-1"],"linked_providers":[],"preview_token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`

	request := httptest.NewRequest(http.MethodDelete, "/api/grok/provider-accounts", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+loginTestUser(t, app, "grok-writer", "Password123"))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden || upstreamCalls != 0 {
		t.Fatalf("post role delete response=%d upstream=%d", recorder.Code, upstreamCalls)
	}

	request = httptest.NewRequest(http.MethodDelete, "/api/grok/provider-accounts", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+loginTestUser(t, app, "grok-deleter", "Password123"))
	recorder = httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || upstreamCalls != 1 || gotBody != body {
		t.Fatalf("delete response=%d upstream=%d body=%q", recorder.Code, upstreamCalls, gotBody)
	}
}
