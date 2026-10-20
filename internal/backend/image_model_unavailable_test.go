package backend

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAutoImage404OnlyActualConversation(t *testing.T) {
	for _, tc := range []struct {
		name, model, body string
		status            int
		match             bool
	}{
		{"exact", "auto", `{"detail":"Model not found"}`, 404, true},
		{"other model", "gpt-5.5", `{"detail":"Model not found"}`, 404, false},
		{"explicit image 2.5", "gpt-image-2.5-flare", `{"detail":"Model not found"}`, 404, false},
		{"other status", "auto", `{"detail":"Model not found"}`, 403, false},
		{"whitespace detail", "auto", `{"detail":"Model not found "}`, 404, false},
		{"nested detail", "auto", `{"detail":{"message":"Model not found"}}`, 404, false},
		{"different key", "auto", `{"error":"Model not found"}`, 404, false},
		{"html", "auto", "<h1>Model not found</h1>", 404, false},
		{"trailing data", "auto", `{"detail":"Model not found"}oops`, 404, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				w.Write([]byte(tc.body))
			}))
			defer server.Close()
			client := NewClient("test-account", nil, nil)
			client.BaseURL = server.URL
			_, err := client.startImageGeneration(context.Background(), "fixture", ChatRequirements{}, "", tc.model, nil, "trace-fixture")
			if errors.Is(err, ErrAutoImageModelNotFound) != tc.match {
				t.Fatalf("unexpected classification: %v", err)
			}
			_, err = client.prepareImageConversation(context.Background(), "fixture", ChatRequirements{}, tc.model, "trace-fixture")
			if errors.Is(err, ErrAutoImageModelNotFound) {
				t.Fatal("prepare must not classify as actual conversation failure")
			}
		})
	}
}
