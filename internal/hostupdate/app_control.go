package hostupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

const (
	appDrainPath  = "/internal/v1/host-update/drain"
	appStatusPath = "/internal/v1/host-update/status"
	appResumePath = "/internal/v1/host-update/resume"
)

type appControlClient struct {
	baseURL string
	token   string
	http    *http.Client
}

func newAppControlClient(baseURL, token string, client *http.Client) (*appControlClient, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	if baseURL == "" && token == "" {
		return nil, nil
	}
	if baseURL == "" || len(token) < 32 {
		return nil, errors.New("应用排空地址与长度至少 32 位的通信密钥必须同时配置")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("应用排空地址必须是本机 HTTP 根地址")
	}
	host := parsed.Hostname()
	ip := net.ParseIP(host)
	if !strings.EqualFold(host, "localhost") && (ip == nil || !ip.IsLoopback()) {
		return nil, errors.New("应用排空地址只允许本机回环地址")
	}
	if client == nil {
		client = http.DefaultClient
	}
	return &appControlClient{baseURL: baseURL, token: token, http: client}, nil
}

func (c *appControlClient) beginDrain(ctx context.Context) (AppDrainState, error) {
	return c.request(ctx, http.MethodPost, appDrainPath)
}

func (c *appControlClient) status(ctx context.Context) (AppDrainState, error) {
	return c.request(ctx, http.MethodGet, appStatusPath)
}

func (c *appControlClient) resume(ctx context.Context) (AppDrainState, error) {
	return c.request(ctx, http.MethodPost, appResumePath)
}

func (c *appControlClient) request(ctx context.Context, method, requestPath string) (AppDrainState, error) {
	var state AppDrainState
	if c == nil {
		return state, errors.New("应用排空控制未配置")
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+requestPath, nil)
	if err != nil {
		return state, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return state, fmt.Errorf("访问应用排空接口: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return state, fmt.Errorf("读取应用排空响应: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return state, fmt.Errorf("应用排空接口返回 HTTP %d: %s", resp.StatusCode, appControlError(data))
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, fmt.Errorf("解析应用排空响应: %w", err)
	}
	return state, nil
}

func appControlError(data []byte) string {
	var payload struct {
		Detail struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		} `json:"detail"`
	}
	if json.Unmarshal(data, &payload) == nil && strings.TrimSpace(payload.Detail.Error.Message) != "" {
		return strings.TrimSpace(payload.Detail.Error.Message)
	}
	if message := strings.TrimSpace(string(data)); message != "" {
		return message
	}
	return "空响应"
}
