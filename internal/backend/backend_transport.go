package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (c *Client) postResponsesUpstreamJSON(ctx context.Context, path string, payload any, headers map[string]string) (*http.Response, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%s request payload: %w", path, err)
	}
	client := c.httpClient
	if c.proxy != nil {
		client = c.proxy.BrowserHTTPClientWithProfile(c.fp["impersonate"], 1200*time.Second)
	}
	return c.doUpstreamRequest(ctx, client, http.MethodPost, c.BaseURL+path, path, data, headers)
}

func (c *Client) headers(path string, extra map[string]string) map[string]string {
	return c.headersContext(context.Background(), path, extra)
}

func (c *Client) headersContext(ctx context.Context, path string, extra map[string]string) map[string]string {
	headers := map[string]string{
		"User-Agent":                  c.userAgent,
		"Origin":                      c.BaseURL,
		"Referer":                     c.BaseURL + "/",
		"Accept-Language":             "zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7",
		"Cache-Control":               "no-cache",
		"Pragma":                      "no-cache",
		"Priority":                    "u=1, i",
		"Sec-Ch-Ua":                   c.fp["sec-ch-ua"],
		"Sec-Ch-Ua-Arch":              c.fp["sec-ch-ua-arch"],
		"Sec-Ch-Ua-Bitness":           c.fp["sec-ch-ua-bitness"],
		"Sec-Ch-Ua-Full-Version":      c.fp["sec-ch-ua-full-version"],
		"Sec-Ch-Ua-Full-Version-List": c.fp["sec-ch-ua-full-version-list"],
		"Sec-Ch-Ua-Mobile":            c.fp["sec-ch-ua-mobile"],
		"Sec-Ch-Ua-Model":             `""`,
		"Sec-Ch-Ua-Platform":          c.fp["sec-ch-ua-platform"],
		"Sec-Ch-Ua-Platform-Version":  c.fp["sec-ch-ua-platform-version"],
		"Sec-Fetch-Dest":              "empty",
		"Sec-Fetch-Mode":              "cors",
		"Sec-Fetch-Site":              "same-origin",
		"OAI-Device-Id":               c.deviceID,
		"OAI-Session-Id":              c.sessionID,
		"OAI-Language":                "zh-CN",
		"OAI-Client-Version":          c.ClientVersion,
		"OAI-Client-Build-Number":     c.ClientBuildNumber,
		"X-OpenAI-Target-Path":        path,
		"X-OpenAI-Target-Route":       path,
	}
	if c.AccessToken != "" {
		headers["Authorization"] = "Bearer " + c.AccessToken
	}
	for key, value := range extra {
		headers[key] = value
	}
	if bundle := service.CachedUpstreamClearance(); bundle != nil {
		headers = service.ApplyUpstreamClearanceToHeaders(headers, bundle)
		if ua := strings.TrimSpace(headers["User-Agent"]); ua != "" {
			c.userAgent = ua
		}
	}
	return headers
}

func (c *Client) bootstrapHeaders() map[string]string {
	return c.bootstrapHeadersContext(context.Background())
}

func (c *Client) bootstrapHeadersContext(ctx context.Context) map[string]string {
	headers := map[string]string{
		"User-Agent":                c.userAgent,
		"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"Accept-Language":           "zh-CN,zh;q=0.9,en;q=0.8",
		"Sec-Ch-Ua":                 c.fp["sec-ch-ua"],
		"Sec-Ch-Ua-Mobile":          c.fp["sec-ch-ua-mobile"],
		"Sec-Ch-Ua-Platform":        c.fp["sec-ch-ua-platform"],
		"Sec-Fetch-Dest":            "document",
		"Sec-Fetch-Mode":            "navigate",
		"Sec-Fetch-Site":            "none",
		"Sec-Fetch-User":            "?1",
		"Upgrade-Insecure-Requests": "1",
	}
	if bundle := service.CachedUpstreamClearance(); bundle != nil {
		headers = service.ApplyUpstreamClearanceToHeaders(headers, bundle)
	}
	return headers
}

func (c *Client) bootstrap(ctx context.Context) error {
	err := c.doBootstrap(ctx)
	if err == nil {
		return nil
	}
	if !isCloudflareBootstrapError(err) || !service.UpstreamClearanceEnabled() {
		return err
	}
	if _, refreshErr := service.RefreshUpstreamClearanceForChallenge(ctx); refreshErr != nil {
		return err
	}
	return c.doBootstrap(ctx)
}

func (c *Client) doBootstrap(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/", nil)
	if err != nil {
		return fmt.Errorf("bootstrap request: %w", err)
	}
	for key, value := range c.bootstrapHeadersContext(ctx) {
		req.Header.Set(key, value)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return upstreamTransportError("bootstrap", err)
	}
	defer resp.Body.Close()
	data, err := readBackendResponseBody(resp, "bootstrap")
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return upstreamHTTPErrorWithResponse("bootstrap", resp, data)
	}
	c.powSources, c.powDataBuild = parsePOWResources(string(data))
	if len(c.powSources) == 0 {
		c.powSources = []string{defaultPOWScript}
	}
	return nil
}

func isCloudflareBootstrapError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "upstream returned cloudflare challenge page") ||
		strings.Contains(msg, "challenge-platform") ||
		strings.Contains(msg, "cf_chl") ||
		strings.Contains(msg, "just a moment") ||
		(strings.Contains(msg, "status=403") && strings.Contains(msg, "challenge"))
}

func (c *Client) getChatRequirements(ctx context.Context) (ChatRequirements, error) {
	path := "/backend-anon/sentinel/chat-requirements"
	contextName := "noauth_chat_requirements"
	if c.AccessToken != "" {
		path = "/backend-api/sentinel/chat-requirements"
		contextName = "auth_chat_requirements"
	}
	p := buildLegacyRequirementsToken(c.userAgent, c.powSources, c.powDataBuild)
	resp, err := c.postJSON(ctx, path, map[string]any{"p": p}, c.headersContext(ctx, path, map[string]string{"Content-Type": "application/json"}), false)
	if err != nil {
		return ChatRequirements{}, err
	}
	defer resp.Body.Close()
	data, err := readBackendResponseBody(resp, contextName)
	if err != nil {
		return ChatRequirements{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ChatRequirements{}, upstreamHTTPErrorWithResponse(contextName, resp, data)
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return ChatRequirements{}, err
	}
	reqs, err := c.buildRequirements(payload, "")
	if err != nil {
		return ChatRequirements{}, err
	}
	if reqs.Token == "" {
		if c.AccessToken != "" {
			return ChatRequirements{}, fmt.Errorf("missing auth chat requirements token: %v", payload)
		}
		return ChatRequirements{}, fmt.Errorf("missing chat requirements token: %v", payload)
	}
	return reqs, nil
}

func (c *Client) buildRequirements(data map[string]any, sourceP string) (ChatRequirements, error) {
	if arkose := util.StringMap(data["arkose"]); util.ToBool(arkose["required"]) {
		return ChatRequirements{}, fmt.Errorf("chat requirements requires arkose token, which is not implemented")
	}
	proofToken := ""
	proof := util.StringMap(data["proofofwork"])
	if util.ToBool(proof["required"]) {
		token, err := buildProofToken(util.Clean(proof["seed"]), util.Clean(proof["difficulty"]), c.userAgent, c.powSources, c.powDataBuild)
		if err != nil {
			return ChatRequirements{}, err
		}
		proofToken = token
	}
	turnstileToken := ""
	turnstile := util.StringMap(data["turnstile"])
	if util.ToBool(turnstile["required"]) && util.Clean(turnstile["dx"]) != "" {
		turnstileToken = solveTurnstileToken(util.Clean(turnstile["dx"]), sourceP)
	}
	return ChatRequirements{Token: util.Clean(data["token"]), ProofToken: proofToken, TurnstileToken: turnstileToken, SOToken: util.Clean(data["so_token"]), Raw: data}, nil
}
