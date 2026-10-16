package httpapi

import (
	"context"
	"net"
	"strings"
	"testing"
)

func TestValidateOutboundProxyURL_BlocksPrivate(t *testing.T) {
	cases := []string{
		"http://127.0.0.1/secret",
		"http://localhost/x",
		"http://10.0.0.5/a",
		"http://192.168.1.1/b",
		"http://169.254.169.254/latest/meta-data",
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
	if !isBlockedIP(net.ParseIP("127.0.0.1")) {
		t.Fatal("loopback should block")
	}
	if !isBlockedIP(net.ParseIP("10.1.2.3")) {
		t.Fatal("private should block")
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
