package app

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultICloudIMAPHost = "imap.mail.me.com"
	defaultICloudIMAPPort = 993
	imapIdleReadTimeout   = 25 * time.Minute
)

var iCloudIMAPDNSServers = []string{"1.1.1.1:53", "8.8.8.8:53", "127.0.0.53:53"}
var iCloudIMAPFallbackIPv4 = []net.IP{
	net.IPv4(17, 57, 152, 32),
	net.IPv4(17, 57, 152, 35),
	net.IPv4(17, 57, 155, 39),
	net.IPv4(17, 42, 251, 69),
	net.IPv4(17, 42, 251, 72),
	net.IPv4(17, 56, 9, 32),
	net.IPv4(17, 156, 192, 7),
}

type iCloudIMAPSyncResult struct {
	MessagesByMailbox map[string][]ICloudSyncedMessage
	LastUID           string
}

func newICloudIMAPDialer(serverName string) tls.Dialer {
	serverName = firstNonEmpty(strings.TrimSpace(serverName), defaultICloudIMAPHost)
	return tls.Dialer{
		NetDialer: &net.Dialer{
			Timeout:  15 * time.Second,
			Resolver: newICloudIMAPResolver(iCloudIMAPDNSServers),
		},
		Config: &tls.Config{
			ServerName: serverName,
			MinVersion: tls.VersionTLS12,
		},
	}
}

func dialICloudIMAPTLS(ctx context.Context, serverName string, port int) (net.Conn, error) {
	serverName = firstNonEmpty(strings.TrimSpace(serverName), defaultICloudIMAPHost)
	if port <= 0 {
		port = defaultICloudIMAPPort
	}
	var lastErr error
	if strings.EqualFold(strings.TrimSuffix(serverName, "."), defaultICloudIMAPHost) {
		if conn, err := dialICloudIMAPTLSIPs(ctx, serverName, port, iCloudIMAPFallbackIPv4); err == nil {
			return conn, nil
		} else {
			lastErr = err
		}
	}
	ips, lookupErr := lookupICloudIMAPIPv4(ctx, serverName)
	if len(appendUniqueIPv4(nil, ips...)) > 0 {
		if conn, err := dialICloudIMAPTLSIPs(ctx, serverName, port, ips); err == nil {
			return conn, nil
		} else if err != nil {
			lastErr = err
		}
	}
	address := net.JoinHostPort(serverName, strconv.Itoa(port))
	dialer := newICloudIMAPDialer(serverName)
	conn, err := dialer.DialContext(ctx, "tcp4", address)
	if err == nil {
		return conn, nil
	}
	if lastErr != nil {
		return nil, fmt.Errorf("IMAP IPv4 直连失败：%v；域名拨号失败：%w", lastErr, err)
	}
	if lookupErr != nil {
		return nil, fmt.Errorf("IMAP DNS-over-TCP 解析失败：%v；域名拨号失败：%w", lookupErr, err)
	}
	return nil, err
}

func dialICloudIMAPTLSIPs(ctx context.Context, serverName string, port int, ips []net.IP) (net.Conn, error) {
	ips = appendUniqueIPv4(nil, ips...)
	if len(ips) == 0 {
		return nil, errors.New("no IPv4 addresses")
	}
	dialCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	type result struct {
		conn net.Conn
		err  error
	}
	results := make(chan result, len(ips))
	var wg sync.WaitGroup
	for _, ip := range ips {
		ip := ip
		wg.Add(1)
		go func() {
			defer wg.Done()
			address := net.JoinHostPort(ip.String(), strconv.Itoa(port))
			dialer := tls.Dialer{
				NetDialer: &net.Dialer{Timeout: 5 * time.Second},
				Config: &tls.Config{
					ServerName: serverName,
					MinVersion: tls.VersionTLS12,
				},
			}
			conn, err := dialer.DialContext(dialCtx, "tcp4", address)
			select {
			case results <- result{conn: conn, err: err}:
			case <-dialCtx.Done():
				if conn != nil {
					_ = conn.Close()
				}
			}
		}()
	}
	go func() {
		wg.Wait()
		close(results)
	}()
	var errs []string
	for item := range results {
		if item.err == nil && item.conn != nil {
			cancel()
			return item.conn, nil
		}
		if item.conn != nil {
			_ = item.conn.Close()
		}
		if item.err != nil && !errors.Is(item.err, context.Canceled) {
			errs = append(errs, item.err.Error())
		}
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if len(errs) == 0 {
		return nil, errors.New("all IMAP IPv4 dials failed")
	}
	return nil, errors.New(strings.Join(errs, "; "))
}

func appendUniqueIPv4(base []net.IP, extra ...net.IP) []net.IP {
	seen := make(map[string]struct{}, len(base)+len(extra))
	out := make([]net.IP, 0, len(base)+len(extra))
	for _, ip := range base {
		if ip == nil || ip.To4() == nil {
			continue
		}
		key := ip.String()
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, ip)
	}
	for _, ip := range extra {
		if ip == nil || ip.To4() == nil {
			continue
		}
		key := ip.String()
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, ip)
	}
	return out
}

func newICloudIMAPResolver(servers []string) *net.Resolver {
	cleaned := make([]string, 0, len(servers))
	for _, server := range servers {
		server = strings.TrimSpace(server)
		if server != "" {
			cleaned = append(cleaned, server)
		}
	}
	if len(cleaned) == 0 {
		cleaned = []string{"1.1.1.1:53"}
	}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			var lastErr error
			for _, dnsNetwork := range dnsFallbackNetworks(network) {
				for _, server := range cleaned {
					dialer := net.Dialer{Timeout: 2 * time.Second}
					conn, err := dialer.DialContext(ctx, dnsNetwork, server)
					if err == nil {
						return conn, nil
					}
					lastErr = err
				}
			}
			if ctxErr := ctx.Err(); ctxErr != nil {
				return nil, ctxErr
			}
			return nil, lastErr
		},
	}
}
