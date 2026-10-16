package updaterclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"chatgpt2api/internal/hostupdate"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func NewFromEnv() (*Client, string) {
	token := strings.TrimSpace(os.Getenv("CHATGPT2API_HOST_UPDATER_TOKEN"))
	if len(token) < 32 {
		return nil, "未配置长度至少 32 位的 Host Updater 通信密钥"
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("CHATGPT2API_HOST_UPDATER_URL")), "/")
	if baseURL != "" {
		parsed, err := url.Parse(baseURL)
		if err != nil || parsed.Scheme != "http" || (parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost" && parsed.Hostname() != "::1") {
			return nil, "Host Updater HTTP 地址只允许本机回环地址"
		}
		return &Client{baseURL: baseURL, token: token, http: &http.Client{Timeout: 15 * time.Second}}, ""
	}
	socket := strings.TrimSpace(os.Getenv("CHATGPT2API_HOST_UPDATER_SOCKET"))
	if socket == "" {
		return nil, "未配置 Host Updater Unix Socket"
	}
	transport, err := unixTransport(socket)
	if err != nil {
		return nil, err.Error()
	}
	return &Client{baseURL: "http://updater", token: token, http: &http.Client{Transport: transport, Timeout: 15 * time.Second}}, ""
}

func (c *Client) Status(ctx context.Context) (hostupdate.State, error) {
	var state hostupdate.State
	return state, c.request(ctx, http.MethodGet, "/v1/status", nil, &state)
}

func (c *Client) StartPreflight(ctx context.Context, request hostupdate.PreflightRequest) (hostupdate.PreflightResult, error) {
	var result hostupdate.PreflightResult
	return result, c.request(ctx, http.MethodPost, "/v1/preflight", request, &result)
}

func (c *Client) request(ctx context.Context, method, path string, body, target any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("连接 Host Updater: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
		var payload struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &payload)
		if payload.Error == "" {
			payload.Error = strings.TrimSpace(string(data))
		}
		return fmt.Errorf("Host Updater 返回 HTTP %d: %s", resp.StatusCode, payload.Error)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return errors.New("Host Updater 返回了无法解析的响应")
	}
	return nil
}
