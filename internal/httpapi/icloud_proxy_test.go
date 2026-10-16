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

func TestICloudBridgeStatusReportsDisabledFeature(t *testing.T) {
	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "false")
	app := newTestApp(t)

	unauthenticated := httptest.NewRequest(http.MethodGet, "/api/icloud/bridge-status", nil)
	unauthenticatedRecorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(unauthenticatedRecorder, unauthenticated)
	if unauthenticatedRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated response = %d, want 401", unauthenticatedRecorder.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/icloud/bridge-status", nil)
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	var response iCloudBridgeStatusResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Enabled || response.Reachable || response.Error == "" {
		t.Fatalf("disabled bridge response = %#v", response)
	}
}

func TestICloudDisabledFeatureKeepsOtherRoutesUnavailable(t *testing.T) {
	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "false")
	app := newTestApp(t)
	request := httptest.NewRequest(http.MethodGet, "/api/icloud/status", nil)
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("response = %d %s, want 404", recorder.Code, recorder.Body.String())
	}
}

func TestMapICloudPublicMailboxCodePath(t *testing.T) {
	path := "public/v1/mailboxes/alias%40icloud.com/code"
	got, ok := mapICloudUpstreamPath(path)
	if !ok || got != "/api/v1/mailboxes/alias%40icloud.com/code" {
		t.Fatalf("mapped path = %q, ok=%v", got, ok)
	}
}

func TestMapICloudMailboxLookupPath(t *testing.T) {
	got, ok := mapICloudUpstreamPath("mailboxes/lookup")
	if !ok || got != "/api/v1/mailboxes/lookup" {
		t.Fatalf("mapped path = %q, ok=%v", got, ok)
	}
}

func TestICloudPublicMailboxCodeOmitsSensitiveAuditData(t *testing.T) {
	request := httptest.NewRequest("GET", "/api/icloud/public/v1/mailboxes/alias@icloud.com/code?key=secret-token", nil)
	if !isICloudPublicMailboxCodeRequest(request) {
		t.Fatal("public mailbox code request was not recognized")
	}
	if got := captureAuditRequestArgs(request); got != nil {
		t.Fatalf("audit request args = %#v, want nil", got)
	}
	if !omitAuditResponseBody(request) {
		t.Fatal("mailbox code response must be omitted from audit log")
	}
}

func TestICloudPublicMailboxCodeProxyKeepsTokenAuthAtSidecar(t *testing.T) {
	var gotPath, gotKey, gotInternalHeader, gotAuthorization, gotAPIKey string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.URL.Query().Get("key")
		gotInternalHeader = r.Header.Get("X-ChatGPT2API-Internal")
		gotAuthorization = r.Header.Get("Authorization")
		gotAPIKey = r.Header.Get("X-API-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"success":true,"code":"123456"}`)
	}))
	defer upstream.Close()

	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "true")
	t.Setenv("ICLOUD_PRIVACY_MAIL_BASE_URL", upstream.URL)
	app := &App{config: newTestConfigStore(t)}
	request := httptest.NewRequest("GET", "/api/icloud/public/v1/mailboxes/alias@icloud.com/code?key=mailbox-token", nil)
	request.Header.Set("Authorization", "Bearer header-token")
	request.Header.Set("X-API-Key", "api-key-token")
	recorder := httptest.NewRecorder()
	app.handleICloudProxy(recorder, request)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"code":"123456"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/api/v1/mailboxes/alias@icloud.com/code" || gotKey != "mailbox-token" {
		t.Fatalf("upstream request = %q key=%q", gotPath, gotKey)
	}
	if gotInternalHeader != "" {
		t.Fatalf("public proxy must not bypass sidecar token auth, internal header=%q", gotInternalHeader)
	}
	if gotAuthorization != "Bearer header-token" || gotAPIKey != "api-key-token" {
		t.Fatalf("public auth headers = Authorization %q X-API-Key %q", gotAuthorization, gotAPIKey)
	}
	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", recorder.Header().Get("Cache-Control"))
	}
}

func TestICloudPublicMailboxCodePathAllowlist(t *testing.T) {
	tests := map[string]bool{
		"public/v1/mailboxes/alias%40icloud.com/code":       true,
		"/public/v1/mailboxes/alias%40icloud.com/code/":     true,
		"public/v1/mailboxes/alias%40icloud.com/messages":   false,
		"public/v1/mailboxes/alias%40icloud.com/code/extra": false,
		"public/v1/mailboxes//code":                         false,
		"mailboxes/alias%40icloud.com/code":                 false,
	}
	for path, want := range tests {
		if got := isICloudPublicMailboxCodePath(path); got != want {
			t.Errorf("isICloudPublicMailboxCodePath(%q) = %v, want %v", path, got, want)
		}
	}
}

func TestICloudProxyRejectsNonAdminWithICloudPermission(t *testing.T) {
	var upstreamCalls int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "true")
	t.Setenv("ICLOUD_PRIVACY_MAIL_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("i", 32))
	app := newTestApp(t)
	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "iCloud operator",
		APIPermissions: []string{service.APIPermissionKey(http.MethodGet, "/api/icloud")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if _, err := app.auth.CreatePasswordUser("icloud-operator", "Password123", "iCloud Operator", role.ID, true); err != nil {
		t.Fatalf("CreatePasswordUser() error = %v", err)
	}
	token := loginTestUser(t, app, "icloud-operator", "Password123")
	request := httptest.NewRequest(http.MethodGet, "/api/icloud/runtime/export", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("response = %d %s, want 403", recorder.Code, recorder.Body.String())
	}
	if upstreamCalls != 0 {
		t.Fatalf("upstream calls = %d, want 0", upstreamCalls)
	}
}

func TestICloudAdminProxyForwardsInternalServiceToken(t *testing.T) {
	internalToken := strings.Repeat("s", 32)
	var gotMarker, gotToken, gotAuthorization, gotAPIKey string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMarker = r.Header.Get("X-ChatGPT2API-Internal")
		gotToken = r.Header.Get("X-Internal-Token")
		gotAuthorization = r.Header.Get("Authorization")
		gotAPIKey = r.Header.Get("X-API-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"success":true}`)
	}))
	defer upstream.Close()

	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "true")
	t.Setenv("ICLOUD_PRIVACY_MAIL_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", internalToken)
	app := newTestApp(t)
	request := httptest.NewRequest(http.MethodGet, "/api/icloud/status", nil)
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	request.Header.Set("X-API-Key", "must-not-forward")
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if gotMarker != "icloud-privacy-mail" || gotToken != internalToken {
		t.Fatalf("internal auth headers = marker %q token %q", gotMarker, gotToken)
	}
	if gotAuthorization != "" || gotAPIKey != "" {
		t.Fatalf("management proxy leaked caller credentials: Authorization %q X-API-Key %q", gotAuthorization, gotAPIKey)
	}
}

func TestICloudBridgeStatusChecksAuthenticatedInternalAPI(t *testing.T) {
	internalToken := strings.Repeat("h", 32)
	var gotPath, gotMarker, gotToken string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMarker = r.Header.Get("X-ChatGPT2API-Internal")
		gotToken = r.Header.Get("X-Internal-Token")
		_, _ = io.WriteString(w, `{"success":true}`)
	}))
	defer upstream.Close()

	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "true")
	t.Setenv("ICLOUD_PRIVACY_MAIL_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", internalToken)
	app := newTestApp(t)
	request := httptest.NewRequest(http.MethodGet, "/api/icloud/bridge-status", nil)
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"reachable":true`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/api/status" || gotMarker != "icloud-privacy-mail" || gotToken != internalToken {
		t.Fatalf("health request = path %q marker %q token %q", gotPath, gotMarker, gotToken)
	}
}

func TestICloudBridgeStatusRejectsUpstreamAuthFailure(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer upstream.Close()

	t.Setenv("CHATGPT2API_FEATURE_ICLOUD", "true")
	t.Setenv("ICLOUD_PRIVACY_MAIL_BASE_URL", upstream.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("h", 32))
	app := newTestApp(t)
	request := httptest.NewRequest(http.MethodGet, "/api/icloud/bridge-status", nil)
	request.Header.Set("Authorization", adminAuthHeader(t, app))
	recorder := httptest.NewRecorder()
	app.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"reachable":false`) ||
		!strings.Contains(recorder.Body.String(), `"status_code":401`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}
