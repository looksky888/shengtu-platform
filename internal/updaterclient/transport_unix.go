//go:build !windows

package updaterclient

import (
	"context"
	"net"
	"net/http"
	"time"
)

func unixTransport(socket string) (http.RoundTripper, error) {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	return &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, "unix", socket)
		},
		DisableKeepAlives: false,
	}, nil
}
