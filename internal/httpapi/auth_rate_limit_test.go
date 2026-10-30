package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestAuthClientIPDefaultsToRemoteAddr(t *testing.T) {
	t.Setenv("CHATGPT2API_TRUST_PROXY_HEADERS", "")
	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = "203.0.113.9:12345"
	req.Header.Set("X-Forwarded-For", "198.51.100.1")
	if got := authClientIP(req); got != "203.0.113.9" {
		t.Fatalf("authClientIP = %q, want RemoteAddr host (ignore XFF when untrusted)", got)
	}
}

func TestAuthClientIPTrustsXFFWhenEnabled(t *testing.T) {
	t.Setenv("CHATGPT2API_TRUST_PROXY_HEADERS", "true")
	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = "10.0.0.1:80"
	req.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.1")
	if got := authClientIP(req); got != "198.51.100.7" {
		t.Fatalf("authClientIP = %q, want first XFF hop", got)
	}
	_ = os.Unsetenv("CHATGPT2API_TRUST_PROXY_HEADERS")
}

func TestAuthClientIPPrefersCFConnectingIPWhenTrusted(t *testing.T) {
	t.Setenv("CHATGPT2API_TRUST_PROXY_HEADERS", "true")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:80"
	req.Header.Set("CF-Connecting-IP", "198.51.100.20")
	req.Header.Set("X-Forwarded-For", "198.51.100.7")
	if got := authClientIP(req); got != "198.51.100.20" {
		t.Fatalf("authClientIP = %q, want CF-Connecting-IP", got)
	}
}

func TestClientIPSharesAuthClientIPPolicy(t *testing.T) {
	t.Setenv("CHATGPT2API_TRUST_PROXY_HEADERS", "")
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.9:1"
	req.Header.Set("X-Forwarded-For", "198.51.100.1")
	if got := clientIP(req); got != authClientIP(req) || got != "203.0.113.9" {
		t.Fatalf("clientIP=%q authClientIP=%q", clientIP(req), authClientIP(req))
	}
}

func TestSessionCookiePreservesRememberMeAndSkipsAPIKeys(t *testing.T) {
	resetAuthRateLimiterForTest()
	app := newTestApp(t)
	defer app.Close()

	// 1) API key calling /auth/session must NOT write Set-Cookie.
	_, rawAPIKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "cli", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+rawAPIKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/auth/session API key status=%d", res.Code)
	}
	if cookie := findResponseCookie(res.Result(), authSessionCookieName); cookie != nil {
		t.Fatalf("expected no session cookie for API key auth, got %#v", cookie)
	}

	// 2) Successful logins > loginRateMaxHits from same IP must NOT trigger 429.
	var nonRememberToken string
	for i := 0; i < loginRateMaxHits+3; i++ {
		loginReq := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(authJSON(`{"username":"admin","password":"AdminPass123!","remember_me":false}`)))
		loginReq.RemoteAddr = "198.51.100.88:4000"
		loginRes := httptest.NewRecorder()
		app.Handler().ServeHTTP(loginRes, loginReq)
		if loginRes.Code != http.StatusOK {
			t.Fatalf("legitimate login #%d throttled: status=%d body=%s", i+1, loginRes.Code, loginRes.Body.String())
		}
		var body map[string]any
		_ = json.Unmarshal(loginRes.Body.Bytes(), &body)
		nonRememberToken, _ = body["token"].(string)
	}

	// 3) remember_me=false session refresh keeps MaxAge == 0 (session-scoped cookie).
	sessReq := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	sessReq.Header.Set("Authorization", "Bearer "+nonRememberToken)
	sessRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(sessRes, sessReq)
	cookie := findResponseCookie(sessRes.Result(), authSessionCookieName)
	if cookie == nil || cookie.MaxAge != 0 {
		t.Fatalf("remember_me=false session refresh cookie = %#v, want MaxAge=0", cookie)
	}
}
