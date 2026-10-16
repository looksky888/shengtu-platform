package updaterclient

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientReadsStatusWithoutExposingToken(t *testing.T) {
	token := "0123456789abcdef0123456789abcdef"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			t.Error("missing bearer token")
		}
		_, _ = w.Write([]byte(`{"status":"idle","updated_at":"now","checks":[]}`))
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_HOST_UPDATER_TOKEN", token)
	t.Setenv("CHATGPT2API_HOST_UPDATER_URL", server.URL)
	client, reason := NewFromEnv()
	if client == nil || reason != "" {
		t.Fatalf("NewFromEnv() = %v, %q", client, reason)
	}
	state, err := client.Status(t.Context())
	if err != nil || state.Status != "idle" {
		t.Fatalf("Status() = %#v, %v", state, err)
	}
}

func TestClientRejectsRemoteHTTPURL(t *testing.T) {
	t.Setenv("CHATGPT2API_HOST_UPDATER_TOKEN", "0123456789abcdef0123456789abcdef")
	t.Setenv("CHATGPT2API_HOST_UPDATER_URL", "http://example.com:8080")
	client, reason := NewFromEnv()
	if client != nil || reason == "" {
		t.Fatalf("NewFromEnv() = %v, %q", client, reason)
	}
}

func TestClientRejectsLoopbackPrefixLookalike(t *testing.T) {
	t.Setenv("CHATGPT2API_HOST_UPDATER_TOKEN", "0123456789abcdef0123456789abcdef")
	t.Setenv("CHATGPT2API_HOST_UPDATER_URL", "http://localhost.example.test:8080")
	client, reason := NewFromEnv()
	if client != nil || reason == "" {
		t.Fatalf("NewFromEnv() = %v, %q", client, reason)
	}
}
