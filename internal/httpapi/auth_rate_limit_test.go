package httpapi

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
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
