package httpapi

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// validateOutboundProxyURL enforces SSRF-safe outbound fetches for image proxy media/poll URLs.
//
// Policy:
//   - only http/https
//   - host matching the configured proxy base is always allowed (incl. local/dev relays)
//   - when sendAPIKey is true, host MUST match the configured proxy base (never leak key)
//   - when sendAPIKey is false, other hosts must resolve to public IPs only (CDN)
func validateOutboundProxyURL(rawURL, proxyBase string, sendAPIKey bool) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return fmt.Errorf("URL 为空")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL 无效: %w", err)
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("仅允许 http/https URL")
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("URL 缺少主机名")
	}
	baseHost := proxyBaseHostname(proxyBase)
	if sendAPIKey {
		if baseHost == "" {
			return fmt.Errorf("中转 Base URL 未配置，拒绝携带密钥的外呼")
		}
		if !hostsEqual(host, baseHost) {
			return fmt.Errorf("携带密钥的请求仅允许访问中转主机 %s，当前为 %s", baseHost, host)
		}
		// Same host as configured proxy: allow private/loopback for self-hosted relays & tests.
		return nil
	}
	// Unauthenticated media: same host as proxy base is OK; otherwise public only.
	if baseHost != "" && hostsEqual(host, baseHost) {
		return nil
	}
	return rejectUnsafeHost(host)
}

func proxyBaseHostname(proxyBase string) string {
	proxyBase = strings.TrimSpace(proxyBase)
	if proxyBase == "" {
		return ""
	}
	if !strings.Contains(proxyBase, "://") {
		proxyBase = "https://" + proxyBase
	}
	u, err := url.Parse(proxyBase)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(u.Hostname())
}

func hostsEqual(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}

func rejectUnsafeHost(host string) error {
	host = strings.TrimSpace(host)
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "metadata.google.internal" {
		return fmt.Errorf("禁止访问内网主机: %s", host)
	}
	// Literal IP
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return fmt.Errorf("禁止访问内网/本地地址: %s", host)
		}
		return nil
	}
	// Resolve DNS and require all answers public.
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("无法解析主机 %s: %w", host, err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("主机 %s 无解析结果", host)
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return fmt.Errorf("主机 %s 解析到内网/本地地址 %s", host, ip.String())
		}
	}
	return nil
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	// Cloud metadata common ranges
	if ip4 := ip.To4(); ip4 != nil {
		// 169.254.0.0/16 already covered by link-local; keep explicit
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
		// 100.64.0.0/10 CGNAT
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true
		}
	}
	return false
}

// ssrfSafeHTTPClient returns a client that:
//  1. re-validates every redirect hop (hostname policy), and
//  2. re-validates resolved IPs at Dial time (mitigates DNS rebinding / TOCTOU).
func ssrfSafeHTTPClient(base *http.Client, proxyBase string, sendAPIKey bool) *http.Client {
	if base == nil {
		base = &http.Client{}
	}
	next := *base
	next.Transport = ssrfSafeTransport(base.Transport, proxyBase, sendAPIKey)
	next.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("重定向次数过多")
		}
		if req == nil || req.URL == nil {
			return fmt.Errorf("重定向 URL 无效")
		}
		// Never forward Authorization to a host that fails validation.
		if err := validateOutboundProxyURL(req.URL.String(), proxyBase, sendAPIKey); err != nil {
			return err
		}
		// Strip credentials when redirect leaves the proxy host.
		if sendAPIKey {
			baseHost := proxyBaseHostname(proxyBase)
			if !hostsEqual(req.URL.Hostname(), baseHost) {
				req.Header.Del("Authorization")
			}
		}
		return nil
	}
	return &next
}

func ssrfSafeTransport(base http.RoundTripper, proxyBase string, sendAPIKey bool) http.RoundTripper {
	var tr *http.Transport
	switch t := base.(type) {
	case nil:
		tr = http.DefaultTransport.(*http.Transport).Clone()
	case *http.Transport:
		tr = t.Clone()
	default:
		// Unknown RoundTripper: wrap DefaultTransport for dial safety only.
		tr = http.DefaultTransport.(*http.Transport).Clone()
	}
	tr.DialContext = makeSSRFSafeDialContext(proxyBase, sendAPIKey)
	return tr
}

// makeSSRFSafeDialContext resolves the host, filters blocked IPs (unless host is the
// configured proxy base), then dials a concrete IP. Dialing by IP prevents a second
// DNS lookup that could rebind to a private address after the pre-request check.
func makeSSRFSafeDialContext(proxyBase string, sendAPIKey bool) func(ctx context.Context, network, addr string) (net.Conn, error) {
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	baseHost := proxyBaseHostname(proxyBase)
	_ = sendAPIKey // host allow-list is enforced earlier; dial trusts only proxy base host.
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("地址无效: %w", err)
		}
		host = strings.TrimSpace(host)
		if host == "" {
			return nil, fmt.Errorf("地址缺少主机")
		}
		// Configured relay host (name or IP): may be private / loopback for self-hosted.
		if baseHost != "" && hostsEqual(host, baseHost) {
			return dialer.DialContext(ctx, network, addr)
		}
		// Literal IP target.
		if ip := net.ParseIP(host); ip != nil {
			if isBlockedIP(ip) {
				return nil, fmt.Errorf("禁止连接到内网/本地地址: %s", ip.String())
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		}
		lower := strings.ToLower(host)
		if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "metadata.google.internal" {
			return nil, fmt.Errorf("禁止访问内网主机: %s", host)
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("无法解析主机 %s: %w", host, err)
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("主机 %s 无解析结果", host)
		}
		var lastErr error
		blockedAll := true
		for _, ipa := range ips {
			ip := ipa.IP
			if isBlockedIP(ip) {
				lastErr = fmt.Errorf("主机 %s 解析到内网/本地地址 %s", host, ip.String())
				continue
			}
			blockedAll = false
			// Dial by IP so the connection cannot rebind via a second hostname lookup.
			conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if dialErr == nil {
				return conn, nil
			}
			lastErr = dialErr
		}
		if lastErr == nil {
			lastErr = fmt.Errorf("无法连接到 %s", host)
		}
		if blockedAll {
			return nil, lastErr
		}
		return nil, lastErr
	}
}
