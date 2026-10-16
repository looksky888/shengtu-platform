package sidecar

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDoJSONForwardsRequestAndInternalToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/register" {
			t.Fatalf("request = %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("X-Internal-Token") != "shared-token" {
			t.Fatalf("internal token = %q", r.Header.Get("X-Internal-Token"))
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("content type = %q", r.Header.Get("Content-Type"))
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if string(body) != `{"target":"grok"}` {
			t.Fatalf("body = %s", body)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	client := New(server.URL+"/", " shared-token ")
	status, body, err := client.DoJSON(context.Background(), http.MethodPost, "/api/register", []byte(`{"target":"grok"}`))
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusCreated || string(body) != `{"ok":true}` {
		t.Fatalf("response = %d %s", status, body)
	}
}

func TestHealthReportsNonSuccessResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(strings.Repeat("x", 250)))
	}))
	defer server.Close()

	err := New(server.URL, "").Health(context.Background())
	if err == nil || !strings.Contains(err.Error(), "status=503") || !strings.HasSuffix(err.Error(), "...") {
		t.Fatalf("Health() error = %v", err)
	}
}

func TestDoJSONRejectsEmptyBaseURL(t *testing.T) {
	if _, _, err := New(" ", "").DoJSON(context.Background(), http.MethodGet, "/health", nil); err == nil {
		t.Fatal("DoJSON succeeded with empty base URL")
	}
}
