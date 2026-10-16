package httpapi

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func enableTestRegistration(t *testing.T, app *App) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration: %d %s", res.Code, res.Body.String())
	}
}

func issueTestDeviceCookie(t *testing.T, app *App, remoteAddr, forwardedFor string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/auth/providers", nil)
	req.RemoteAddr = remoteAddr
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("providers status=%d body=%s", res.Code, res.Body.String())
	}
	for _, cookie := range res.Result().Cookies() {
		if cookie.Name == "chatgpt2api_device" {
			return cookie.Value
		}
	}
	t.Fatal("missing device cookie")
	return ""
}

func registerTestEmailUser(t *testing.T, app *App, name, remoteAddr, deviceCookie, forwardedFor string) *httptest.ResponseRecorder {
	t.Helper()
	email := name + "@example.test"
	deviceCookie = sendTestRegistrationEmailCode(t, app, email, remoteAddr, deviceCookie, forwardedFor)
	body := authJSON(`{"email":"` + email + `","email_code":"123456","password":"Password123","name":"` + name + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.RemoteAddr = remoteAddr
	req.Header.Set("Cookie", "chatgpt2api_device="+deviceCookie)
	req.Header.Set("Content-Type", "application/json")
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	return res
}

func TestRegisterRiskBlocksSecondAttemptForSameIPAndDevice(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	enableTestRegistration(t, app)

	remoteAddr := "203.0.113.77:54321"
	cookie := issueTestDeviceCookie(t, app, remoteAddr, "")
	if res := registerTestEmailUser(t, app, "pair_u1", remoteAddr, cookie, ""); res.Code != http.StatusOK {
		t.Fatalf("first register status=%d body=%s", res.Code, res.Body.String())
	}
	res := registerTestEmailUser(t, app, "pair_u2", remoteAddr, cookie, "")
	if res.Code != http.StatusTooManyRequests || res.Header().Get("Retry-After") == "" {
		t.Fatalf("second register status=%d retry=%q body=%s", res.Code, res.Header().Get("Retry-After"), res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "冷却") {
		t.Fatalf("unexpected body: %s", res.Body.String())
	}

	otherRemote := "198.51.100.9:2222"
	otherCookie := issueTestDeviceCookie(t, app, otherRemote, "")
	if res := registerTestEmailUser(t, app, "pair_other", otherRemote, otherCookie, ""); res.Code != http.StatusOK {
		t.Fatalf("other ip/device status=%d body=%s", res.Code, res.Body.String())
	}
}

// Forged X-Forwarded-For must not split IP risk buckets when proxy headers are untrusted.
func TestRegisterRiskIgnoresForgedXFFByDefault(t *testing.T) {
	t.Setenv("CHATGPT2API_TRUST_PROXY_HEADERS", "")
	app := newTestApp(t)
	defer app.Close()
	enableTestRegistration(t, app)

	remoteAddr := "203.0.113.50:2000"
	for i := 1; i <= 3; i++ {
		forwardedFor := fmt.Sprintf("198.51.100.%d", i)
		cookie := issueTestDeviceCookie(t, app, remoteAddr, forwardedFor)
		res := registerTestEmailUser(t, app, fmt.Sprintf("xff_u%d", i), remoteAddr, cookie, forwardedFor)
		if res.Code != http.StatusOK {
			t.Fatalf("register %d status=%d body=%s", i, res.Code, res.Body.String())
		}
	}
	forwardedFor := "198.51.100.99"
	cookie := issueTestDeviceCookie(t, app, remoteAddr, forwardedFor)
	res := registerTestEmailUser(t, app, "xff_u4", remoteAddr, cookie, forwardedFor)
	if res.Code != http.StatusTooManyRequests || !strings.Contains(res.Body.String(), "IP") {
		t.Fatalf("fourth register status=%d body=%s", res.Code, res.Body.String())
	}
}
