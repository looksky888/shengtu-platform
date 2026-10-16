package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEmailRegistrationAndSettingsContracts(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	adminToken := adminAuthHeader(t, app)
	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", adminToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration status=%d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/providers", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("providers status=%d body=%s", res.Code, res.Body.String())
	}
	var providers map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &providers); err != nil {
		t.Fatalf("providers json: %v", err)
	}
	registration, _ := providers["registration"].(map[string]any)
	email, _ := registration["email"].(map[string]any)
	if email["enabled"] != true || email["required"] != true || email["code_length"] != float64(6) {
		t.Fatalf("providers email contract=%#v", email)
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/email-code", strings.NewReader(`{"email":"not-an-email"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("invalid email status=%d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/email-settings", nil)
	req.Header.Set("Authorization", adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("email settings status=%d body=%s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), `"password"`) {
		t.Fatalf("email settings exposed password field: %s", res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"has_password"`) {
		t.Fatalf("email settings missing has_password: %s", res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/email-settings/test", strings.NewReader(`{"recipient":"owner@example.test"}`))
	req.Header.Set("Authorization", adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"sent":true`) {
		t.Fatalf("test email status=%d body=%s", res.Code, res.Body.String())
	}
}
