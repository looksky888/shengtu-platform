package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const (
	DefaultClientVersion     = "prod-be885abbfcfe7b1f511e88b3003d9ee44757fbad"
	DefaultClientBuildNumber = "5955942"
	// ResponsesUpstreamPath is the ChatGPT backend route used by gpt-5* Responses
	// image_generation tool calls. The path segment historically says "codex";
	// the studio model codex-gpt-image-2 was removed in 3.4 (naming only).
	ResponsesUpstreamPath       = "/backend-api/codex/responses"
	responsesUpstreamUserAgent  = "codex-tui/0.128.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9 (codex-tui; 0.128.0)"
	responsesUpstreamOriginator = "codex-tui"

	browserUserAgent              = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
	browserSecCHUA                = `"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"`
	browserSecCHUAFullVersion     = `"145.0.0.0"`
	browserSecCHUAFullVersionList = `"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.0.0", "Chromium";v="145.0.0.0"`
	browserSecCHUAMobile          = "?0"
	browserSecCHUAPlatform        = `"Windows"`
	browserSecCHUAPlatformVersion = `"19.0.0"`
	browserSecCHUAArch            = `"x86"`
	browserSecCHUABitness         = `"64"`
	browserImpersonationProfile   = "chrome145"
)

type AccountLookup interface {
	GetAccount(accessToken string) map[string]any
}

type Client struct {
	BaseURL           string
	ClientVersion     string
	ClientBuildNumber string
	AccessToken       string

	lookup       AccountLookup
	proxy        *service.ProxyService
	httpClient   *http.Client
	fp           map[string]string
	userAgent    string
	deviceID     string
	sessionID    string
	powSources   []string
	powDataBuild string
	logger       *service.Logger
}

// SetLogger attaches the application logger for redacted upstream diagnostics.
// It returns the client so construction remains easy to chain in protocol code.
func (c *Client) SetLogger(logger *service.Logger) *Client {
	c.logger = logger
	return c
}

type ChatRequirements struct {
	Token          string
	ProofToken     string
	TurnstileToken string
	SOToken        string
	Raw            map[string]any
}

type UploadedFile struct {
	FileID   string
	FileName string
	FileSize int
	MimeType string
	Width    int
	Height   int
}

func NewClient(accessToken string, lookup AccountLookup, proxy *service.ProxyService) *Client {
	c := &Client{
		BaseURL:           "https://chatgpt.com",
		ClientVersion:     DefaultClientVersion,
		ClientBuildNumber: DefaultClientBuildNumber,
		AccessToken:       strings.TrimSpace(accessToken),
		lookup:            lookup,
		proxy:             proxy,
	}
	c.fp = c.buildFingerprint()
	c.applyBrowserFingerprint()
	c.userAgent = c.fp["user-agent"]
	c.deviceID = c.fp["oai-device-id"]
	c.sessionID = c.fp["oai-session-id"]
	if proxy != nil {
		c.httpClient = proxy.BrowserHTTPClientWithProfile(c.fp["impersonate"], 300*time.Second)
	} else {
		c.httpClient = service.HTTPClientForProxy("", 300*time.Second)
	}
	return c
}

func (c *Client) ListModels(ctx context.Context) (map[string]any, error) {
	if err := c.bootstrap(ctx); err != nil {
		return nil, err
	}
	path := "/backend-anon/models?iim=false&is_gizmo=false"
	route := "/backend-anon/models"
	contextName := "anon_models"
	if c.AccessToken != "" {
		path = "/backend-api/models?history_and_training_disabled=false"
		route = "/backend-api/models"
		contextName = "auth_models"
	}
	resp, err := c.doUpstreamRequest(ctx, c.httpClient, http.MethodGet, c.BaseURL+path, contextName, nil, c.headersContext(ctx, route, map[string]string{}))
	if err != nil {
		return nil, upstreamTransportError(contextName, err)
	}
	defer resp.Body.Close()
	if err := ensureOK(resp, contextName); err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	models := util.AsMapSlice(payload["models"])
	data := make([]map[string]any, 0, len(models))
	seen := map[string]struct{}{}
	for _, item := range models {
		slug := util.Clean(item["slug"])
		if slug == "" {
			continue
		}
		if _, ok := seen[slug]; ok {
			continue
		}
		seen[slug] = struct{}{}
		data = append(data, map[string]any{
			"id": slug, "object": "model", "created": util.ToInt(item["created"], 0),
			"owned_by":   firstNonEmpty(util.Clean(item["owned_by"]), "chatgpt"),
			"permission": []any{}, "root": slug, "parent": nil,
		})
	}
	sort.Slice(data, func(i, j int) bool { return util.Clean(data[i]["id"]) < util.Clean(data[j]["id"]) })
	return map[string]any{"object": "list", "data": data}, nil
}

func (c *Client) StreamConversation(ctx context.Context, messages []map[string]any, model, prompt string, images []string, systemHints []string) (<-chan string, <-chan error) {
	out := make(chan string)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		if contains(systemHints, "picture_v2") && (model == util.ImageModelAuto || util.IsImageModel(model) || isAllowedPictureModelSlug(model)) {
			errCh <- c.streamPictureConversation(ctx, out, prompt, model, images)
			return
		}
		if contains(systemHints, "picture_v2") && strings.TrimSpace(prompt) != "" {
			messages = []map[string]any{{"role": "user", "content": prompt}}
		} else if len(messages) == 0 {
			messages = []map[string]any{{"role": "user", "content": prompt}}
		}
		if err := c.bootstrap(ctx); err != nil {
			errCh <- err
			return
		}
		reqs, err := c.getChatRequirements(ctx)
		if err != nil {
			errCh <- err
			return
		}
		path, timezoneName := c.chatTarget()
		payload := c.conversationPayload(messages, model, timezoneName, systemHints)
		resp, err := c.postJSON(ctx, path, payload, c.conversationHeaders(path, reqs), true)
		if err != nil {
			errCh <- err
			return
		}
		defer resp.Body.Close()
		if err := ensureOK(resp, path); err != nil {
			errCh <- err
			return
		}
		errCh <- iterSSEPayloads(ctx, resp.Body, out)
	}()
	return out, errCh
}

func (c *Client) StreamResponsesUpstream(ctx context.Context, payload map[string]any) (<-chan string, <-chan error) {
	out := make(chan string)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		if c.AccessToken == "" {
			errCh <- fmt.Errorf("access_token is required for responses endpoint")
			return
		}
		path := ResponsesUpstreamPath
		resp, err := c.postResponsesUpstreamJSON(ctx, path, payload, c.responsesUpstreamHeaders(path))
		if err != nil {
			errCh <- err
			return
		}
		defer resp.Body.Close()
		if err := ensureOK(resp, path); err != nil {
			errCh <- err
			return
		}
		errCh <- iterSSEPayloads(ctx, resp.Body, out)
	}()
	return out, errCh
}

func (c *Client) chatTarget() (string, string) {
	if c.AccessToken != "" {
		return "/backend-api/conversation", "Asia/Shanghai"
	}
	return "/backend-anon/conversation", "America/Los_Angeles"
}

func (c *Client) conversationPayload(messages []map[string]any, model, timezoneName string, systemHintsValues ...[]string) map[string]any {
	conversationMessages := []map[string]any{conversationUserMessage(conversationPrompt(messages))}
	var systemHints []any
	if len(systemHintsValues) > 0 {
		for _, hint := range systemHintsValues[0] {
			if strings.TrimSpace(hint) != "" {
				systemHints = append(systemHints, strings.TrimSpace(hint))
			}
		}
	}
	return map[string]any{
		"action": "next", "messages": conversationMessages, "model": model, "parent_message_id": "client-created-root",
		"conversation_mode": map[string]any{"kind": "primary_assistant"}, "conversation_origin": nil,
		"force_paragen": false, "force_paragen_model_slug": "", "force_rate_limit": false, "force_use_sse": true,
		"history_and_training_disabled": true, "reset_rate_limits": false, "suggestions": []any{}, "supported_encodings": []any{"v1"},
		"enable_message_followups": true, "supports_buffering": true,
		"system_hints": systemHints, "timezone": timezoneName, "timezone_offset_min": -480,
		"variant_purpose": "comparison_implicit", "websocket_request_id": util.NewUUID(),
		"client_contextual_info": map[string]any{"is_dark_mode": false, "time_since_loaded": 120, "page_height": 900, "page_width": 1400, "pixel_ratio": 2, "screen_height": 1440, "screen_width": 2560},
	}
}

func (c *Client) conversationHeaders(path string, reqs ChatRequirements) map[string]string {
	extra := map[string]string{"Accept": "text/event-stream", "Content-Type": "application/json", "OpenAI-Sentinel-Chat-Requirements-Token": reqs.Token}
	if reqs.ProofToken != "" {
		extra["OpenAI-Sentinel-Proof-Token"] = reqs.ProofToken
	}
	if reqs.TurnstileToken != "" {
		extra["OpenAI-Sentinel-Turnstile-Token"] = reqs.TurnstileToken
	}
	if reqs.SOToken != "" {
		extra["OpenAI-Sentinel-SO-Token"] = reqs.SOToken
	}
	return c.headers(path, extra)
}

func (c *Client) responsesUpstreamHeaders(path string) map[string]string {
	if c.sessionID == "" {
		c.sessionID = util.NewUUID()
	}
	extra := map[string]string{
		"Accept":                "text/event-stream",
		"Content-Type":          "application/json",
		"User-Agent":            responsesUpstreamUserAgent,
		"Originator":            responsesUpstreamOriginator,
		"Session_id":            c.sessionID,
		"Connection":            "Keep-Alive",
		"X-OpenAI-Target-Path":  ResponsesUpstreamPath,
		"X-OpenAI-Target-Route": ResponsesUpstreamPath,
	}
	if accountID := c.chatGPTAccountID(); accountID != "" {
		extra["Chatgpt-Account-Id"] = accountID
	}
	return c.headers(path, extra)
}

func (c *Client) chatGPTAccountID() string {
	if c.lookup == nil || strings.TrimSpace(c.AccessToken) == "" {
		return ""
	}
	account := c.lookup.GetAccount(c.AccessToken)
	for _, key := range []string{"chatgpt_account_id", "chatgptAccountId", "account_id", "accountID"} {
		if value := util.Clean(account[key]); value != "" {
			return value
		}
	}
	return ""
}
