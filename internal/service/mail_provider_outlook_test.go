package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseOutlookCredentials(t *testing.T) {
	text := strings.Join([]string{
		"user1@outlook.com----pass1----client-a----refresh-a",
		"user1@outlook.com----pass-dup----client-a----refresh-dup",
		"bad-line",
		"user2@hotmail.com----pass2----client-b----refresh-b",
	}, "\n")
	got := parseOutlookCredentials(text)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
	if got[0].Email != "user1@outlook.com" || got[0].RefreshToken != "refresh-a" {
		t.Fatalf("first = %#v", got[0])
	}
	if got[1].Email != "user2@hotmail.com" {
		t.Fatalf("second = %#v", got[1])
	}
}

func TestMergeOutlookPoolOverridesByEmail(t *testing.T) {
	oldText := "a@outlook.com----p1----c1----r1\nb@outlook.com----p2----c2----r2"
	newText := "b@outlook.com----p2b----c2b----r2b\nc@outlook.com----p3----c3----r3"
	merged := parseOutlookCredentials(mergeOutlookPool(oldText, newText))
	if len(merged) != 3 {
		t.Fatalf("merged len = %d: %#v", len(merged), merged)
	}
	byEmail := map[string]outlookCredential{}
	for _, item := range merged {
		byEmail[strings.ToLower(item.Email)] = item
	}
	if byEmail["b@outlook.com"].RefreshToken != "r2b" {
		t.Fatalf("override failed: %#v", byEmail["b@outlook.com"])
	}
	if byEmail["c@outlook.com"].ClientID != "c3" {
		t.Fatalf("append failed: %#v", byEmail["c@outlook.com"])
	}
}

func TestOutlookTokenProviderCreateAndFetch(t *testing.T) {
	dir := t.TempDir()
	InitOutlookTokenStatePath(dir)

	var tokenCalls, graphCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/token"):
			tokenCalls++
			if err := r.ParseForm(); err != nil {
				t.Errorf("parse form: %v", err)
			}
			if r.Form.Get("refresh_token") != "refresh-a" {
				t.Errorf("refresh_token = %q", r.Form.Get("refresh_token"))
			}
			_, _ = w.Write([]byte(`{"access_token":"access-xyz","expires_in":3600}`))
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/me/messages"):
			graphCalls++
			if got := r.Header.Get("Authorization"); got != "Bearer access-xyz" {
				t.Errorf("Authorization = %q", got)
			}
			_, _ = w.Write([]byte(`{"value":[{"id":"m1","subject":"Verify","receivedDateTime":"2026-07-10T12:00:00Z","from":{"emailAddress":{"address":"noreply@openai.com"}},"body":{"contentType":"Text","content":"Verification code: 654321"},"bodyPreview":"Verification code: 654321"}]}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.String())
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	// Point provider endpoints at test server by temporarily overriding constants via local provider methods.
	// We exercise through createRegisterMailProvider + monkey-patching URL would need refactor;
	// instead construct provider and swap client while calling exchange/graph via full flow with rewritten URLs.
	// Use a thin integration by setting pool and calling methods with injected base via environment-less hooks:
	// create provider then override methods through package-level test helpers.

	// Direct unit path: build provider and call graph with custom client against test server by
	// temporarily rewriting package URLs is not available; so test claim/mark/state + parse/extract path separately
	// and simulate token/graph via local helper functions.
	_ = server
	provider := newRegisterOutlookTokenProvider(registerHTTPMailProvider{
		client: server.Client(),
		conf:   registerMailSettings{RequestTimeout: 0, UserAgent: "test-agent"},
	}, map[string]any{
		"type":          "outlook_token",
		"enable":        true,
		"provider_ref":  "outlook_token#1",
		"mailboxes":     "user1@outlook.com----pass----cid----refresh-a",
		"mode":          "graph",
		"message_limit": 5,
	})

	// Patch endpoints by rewriting request targets through a custom RoundTripper.
	provider.client.Transport = rewriteHostRoundTripper{base: http.DefaultTransport, host: server.URL}

	mailbox, err := provider.CreateMailbox("")
	if err != nil {
		t.Fatalf("CreateMailbox: %v", err)
	}
	if mailbox["address"] != "user1@outlook.com" {
		t.Fatalf("mailbox = %#v", mailbox)
	}

	// Second claim should fail while in_use.
	if _, err := provider.CreateMailbox(""); err == nil {
		t.Fatal("expected no available mailbox while in_use")
	}

	// Override URLs by replacing transport that rewrites known Microsoft hosts.
	messages, err := provider.FetchRecentMessages(mailbox)
	if err != nil {
		t.Fatalf("FetchRecentMessages: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("messages = %#v", messages)
	}
	if got := extractRegisterMailCode(messages[0]); got != "654321" {
		t.Fatalf("code = %q message=%#v", got, messages[0])
	}
	if tokenCalls < 1 || graphCalls < 1 {
		t.Fatalf("tokenCalls=%d graphCalls=%d", tokenCalls, graphCalls)
	}

	// Cached token should avoid extra token call on second fetch.
	before := tokenCalls
	if _, err := provider.FetchRecentMessages(mailbox); err != nil {
		t.Fatalf("second fetch: %v", err)
	}
	if tokenCalls != before {
		t.Fatalf("expected token cache hit, tokenCalls %d -> %d", before, tokenCalls)
	}

	if err := markRegisterMailboxResult(mailbox, true, nil); err != nil {
		t.Fatalf("mark mailbox result: %v", err)
	}
	statePath := filepath.Join(dir, "outlook_token_used.json")
	raw, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read state: %v", err)
	}
	var state map[string]outlookTokenStateEntry
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatalf("unmarshal state: %v", err)
	}
	if state["user1@outlook.com"].State != outlookStateUsed {
		t.Fatalf("state = %#v", state)
	}

	cleared, err := ResetOutlookTokenPoolState("all")
	if err != nil {
		t.Fatalf("reset state: %v", err)
	}
	if cleared != 1 {
		t.Fatalf("cleared = %d", cleared)
	}
}

type rewriteHostRoundTripper struct {
	base http.RoundTripper
	host string
}

func (r rewriteHostRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	switch {
	case strings.Contains(req.URL.Host, "login.microsoftonline.com"):
		target, _ := http.NewRequest(req.Method, r.host+"/common/oauth2/v2.0/token", req.Body)
		target.Header = req.Header.Clone()
		clone = target
	case strings.Contains(req.URL.Host, "graph.microsoft.com"):
		target, _ := http.NewRequest(req.Method, r.host+"/v1.0/me/messages?"+req.URL.RawQuery, req.Body)
		target.Header = req.Header.Clone()
		clone = target
	}
	if r.base == nil {
		r.base = http.DefaultTransport
	}
	return r.base.RoundTrip(clone)
}

func TestRedactAndMergeOutlookPoolsInRegisterService(t *testing.T) {
	dir := t.TempDir()
	InitOutlookTokenStatePath(dir)
	t.Setenv("CHATGPT2API_OUTLOOK_REDACT", "false")
	svc := NewRegisterService(dir, nil)
	updated, err := svc.Update(map[string]any{
		"mail": map[string]any{
			"providers": []map[string]any{{
				"type":      "outlook_token",
				"enable":    true,
				"mode":      "graph",
				"mailboxes": "secret@outlook.com----pw----cid----rtoken",
			}},
		},
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	mail := updated["mail"].(map[string]any)
	providers := mail["providers"].([]map[string]any)
	if !strings.Contains(utilClean(providers[0]["mailboxes"]), "rtoken") {
		t.Fatalf("expected full mailboxes when redaction off, got %#v", providers[0]["mailboxes"])
	}
	if providers[0]["mailboxes_count"] != 1 {
		t.Fatalf("count = %#v", providers[0]["mailboxes_count"])
	}
	t.Setenv("CHATGPT2API_OUTLOOK_REDACT", "true")
	redacted := svc.Get()
	rm := redacted["mail"].(map[string]any)
	rp := rm["providers"].([]map[string]any)
	if utilClean(rp[0]["mailboxes"]) != "" {
		t.Fatalf("expected empty mailboxes when redaction on, got %#v", rp[0]["mailboxes"])
	}
	// Stored config must keep secrets.
	svc.mu.Lock()
	rawProviders := svc.config.Mail.Providers
	svc.mu.Unlock()
	if len(rawProviders) != 1 || !strings.Contains(utilClean(rawProviders[0]["mailboxes"]), "rtoken") {
		t.Fatalf("stored mailboxes missing secret: %#v", rawProviders)
	}

	// Empty mailboxes on update keeps existing pool.
	again, err := svc.Update(map[string]any{
		"mail": map[string]any{
			"providers": []map[string]any{{
				"type":      "outlook_token",
				"enable":    true,
				"mode":      "graph",
				"mailboxes": "",
			}},
		},
	})
	if err != nil {
		t.Fatalf("second Update() error = %v", err)
	}
	_ = again
	svc.mu.Lock()
	rawProviders = svc.config.Mail.Providers
	svc.mu.Unlock()
	if !strings.Contains(utilClean(rawProviders[0]["mailboxes"]), "secret@outlook.com") {
		t.Fatalf("pool wiped unexpectedly: %#v", rawProviders[0]["mailboxes"])
	}

	out, err := svc.ResetOutlookPool("all")
	if err != nil {
		t.Fatalf("ResetOutlookPool() error = %v", err)
	}
	if out == nil {
		t.Fatal("reset returned nil")
	}
}

// small helpers for tests without importing util package naming collisions
func utilStringMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func asMapSlice(v any) []map[string]any {
	switch typed := v.(type) {
	case []map[string]any:
		return typed
	case []any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}
