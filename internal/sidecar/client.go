// Package sidecar talks to 3.5 internal services (grok-runtime, etc.).
package sidecar

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

const maxResponseBodyBytes = 32 << 20

// Client is a minimal HTTP client for internal sidecars.
type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		Token:   strings.TrimSpace(token),
		HTTP:    &http.Client{Timeout: 120 * time.Second},
	}
}

// DoJSON performs a request; returns status, body, error.
func (c *Client) DoJSON(ctx context.Context, method, path string, body []byte) (int, []byte, error) {
	if c == nil || c.BaseURL == "" {
		return 0, nil, fmt.Errorf("sidecar base url empty")
	}
	url := c.BaseURL + path
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return 0, nil, err
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("X-Internal-Token", c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	data, err := util.ReadAllLimited(resp.Body, maxResponseBodyBytes)
	if err != nil {
		return resp.StatusCode, nil, fmt.Errorf("read sidecar response: %w", err)
	}
	return resp.StatusCode, data, nil
}

// Health checks GET /health.
func (c *Client) Health(ctx context.Context) error {
	status, data, err := c.DoJSON(ctx, http.MethodGet, "/health", nil)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("sidecar health status=%d body=%s", status, truncate(string(data), 200))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
