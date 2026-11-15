package httpapi

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

type stubRoundTripper struct {
	called int
}

func (s *stubRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	s.called++
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader([]byte("ok"))),
		Header:     make(http.Header),
		Request:    req,
	}, nil
}

func TestValidateOutboundProxyURL_BlocksPrivate(t *testing.T) {
	cases := []string{
		"http://0.0.0.1/secret",
		"http://0.255.255.255/secret",
		"http://127.0.0.1/secret",
		"http://localhost/x",
		"http://10.0.0.5/a",
		"http://100.64.0.1/cgnat",
		"http://198.18.0.1/benchmark",
		"http://192.168.1.1/b",
		"http://169.254.169.254/latest/meta-data",
		"http://[64:ff9b::1]/nat64",
		"http://[64:ff9b::7f00:1]/nat64-loopback",
	}
	for _, raw := range cases {
		if err := validateOutboundProxyURL(raw, "https://relay.example.com", false); err == nil {
			t.Fatalf("expected block for %s", raw)
		}
	}
}

func TestValidateOutboundProxyURL_APIKeyRequiresProxyHost(t *testing.T) {
	if err := validateOutboundProxyURL("https://example.com/img.png", "https://relay.example.com", true); err == nil {
		t.Fatal("expected reject when API key sent to non-proxy host")
	}
}

func TestIsBlockedIP(t *testing.T) {
	for _, blocked := range []string{"0.0.0.0", "0.0.0.1", "127.0.0.1", "10.1.2.3", "100.64.1.2", "198.18.0.1", "198.19.255.254", "64:ff9b::1", "64:ff9b:1::1"} {
		if !isBlockedIP(net.ParseIP(blocked)) {
			t.Fatalf("expected %s to be blocked", blocked)
		}
	}
	if isBlockedIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("public should allow")
	}
}

func TestSSRFSafeDialRejectsLoopbackLiteral(t *testing.T) {
	dial := makeSSRFSafeDialContext("https://relay.example.com", false)
	_, err := dial(context.Background(), "tcp", "127.0.0.1:80")
	if err == nil || !strings.Contains(err.Error(), "内网") && !strings.Contains(err.Error(), "本地") {
		t.Fatalf("dial err = %v, want block private/loopback", err)
	}
}

func TestSSRFSafeDialAllowsConfiguredProxyLoopback(t *testing.T) {
	// Self-hosted relay on 127.0.0.1 must be dialable (may fail with connection refused).
	dial := makeSSRFSafeDialContext("http://127.0.0.1:9", true)
	_, err := dial(context.Background(), "tcp", "127.0.0.1:9")
	if err != nil && (strings.Contains(err.Error(), "禁止") || strings.Contains(err.Error(), "内网")) {
		t.Fatalf("proxy base loopback should not be policy-blocked: %v", err)
	}
}

func TestSSRFSafeHTTPClientSetsDialAndRedirect(t *testing.T) {
	client := ssrfSafeHTTPClient(nil, "https://relay.example.com", false)
	if client == nil || client.Transport == nil || client.CheckRedirect == nil {
		t.Fatalf("client incomplete: %#v", client)
	}
}

func TestSSRFSafeHTTPClientCachesTransportAndPreservesCustomRoundTripper(t *testing.T) {
	baseTr := &http.Transport{}
	c1 := ssrfSafeHTTPClient(&http.Client{Transport: baseTr, Timeout: 5 * time.Second}, "https://relay.example.com", true)
	c2 := ssrfSafeHTTPClient(&http.Client{Transport: baseTr, Timeout: 15 * time.Second}, "https://relay.example.com", true)
	c3 := ssrfSafeHTTPClient(c2, "https://relay.example.com", true)
	if c1.Transport != c2.Transport || c2.Transport != c3.Transport {
		t.Fatalf("expected cached *http.Transport reuse, got %p vs %p vs %p", c1.Transport, c2.Transport, c3.Transport)
	}
	if c1.Timeout != 5*time.Second || c2.Timeout != 15*time.Second {
		t.Fatalf("per-client timeout not preserved: c1=%v c2=%v", c1.Timeout, c2.Timeout)
	}

	stub := &stubRoundTripper{}
	customClient := ssrfSafeHTTPClient(&http.Client{Transport: stub}, "https://relay.example.com", false)
	if _, err := customClient.Get("http://0.0.0.1/secret"); err == nil {
		t.Fatal("expected SSRF rejection on 0.0.0.1 before custom RoundTripper")
	}
	if stub.called != 0 {
		t.Fatalf("custom RoundTripper should not have been called for blocked IP, got %d", stub.called)
	}
	resp, err := customClient.Get("http://8.8.8.8/ok.png")
	if err != nil {
		t.Fatalf("expected public IP allowed through custom RoundTripper, got err=%v", err)
	}
	_ = resp.Body.Close()
	if stub.called != 1 {
		t.Fatalf("expected custom RoundTripper to be invoked once, got %d", stub.called)
	}
}
