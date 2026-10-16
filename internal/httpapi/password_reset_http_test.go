package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestPasswordResetWorksWhenRegistrationClosed(t *testing.T) {
	app := newTestApp(t)
	adminToken := adminAuthHeader(t, app)
	setRegistrationEnabledForPasswordResetTest(t, app, adminToken, true)
	oldSession := registerTestUser(t, app, "reset-http@example.test", "重置用户", "")
	setRegistrationEnabledForPasswordResetTest(t, app, adminToken, false)

	req := httptest.NewRequest(http.MethodGet, "/auth/providers", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("providers status=%d body=%s", res.Code, res.Body.String())
	}
	var providers AuthProvidersPublic
	if err := json.Unmarshal(res.Body.Bytes(), &providers); err != nil {
		t.Fatalf("providers json: %v", err)
	}
	if providers.Registration.Enabled || !providers.PasswordReset.Enabled || providers.PasswordReset.CodeLength != 6 {
		t.Fatalf("providers contract=%#v", providers)
	}

	unknownDelivery, _ := sendPasswordResetCodeForTest(t, app, "unknown@example.test", "")
	knownDelivery, deviceID := sendPasswordResetCodeForTest(t, app, "reset-http@example.test", "")
	if fmt.Sprint(unknownDelivery) != fmt.Sprint(knownDelivery) {
		t.Fatalf("unknown account response differs: unknown=%#v known=%#v", unknownDelivery, knownDelivery)
	}
	repeatedUnknown, _ := sendPasswordResetCodeForTest(t, app, "unknown@example.test", "")
	repeatedKnown, _ := sendPasswordResetCodeForTest(t, app, "reset-http@example.test", deviceID)
	if fmt.Sprint(repeatedUnknown) != fmt.Sprint(repeatedKnown) {
		t.Fatalf("repeated response reveals account: unknown=%#v known=%#v", repeatedUnknown, repeatedKnown)
	}

	resetBody := `{"email":"reset-http@example.test","email_code":"000000","new_password":"NewPassword456"}`
	req = httptest.NewRequest(http.MethodPost, "/auth/password-reset", strings.NewReader(resetBody))
	req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceID})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "邮箱或验证码无效") {
		t.Fatalf("wrong code status=%d body=%s", res.Code, res.Body.String())
	}

	resetBody = fmt.Sprintf(`{"email":"reset-http@example.test","email_code":%q,"new_password":"NewPassword456"}`, testRegistrationEmailCode)
	req = httptest.NewRequest(http.MethodPost, "/auth/password-reset", strings.NewReader(resetBody))
	req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceID})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("reset status=%d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+oldSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("old session status=%d body=%s", res.Code, res.Body.String())
	}
	assertPasswordLoginStatus(t, app, "reset-http@example.test", "Password123", http.StatusBadRequest)
	assertPasswordLoginStatus(t, app, "reset-http@example.test", "NewPassword456", http.StatusOK)
}

func sendPasswordResetCodeForTest(t *testing.T, app *App, email, deviceID string) (map[string]any, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/auth/password-reset/email-code", strings.NewReader(fmt.Sprintf(`{"email":%q}`, email)))
	if deviceID != "" {
		req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceID})
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("send password reset code status=%d body=%s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("password reset delivery json: %v", err)
	}
	if deviceID == "" {
		cookie := findResponseCookie(res.Result(), service.DeviceCookieName())
		if cookie == nil || cookie.Value == "" {
			t.Fatal("password reset email did not issue device cookie")
		}
		deviceID = cookie.Value
	}
	return body, deviceID
}

func setRegistrationEnabledForPasswordResetTest(t *testing.T, app *App, adminToken string, enabled bool) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(fmt.Sprintf(`{"registration_enabled":%t}`, enabled)))
	req.Header.Set("Authorization", adminToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("set registration_enabled=%t status=%d body=%s", enabled, res.Code, res.Body.String())
	}
}

func assertPasswordLoginStatus(t *testing.T, app *App, email, password string, want int) {
	t.Helper()
	body := authJSON(fmt.Sprintf(`{"username":%q,"password":%q}`, email, password))
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != want {
		t.Fatalf("login status=%d want=%d body=%s", res.Code, want, res.Body.String())
	}
}
