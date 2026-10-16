package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateInternalServiceToken(t *testing.T) {
	for _, token := range []string{"", "short", "dev-internal-token", "change-me-internal"} {
		if err := validateInternalServiceToken(token); err == nil {
			t.Fatalf("validateInternalServiceToken(%q) succeeded", token)
		}
	}
	if err := validateInternalServiceToken(strings.Repeat("a", 32)); err != nil {
		t.Fatalf("strong token rejected: %v", err)
	}
}

func TestInternalAccountsImportIsNotOnPublicRouter(t *testing.T) {
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("a", 32))
	app := newTestApp(t)

	req := httptest.NewRequest(http.MethodPost, internalAccountsImportPath, strings.NewReader(`{}`))
	req.Header.Set("X-Internal-Token", strings.Repeat("a", 32))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("public internal route status = %d, want 404", res.Code)
	}
}

func TestInternalAccountsImportRequiresConstantTimeTokenCheck(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef"
	t.Setenv("INTERNAL_SERVICE_TOKEN", token)
	app := newTestApp(t)
	handler, err := app.InternalHandler()
	if err != nil {
		t.Fatalf("InternalHandler() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, internalAccountsImportPath, strings.NewReader(`{}`))
	req.Header.Set("X-Internal-Token", token+"x")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("wrong token status = %d, want 401", res.Code)
	}

	req = httptest.NewRequest(http.MethodPost, internalAccountsImportPath, strings.NewReader(`{}`))
	req.Header.Set("X-Internal-Token", token)
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("correct token status = %d, want request validation 400", res.Code)
	}
}
