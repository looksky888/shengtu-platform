package app

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func (c *AppleAuthClient) doWithTransientRetry(ctx context.Context, session *appleAuthSession, method, rawURL string, headers map[string]string, body any, out any, allow409 bool) (int, []byte, error) {
	var status int
	var data []byte
	err := retryAppleTransient(ctx, func() error {
		var err error
		status, data, err = c.do(ctx, session, method, rawURL, headers, body, out, allow409)
		return err
	})
	return status, data, err
}

func (c *AppleAuthClient) do(ctx context.Context, session *appleAuthSession, method, rawURL string, headers map[string]string, body any, out any, allow409 bool) (int, []byte, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return 0, nil, err
	}
	userAgent := firstNonEmpty(session.UserAgent, appleAuthUserAgent)
	req.Header.Set("User-Agent", userAgent)
	for key, value := range headers {
		if strings.TrimSpace(value) != "" {
			req.Header.Set(key, value)
		}
	}
	if body != nil && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie := cookieHeader(session.Cookies, rawURL); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	session.extract(resp)
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return resp.StatusCode, nil, err
	}
	if os.Getenv("IPM_DEBUG_APPLE_AUTH") == "1" {
		u, _ := url.Parse(rawURL)
		path := rawURL
		if u != nil {
			path = u.Path
		}
		fmt.Fprintf(os.Stderr, "APPLE_AUTH_DEBUG method=%s path=%s status=%d req_scnt=%s res_scnt=%s res_session=%s body=%q\n",
			method,
			path,
			resp.StatusCode,
			appleDebugFingerprint(req.Header.Get("scnt")),
			appleDebugFingerprint(resp.Header.Get("scnt")),
			appleDebugFingerprint(resp.Header.Get("X-Apple-ID-Session-Id")),
			appleDebugBody(data),
		)
	}
	if redirect, ok := parseAppleDomainRedirect(resp.StatusCode, data); ok {
		return resp.StatusCode, data, redirect
	}
	if resp.StatusCode == http.StatusForbidden {
		return resp.StatusCode, nil, errCode("apple_login_forbidden", "Apple ID 或密码错误，或当前账号被限制登录", true)
	}
	if allow409 && resp.StatusCode == http.StatusConflict {
		return resp.StatusCode, data, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		code := "apple_protocol_http_error"
		if isAppleTransientHTTPStatus(resp.StatusCode) {
			code = "apple_protocol_http_transient"
		}
		path := rawURL
		if parsed, parseErr := url.Parse(rawURL); parseErr == nil && parsed.Path != "" {
			path = parsed.Path
		}
		if code == "apple_protocol_http_transient" {
			return resp.StatusCode, nil, errCode(
				code,
				fmt.Sprintf("Apple 服务暂时不可用（HTTP %d，%s），已自动重试，请稍后再试", resp.StatusCode, path),
				true,
			)
		}
		return resp.StatusCode, nil, errCode(code, fmt.Sprintf("Apple 协议 HTTP %d（%s）: %s", resp.StatusCode, path, trimForError(data)), true)
	}
	if out != nil && len(bytes.TrimSpace(data)) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return resp.StatusCode, nil, errCode("apple_protocol_bad_json", "Apple 协议返回无法解析", true)
		}
	}
	return resp.StatusCode, data, nil
}

func appleDebugFingerprint(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "-"
	}
	sum := sha1.Sum([]byte(value))
	return fmt.Sprintf("%x/%d", sum[:4], len(value))
}

func retryAppleTransient(ctx context.Context, fn func() error) error {
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		if err := fn(); err != nil {
			if !isAppleTransientNetworkError(err) {
				return err
			}
			last = err
			if attempt == 2 {
				break
			}
			timer := time.NewTimer(time.Duration(attempt+1) * 800 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
			continue
		}
		return nil
	}
	return last
}

func isAppleTransientHTTPStatus(status int) bool {
	switch status {
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func isAppleTransientNetworkError(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	var coded codedError
	if errors.As(err, &coded) {
		return coded.code == "apple_protocol_http_transient" || coded.code == "apple_account_http_transient"
	}
	if errors.Is(err, io.EOF) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	text := strings.ToLower(err.Error())
	for _, marker := range []string{
		"eof",
		"timeout",
		"i/o timeout",
		"no such host",
		"temporary failure in name resolution",
		"network is unreachable",
		"no route to host",
		"connection reset",
		"connection refused",
		"connection aborted",
		"server closed idle connection",
		"tls handshake timeout",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}
