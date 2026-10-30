package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestApplyUpstreamClearanceToHeaders(t *testing.T) {
	bundle := &UpstreamClearanceBundle{
		UserAgent: "TestUA/1.0",
		Cookies: []UpstreamClearanceCookie{
			{Name: "cf_clearance", Value: "abc"},
			{Name: "other", Value: "x"},
		},
	}
	h := ApplyUpstreamClearanceToHeaders(map[string]string{"Accept": "text/html"}, bundle)
	if h["User-Agent"] != "TestUA/1.0" {
		t.Fatalf("ua = %q", h["User-Agent"])
	}
	if !strings.Contains(h["Cookie"], "cf_clearance=abc") || !strings.Contains(h["Cookie"], "other=x") {
		t.Fatalf("cookie = %q", h["Cookie"])
	}
}

func TestApplyUpstreamClearancePreservesExistingUserAgent(t *testing.T) {

	bundle := &UpstreamClearanceBundle{UserAgent: "FlareSolverrUA/1.0"}
	h := ApplyUpstreamClearanceToHeaders(map[string]string{"User-Agent": "AccountUA/1.0"}, bundle)
	if h["User-Agent"] != "AccountUA/1.0" {
		t.Fatalf("existing ua overwritten = %q", h["User-Agent"])
	}
}

func TestApplyUpstreamClearanceReplacesStaleCookie(t *testing.T) {
	bundle := &UpstreamClearanceBundle{Cookies: []UpstreamClearanceCookie{{Name: "cf_clearance", Value: "fresh"}}}
	h := ApplyUpstreamClearanceToHeaders(map[string]string{"Cookie": "session=keep; cf_clearance=stale"}, bundle)
	if !strings.Contains(h["Cookie"], "session=keep") || !strings.Contains(h["Cookie"], "cf_clearance=fresh") {
		t.Fatalf("cookie = %q", h["Cookie"])
	}
	if strings.Contains(h["Cookie"], "cf_clearance=stale") {
		t.Fatalf("stale clearance cookie retained: %q", h["Cookie"])
	}
}

func TestUpstreamClearanceBundleValidFor(t *testing.T) {
	now := time.Now()
	b := &UpstreamClearanceBundle{
		TargetHost: "chatgpt.com",
		ProxyURL:   "http://privoxy:8118",
		UserAgent:  "ua",
		CreatedAt:  now,
		ExpiresAt:  now.Add(time.Hour),
	}
	if !b.validFor("chatgpt.com", "http://privoxy:8118", now) {
		t.Fatal("expected valid")
	}
	if b.validFor("chatgpt.com", "http://other:1", now) {
		t.Fatal("proxy mismatch should invalidate")
	}
	if b.validFor("chatgpt.com", "http://privoxy:8118", now.Add(2*time.Hour)) {
		t.Fatal("expired should invalidate")
	}
}

func TestGetUpstreamClearanceCoalescesConcurrentRefresh(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		time.Sleep(150 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","solution":{"userAgent":"TestUA/1.0","cookies":[{"name":"cf_clearance","value":"abc","domain":".chatgpt.com","path":"/"}]}}`))
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", server.URL)
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", "10")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_REFRESH_INTERVAL", "3600")
	InvalidateUpstreamClearance()

	start := make(chan struct{})
	var wg sync.WaitGroup
	results := make([]*UpstreamClearanceBundle, 2)
	errs := make([]error, 2)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = GetUpstreamClearance(context.Background(), true)
		}(i)
	}
	close(start)
	wg.Wait()
	if got := requests.Load(); got != 1 {
		t.Fatalf("refresh requests = %d, want 1", got)
	}
	for i := range results {
		if errs[i] != nil || results[i] == nil {
			t.Fatalf("call %d: bundle=%v err=%v", i, results[i], errs[i])
		}
	}
}

func TestGetUpstreamClearanceForceRefreshReplacesFreshBundle(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","solution":{"userAgent":"TestUA/1.0","cookies":[{"name":"cf_clearance","value":"token-` + strconv.Itoa(int(current)) + `","domain":".chatgpt.com","path":"/"}]}}`))
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", server.URL)
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", "10")
	InvalidateUpstreamClearance()
	t.Cleanup(InvalidateUpstreamClearance)

	first, err := GetUpstreamClearance(context.Background(), false)
	if err != nil || first == nil {
		t.Fatalf("first bundle=%v err=%v", first, err)
	}
	second, err := GetUpstreamClearance(context.Background(), true)
	if err != nil || second == nil {
		t.Fatalf("second bundle=%v err=%v", second, err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("refresh requests=%d, want 2", got)
	}
	if first.Cookies[0].Value == second.Cookies[0].Value {
		t.Fatalf("forced refresh reused stale cookie %q", second.Cookies[0].Value)
	}
}

func TestCachedUpstreamClearanceDoesNotFetch(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","solution":{"userAgent":"TestUA/1.0","cookies":[{"name":"cf_clearance","value":"abc","domain":".chatgpt.com","path":"/"}]}}`))
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", server.URL)
	InvalidateUpstreamClearance()
	t.Cleanup(InvalidateUpstreamClearance)

	if bundle := CachedUpstreamClearance(); bundle != nil {
		t.Fatalf("uncached bundle = %#v, want nil", bundle)
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("cache read made %d FlareSolverr requests, want 0", got)
	}
	if _, err := GetUpstreamClearance(context.Background(), true); err != nil {
		t.Fatalf("refresh error = %v", err)
	}
	if bundle := CachedUpstreamClearance(); bundle == nil {
		t.Fatal("cached bundle = nil after refresh")
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("requests = %d, want 1", got)
	}
}

func TestChallengeRefreshReusesRecentFailure(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		http.Error(w, "challenge timeout", http.StatusInternalServerError)
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", server.URL)
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", "10")
	InvalidateUpstreamClearance()
	t.Cleanup(InvalidateUpstreamClearance)

	if _, err := RefreshUpstreamClearanceForChallenge(context.Background()); err == nil {
		t.Fatal("first challenge refresh error = nil")
	}
	if _, err := RefreshUpstreamClearanceForChallenge(context.Background()); err == nil {
		t.Fatal("second challenge refresh error = nil")
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("FlareSolverr requests = %d, want 1", got)
	}
}

func TestGetUpstreamClearanceStripsOpenAISessionCookiesAndIsolatesProxies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","solution":{"userAgent":"TestUA/1.0","cookies":[
			{"name":"cf_clearance","value":"cf-ok","domain":".chatgpt.com","path":"/"},
			{"name":"__cf_bm","value":"bm-ok","domain":".chatgpt.com","path":"/"},
			{"name":"oai-sc","value":"restricted","domain":".chatgpt.com","path":"/"},
			{"name":"oai-did","value":"shared-device","domain":".chatgpt.com","path":"/"}
		]}}`))
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", server.URL)
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", "10")
	InvalidateUpstreamClearance()
	t.Cleanup(InvalidateUpstreamClearance)

	bundleA, err := GetUpstreamClearanceForProxy(context.Background(), "http://proxy-a:8118", true)
	if err != nil || bundleA == nil {
		t.Fatalf("bundleA=%v err=%v", bundleA, err)
	}
	headers := ApplyUpstreamClearanceToHeaders(map[string]string{}, bundleA)
	if strings.Contains(headers["Cookie"], "oai-sc") || strings.Contains(headers["Cookie"], "oai-did") {
		t.Fatalf("OpenAI session/device cookie leaked into clearance headers: %q", headers["Cookie"])
	}
	if !strings.Contains(headers["Cookie"], "cf_clearance=cf-ok") || !strings.Contains(headers["Cookie"], "__cf_bm=bm-ok") {
		t.Fatalf("expected Cloudflare cookies missing: %q", headers["Cookie"])
	}
	if CachedUpstreamClearanceForProxy("http://proxy-a:8118") == nil {
		t.Fatal("expected cached clearance for proxy-a")
	}
	if CachedUpstreamClearanceForProxy("http://proxy-b:8118") != nil {
		t.Fatal("proxy-a clearance must not bleed into proxy-b")
	}
}
