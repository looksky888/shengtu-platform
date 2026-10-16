package hostupdate

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAppControlClientDrainStatusAndResume(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"detail":{"error":{"message":"invalid token"}}}`))
			return
		}
		expectedMethod := http.MethodPost
		if r.URL.Path == appStatusPath {
			expectedMethod = http.MethodGet
		}
		if r.Method != expectedMethod {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, _ = w.Write([]byte(`{"message":"ok","drained":true,"tasks":{"draining":true,"drained":true},"requests":{"draining":true,"drained":true}}`))
	}))
	defer server.Close()
	client, err := newAppControlClient(server.URL, token, &http.Client{Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}

	for name, call := range map[string]func(context.Context) (AppDrainState, error){
		"drain":  client.beginDrain,
		"status": client.status,
		"resume": client.resume,
	} {
		t.Run(name, func(t *testing.T) {
			state, err := call(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if !state.Drained || !state.Tasks.Draining || !state.Requests.Draining {
				t.Fatalf("state = %#v", state)
			}
		})
	}
}

func TestAppControlClientRejectsUnsafeConfigurationAndReportsAPIError(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef"
	if _, err := newAppControlClient("http://example.com", token, http.DefaultClient); err == nil {
		t.Fatal("non-loopback control URL accepted")
	}
	if _, err := newAppControlClient("http://127.0.0.1:8092", "short", http.DefaultClient); err == nil {
		t.Fatal("short control token accepted")
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"detail":{"error":{"message":"invalid token"}}}`))
	}))
	defer server.Close()
	client, err := newAppControlClient(server.URL, token, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.status(context.Background())
	if err == nil || !strings.Contains(err.Error(), "HTTP 401: invalid token") || strings.Contains(err.Error(), token) {
		t.Fatalf("error = %v", err)
	}
}
