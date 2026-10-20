package backend

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/service"
)

func TestIterPictureSSEPayloadsStopsAtStructuredTerminalMarker(t *testing.T) {
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	out := make(chan string, 1)
	errCh := make(chan error, 1)
	go func() {
		errCh <- iterPictureSSEPayloads(ctx, reader, out)
	}()

	payload := `{"type":"message_stream_complete","v":{"message":{"status":"finished_successfully","metadata":{"is_complete":true}}}}`
	if _, err := writer.Write([]byte("data: " + payload + "\n\n")); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-out:
		if got != payload {
			t.Fatalf("payload = %q, want %q", got, payload)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("terminal payload was not forwarded")
	}
	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("iterPictureSSEPayloads() error = %v", err)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("picture SSE reader waited for transport EOF after the terminal marker")
	}
}

func TestImageStreamTerminalPayloadRequiresCompletionAndTerminalStatus(t *testing.T) {
	for _, tc := range []struct {
		name    string
		payload string
		want    bool
	}{
		{name: "complete message", payload: `{"message":{"status":"finished_successfully","metadata":{"is_complete":true}}}`, want: true},
		{name: "completion patch", payload: `{"o":"patch","v":[{"p":"/message/status","o":"replace","v":"finished_successfully"},{"p":"/message/metadata/is_complete","o":"replace","v":true}]}`, want: true},
		{name: "running complete flag", payload: `{"message":{"status":"in_progress","metadata":{"is_complete":true}}}`, want: false},
		{name: "terminal without marker", payload: `{"message":{"status":"finished_successfully"}}`, want: false},
		{name: "invalid json", payload: `not-json`, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isImageStreamTerminalPayload(tc.payload); got != tc.want {
				t.Fatalf("isImageStreamTerminalPayload() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestUpstreamHTTPErrorSummarizesCloudflareChallenge(t *testing.T) {
	err := upstreamHTTPError("bootstrap", 403, []byte(`<html><body><script>window._cf_chl_opt={}</script>Enable JavaScript and cookies to continue</body></html>`))
	got := err.Error()
	if !strings.Contains(got, "bootstrap failed: status=403") {
		t.Fatalf("error missing context/status: %q", got)
	}
	if !strings.Contains(got, "upstream returned Cloudflare challenge page") {
		t.Fatalf("error missing challenge summary: %q", got)
	}
	if strings.Contains(got, "<html>") || strings.Contains(got, "window._cf_chl_opt") {
		t.Fatalf("error leaked challenge HTML: %q", got)
	}
}

func TestShouldRefreshCloudflareOnlyForChallengeLike403(t *testing.T) {
	cases := []struct {
		name        string
		status      int
		contentType string
		server      string
		body        string
		want        bool
	}{
		{name: "html challenge", status: http.StatusForbidden, contentType: "text/html; charset=UTF-8", body: "<!doctype html><title>Just a moment...</title>", want: true},
		{name: "cloudflare headers with challenge body", status: http.StatusForbidden, contentType: "text/html", server: "cloudflare", body: "<!doctype html><script src='/cdn-cgi/challenge-platform/x'></script>", want: true},
		{name: "challenge body without headers", status: http.StatusForbidden, body: "<!doctype html><script src='/cdn-cgi/challenge-platform/x'></script>", want: true},
		{name: "ordinary html forbidden", status: http.StatusForbidden, contentType: "text/html", body: "<!doctype html><title>Access denied</title>", want: false},
		{name: "json auth error", status: http.StatusForbidden, contentType: "application/json", body: `{"error":"invalid credentials"}`, want: false},
		{name: "json auth error through cloudflare", status: http.StatusForbidden, contentType: "application/json", server: "cloudflare", body: `{"error":"invalid credentials"}`, want: false},
		{name: "json explicit challenge", status: http.StatusForbidden, contentType: "application/json", body: `{"error":"Cloudflare challenge"}`, want: true},
		{name: "success", status: http.StatusOK, contentType: "text/html", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: tc.status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}
			if tc.contentType != "" {
				resp.Header.Set("Content-Type", tc.contentType)
			}
			if tc.server != "" {
				resp.Header.Set("Server", tc.server)
			}
			if got := shouldRefreshCloudflare(resp); got != tc.want {
				t.Fatalf("shouldRefreshCloudflare() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPostRawRefreshesClearanceAndRetriesCloudflareChallenge(t *testing.T) {
	service.InvalidateUpstreamClearance()
	t.Cleanup(service.InvalidateUpstreamClearance)
	flare := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"ok","solution":{"userAgent":"TestUA/1.0","cookies":[{"name":"cf_clearance","value":"fresh","domain":".chatgpt.com","path":"/"}]}}`)
	}))
	defer flare.Close()
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", flare.URL)
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", "10")

	var calls int
	retryCookie := make(chan string, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusForbidden)
			_, _ = io.WriteString(w, "<!doctype html><title>Just a moment...</title>")
			return
		}
		retryCookie <- r.Header.Get("Cookie")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer upstream.Close()

	client := &Client{BaseURL: upstream.URL, httpClient: upstream.Client()}
	resp, err := client.postRaw(context.Background(), "/image", []byte(`{"prompt":"x"}`), map[string]string{"Content-Type": "application/json", "Cookie": "session=keep; cf_clearance=stale"}, false)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK || calls != 2 {
		t.Fatalf("status=%d calls=%d", resp.StatusCode, calls)
	}
	if cookie := <-retryCookie; !strings.Contains(cookie, "session=keep") || !strings.Contains(cookie, "cf_clearance=fresh") || strings.Contains(cookie, "cf_clearance=stale") {
		t.Fatalf("retry cookie = %q", cookie)
	}
}

func TestUpstreamHTTPErrorSummarizesGenericHTML(t *testing.T) {
	err := upstreamHTTPError("auth_models", 502, []byte(`<!doctype html><html><body>bad gateway</body></html>`))
	got := err.Error()
	if got != "auth_models failed: status=502, upstream returned HTML error page" {
		t.Fatalf("upstreamHTTPError() = %q", got)
	}
}

func TestUpstreamHTTPErrorKeepsPlainBodyDetail(t *testing.T) {
	err := upstreamHTTPError("auth_models", 400, []byte(`{"error":"bad request"}`))
	got := err.Error()
	if got != `auth_models failed: status=400, body={"error":"bad request"}` {
		t.Fatalf("upstreamHTTPError() = %q", got)
	}
}

func TestUpstreamHTTPErrorDoesNotMisclassifyLongCloudflareMention(t *testing.T) {
	body := strings.Repeat("Cloudflare is mentioned in a diagnostic article. ", 120)
	err := upstreamHTTPError("auth_models", http.StatusForbidden, []byte(body))
	got := err.Error()
	if strings.Contains(got, "upstream returned Cloudflare challenge page") {
		t.Fatalf("long body was misclassified as challenge: %q", got)
	}
	if !strings.Contains(got, "body=Cloudflare is mentioned") {
		t.Fatalf("long body detail missing: %q", got)
	}
}

func TestCloudflareBootstrapClassifierRequiresChallengeEvidence(t *testing.T) {
	if isCloudflareBootstrapError(errString("bootstrap failed: status=403, body=Cloudflare service unavailable")) {
		t.Fatal("generic Cloudflare mention should not trigger clearance refresh")
	}
	if !isCloudflareBootstrapError(errString("bootstrap failed: status=403, upstream returned Cloudflare challenge page")) {
		t.Fatal("explicit challenge summary should trigger clearance refresh")
	}
}

func TestUpstreamTransportErrorSummarizesSurfHandshakeFailure(t *testing.T) {
	err := upstreamTransportError("bootstrap", errString(`Get "https://chatgpt.com/": surf: HTTP/2 request failed: uTLS.HandshakeContext() error: EOF; HTTP/1.1 fallback failed: uTLS.HandshakeContext() error: EOF`))
	got := err.Error()
	want := "bootstrap failed: upstream connection failed before TLS handshake completed; check proxy reachability to chatgpt.com or change proxy"
	if got != want {
		t.Fatalf("upstreamTransportError() = %q, want %q", got, want)
	}
}

func TestApplyBrowserFingerprintPreservesAccountProfile(t *testing.T) {
	client := &Client{fp: map[string]string{
		"user-agent":     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
		"impersonate":    "edge101",
		"oai-device-id":  "device-1",
		"oai-session-id": "session-1",
	}}
	client.applyBrowserFingerprint()
	if client.fp["user-agent"] != "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0" {
		t.Fatalf("user-agent = %q", client.fp["user-agent"])
	}
	if client.fp["sec-ch-ua"] != `"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"` {
		t.Fatalf("sec-ch-ua = %q", client.fp["sec-ch-ua"])
	}
	if client.fp["sec-ch-ua-full-version"] != `"143.0.0.0"` {
		t.Fatalf("sec-ch-ua-full-version = %q", client.fp["sec-ch-ua-full-version"])
	}
	if client.fp["impersonate"] != "edge101" {
		t.Fatalf("impersonate = %q", client.fp["impersonate"])
	}
	if client.fp["oai-device-id"] != "device-1" || client.fp["oai-session-id"] != "session-1" {
		t.Fatalf("device/session should be preserved: %#v", client.fp)
	}
}

func TestDecodeImageReferenceRejectsFilesystemPaths(t *testing.T) {
	// Short path-like strings must not be treated as local file reads (LFI).
	if _, err := decodeImageReference("C:\\Windows\\win.ini"); err == nil {
		t.Fatal("decodeImageReference(path) error = nil, want base64 decode failure")
	}
	if _, err := decodeImageReference("/etc/passwd"); err == nil {
		t.Fatal("decodeImageReference(unix path) error = nil, want base64 decode failure")
	}
	// Valid base64 still works.
	payload := base64.StdEncoding.EncodeToString([]byte("hello-image"))
	got, err := decodeImageReference(payload)
	if err != nil {
		t.Fatalf("decodeImageReference(base64) error = %v", err)
	}
	if string(got) != "hello-image" {
		t.Fatalf("decodeImageReference(base64) = %q", got)
	}
}

func TestImageHeadersCarryAllRequirementTokens(t *testing.T) {
	client := &Client{BaseURL: "https://chatgpt.com", fp: map[string]string{}, userAgent: browserUserAgent}
	client.applyBrowserFingerprint()
	headers := client.imageHeaders("/backend-api/f/conversation", ChatRequirements{
		Token:          "chat-token",
		ProofToken:     "proof-token",
		TurnstileToken: "turnstile-token",
		SOToken:        "so-token",
	}, "conduit-token", "text/event-stream")
	for key, want := range map[string]string{
		"OpenAI-Sentinel-Chat-Requirements-Token": "chat-token",
		"OpenAI-Sentinel-Proof-Token":             "proof-token",
		"OpenAI-Sentinel-Turnstile-Token":         "turnstile-token",
		"OpenAI-Sentinel-SO-Token":                "so-token",
		"X-Conduit-Token":                         "conduit-token",
	} {
		if got := headers[key]; got != want {
			t.Fatalf("%s = %q, want %q", key, got, want)
		}
	}
	if headers["X-Oai-Turn-Trace-Id"] == "" {
		t.Fatal("missing turn trace id")
	}
}

func TestBrowserFingerprintMatchesChrome146(t *testing.T) {
	for name, value := range map[string]string{
		"user-agent":        browserUserAgent,
		"sec-ch-ua":         browserSecCHUA,
		"full-version":      browserSecCHUAFullVersion,
		"full-version-list": browserSecCHUAFullVersionList,
		"profile":           browserImpersonationProfile,
	} {
		if !strings.Contains(value, "146") {
			t.Fatalf("%s = %q, want Chrome 146", name, value)
		}
		if strings.Contains(strings.ToLower(value), "edge") {
			t.Fatalf("%s mixes Edge identity: %q", name, value)
		}
	}
}

func TestImageModelSlugSupportsSelection(t *testing.T) {
	client := &Client{}
	for _, tc := range []struct {
		model string
		want  string
	}{
		{model: "", want: "gpt-5-3"},
		{model: "auto", want: "auto"},
		{model: "gpt-image-2", want: "gpt-5-3"},
		{model: "gpt-image-2.5", want: "gpt-image-2.5-flare"},
		{model: "GPT-IMAGE-2.5-FLARE", want: "gpt-image-2.5-flare"},
		{model: "gpt-image-2.5-flare", want: "gpt-image-2.5-flare"},
		{model: "gpt-image-2.5-sunburst", want: "gpt-image-2.5-sunburst"},
		{model: "gpt-5", want: "gpt-5"},
		{model: "gpt-5-3-mini", want: "gpt-5-3-mini"},
		{model: "gpt-5.4", want: "gpt-5.4"},
		{model: "gpt-5.5", want: "gpt-5.5"},
		{model: "gpt-5-5-thinking", want: "gpt-5-5-thinking"},
		{model: "unknown", want: "auto"},
	} {
		t.Run(tc.model, func(t *testing.T) {
			if got := client.imageModelSlug(tc.model); got != tc.want {
				t.Fatalf("imageModelSlug(%q) = %q, want %q", tc.model, got, tc.want)
			}
		})
	}
}

func TestStartImageGenerationMatchesPictureV2WebPayload(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/backend-api/f/conversation" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := &Client{BaseURL: server.URL, AccessToken: "test-token", httpClient: server.Client(), fp: map[string]string{}, userAgent: browserUserAgent}
	resp, err := client.startImageGeneration(context.Background(), "draw a cat\n\n输出图片尺寸为 16:9。输出图片质量为 high。", ChatRequirements{Token: "requirements-token"}, "conduit-token", "gpt-image-2.5-flare", nil, "trace-fixture")
	if err != nil {
		t.Fatalf("startImageGeneration() error = %v", err)
	}
	resp.Body.Close()
	if _, ok := payload["image_generation_size"]; ok {
		t.Fatalf("picture_v2 payload contains unsupported image_generation_size: %#v", payload["image_generation_size"])
	}
	if _, ok := payload["image_generation_quality"]; ok {
		t.Fatalf("picture_v2 payload contains unsupported image_generation_quality: %#v", payload["image_generation_quality"])
	}
	if got := payload["model"]; got != "gpt-image-2.5-flare" {
		t.Fatalf("model = %#v, want gpt-image-2.5-flare", got)
	}
	if hints, ok := payload["system_hints"].([]any); !ok || len(hints) != 1 || hints[0] != "picture_v2" {
		t.Fatalf("system_hints = %#v", payload["system_hints"])
	}
}

func TestImagePrepareAndGenerationShareCurrentWebContract(t *testing.T) {
	type capturedRequest struct {
		path    string
		headers http.Header
		payload map[string]any
	}
	for _, tc := range []struct {
		name       string
		requested  string
		want       string
		references []UploadedFile
	}{
		{name: "alias generation", requested: "gpt-image-2.5", want: "gpt-image-2.5-flare"},
		{name: "sunburst edit", requested: "gpt-image-2.5-sunburst", want: "gpt-image-2.5-sunburst", references: []UploadedFile{{FileID: "file-1", FileName: "input.png", FileSize: 20, MimeType: "image/png", Width: 10, Height: 10}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var requests []capturedRequest
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var payload map[string]any
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Fatalf("decode %s payload: %v", r.URL.Path, err)
				}
				requests = append(requests, capturedRequest{path: r.URL.Path, headers: r.Header.Clone(), payload: payload})
				w.Header().Set("Content-Type", "application/json")
				if strings.HasSuffix(r.URL.Path, "/prepare") {
					_, _ = io.WriteString(w, `{"conduit_token":"conduit"}`)
					return
				}
				w.Header().Set("Content-Type", "text/event-stream")
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()

			client := &Client{BaseURL: server.URL, AccessToken: "fixture", httpClient: server.Client(), fp: map[string]string{}, userAgent: browserUserAgent}
			reqs := ChatRequirements{Token: "requirements", TurnstileToken: "turnstile"}
			const traceID = "trace-fixture"
			conduit, err := client.prepareImageConversation(context.Background(), "cat", reqs, tc.requested, traceID)
			if err != nil {
				t.Fatal(err)
			}
			resp, err := client.startImageGeneration(context.Background(), "cat", reqs, conduit, tc.requested, tc.references, traceID)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if len(requests) != 2 {
				t.Fatalf("requests = %d, want 2", len(requests))
			}
			trace := requests[0].headers.Get("X-Oai-Turn-Trace-Id")
			if trace == "" || requests[1].headers.Get("X-Oai-Turn-Trace-Id") != trace {
				t.Fatalf("trace ids = %q / %q", trace, requests[1].headers.Get("X-Oai-Turn-Trace-Id"))
			}
			for _, request := range requests {
				if request.payload["model"] != tc.want || request.payload["parent_message_id"] != "client-created-root" {
					t.Fatalf("%s model/parent = %#v / %#v", request.path, request.payload["model"], request.payload["parent_message_id"])
				}
			}
			messages := requests[1].payload["messages"].([]any)
			message := messages[0].(map[string]any)
			content := message["content"].(map[string]any)
			parts := content["parts"].([]any)
			if parts[len(parts)-1] != "@创建图像 cat" {
				t.Fatalf("prompt part = %#v", parts[len(parts)-1])
			}
			metadata := message["metadata"].(map[string]any)
			serialization := metadata["serialization_metadata"].(map[string]any)
			offsets := serialization["custom_symbol_offsets"].([]any)
			if len(offsets) != 1 || offsets[0].(map[string]any)["id"] != "picture_v2" {
				t.Fatalf("custom_symbol_offsets = %#v", offsets)
			}
		})
	}
}

func TestImagePollingDefaultsMatchReference(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_POLL_TIMEOUT_SECONDS", "")
	t.Setenv("CHATGPT2API_IMAGE_POLL_INITIAL_WAIT_SECONDS", "")
	if got := imagePollTimeout(); got != 60*time.Second {
		t.Fatalf("imagePollTimeout() = %s, want 60s", got)
	}
	if got := imagePollInitialWait(); got != 5*time.Second {
		t.Fatalf("imagePollInitialWait() = %s, want 5s", got)
	}
}

func TestConversationPayloadEmbedsOpenAIMessageHistoryInSingleUserMessage(t *testing.T) {
	client := &Client{}
	payload := client.conversationPayload([]map[string]any{
		{"role": "user", "content": "你好，你是什么模型？"},
		{"role": "assistant", "content": "你好！我是一个由OpenAI开发的语言模型，叫做GPT-4。"},
		{"role": "user", "content": "我之前说了什么？"},
	}, "auto", "Asia/Shanghai")

	if payload["parent_message_id"] != "client-created-root" {
		t.Fatalf("parent_message_id = %q, want client-created-root", payload["parent_message_id"])
	}
	messages, ok := payload["messages"].([]map[string]any)
	if !ok {
		t.Fatalf("messages = %T, want []map[string]any", payload["messages"])
	}
	if len(messages) != 1 {
		t.Fatalf("messages length = %d, want 1", len(messages))
	}
	author := messages[0]["author"].(map[string]any)
	if author["role"] != "user" {
		t.Fatalf("message role = %q, want user", author["role"])
	}
	content := messages[0]["content"].(map[string]any)
	parts := content["parts"].([]any)
	if len(parts) != 1 {
		t.Fatalf("parts length = %d, want 1", len(parts))
	}
	prompt, ok := parts[0].(string)
	if !ok {
		t.Fatalf("prompt = %T, want string", parts[0])
	}
	for _, want := range []string{
		"Conversation history:",
		"User: 你好，你是什么模型？",
		"Assistant: 你好！我是一个由OpenAI开发的语言模型，叫做GPT-4。",
		"Current user message:\n我之前说了什么？",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q: %s", want, prompt)
		}
	}
}

func TestConversationPayloadKeepsSingleUserMessagePrompt(t *testing.T) {
	client := &Client{}
	payload := client.conversationPayload([]map[string]any{
		{"role": "user", "content": "hello"},
	}, "auto", "Asia/Shanghai")

	messages := payload["messages"].([]map[string]any)
	content := messages[0]["content"].(map[string]any)
	parts := content["parts"].([]any)
	if parts[0] != "hello" {
		t.Fatalf("prompt = %q, want hello", parts[0])
	}
}

func TestConversationPayloadCanEnableImageGenerationToolForTextModel(t *testing.T) {
	client := &Client{}
	payload := client.conversationPayload([]map[string]any{
		{"role": "user", "content": "draw\n\n输出为 16:9 横屏构图"},
	}, "gpt-5.5", "Asia/Shanghai", []string{"picture_v2"})

	if payload["model"] != "gpt-5.5" {
		t.Fatalf("model = %q, want gpt-5.5", payload["model"])
	}
	hints, ok := payload["system_hints"].([]any)
	if !ok {
		t.Fatalf("system_hints = %T, want []any", payload["system_hints"])
	}
	if len(hints) != 1 || hints[0] != "picture_v2" {
		t.Fatalf("system_hints = %#v, want picture_v2", hints)
	}
	messages := payload["messages"].([]map[string]any)
	content := messages[0]["content"].(map[string]any)
	parts := content["parts"].([]any)
	if !strings.Contains(parts[0].(string), "输出为 16:9") {
		t.Fatalf("prompt = %q, want image generation hint", parts[0])
	}
}

func TestFileDownloadURLUsesConversationScopedEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/backend-api/files/download/file_abc" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if got := r.URL.Query().Get("conversation_id"); got != "conv-1" {
			t.Fatalf("conversation_id = %q", got)
		}
		if got := r.URL.Query().Get("inline"); got != "false" {
			t.Fatalf("inline = %q", got)
		}
		if got := r.Header.Get("X-OpenAI-Target-Path"); got != "/backend-api/files/download/file_abc" {
			t.Fatalf("target path = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"download_url":"https://files.example/image.png"}`))
	}))
	defer server.Close()

	client := &Client{
		BaseURL:     server.URL,
		AccessToken: "token-1",
		httpClient:  server.Client(),
		fp:          map[string]string{},
	}
	got := client.fileDownloadURL(context.Background(), "conv-1", "file_abc")
	if got != "https://files.example/image.png" {
		t.Fatalf("fileDownloadURL() = %q", got)
	}
}

func TestFileDownloadURLRetriesWhenAssetIsNotReady(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path != "/backend-api/files/download/file_abc" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"legacy_endpoint_not_ready"}`))
			return
		}
		attempts++
		if attempts == 1 {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"file_not_ready"}`))
			return
		}
		_, _ = w.Write([]byte(`{"download_url":"https://files.example/image.png"}`))
	}))
	defer server.Close()

	client := &Client{BaseURL: server.URL, AccessToken: "token-1", httpClient: server.Client(), fp: map[string]string{}}
	got := client.fileDownloadURL(context.Background(), "conv-1", "file_abc")
	if got != "https://files.example/image.png" {
		t.Fatalf("fileDownloadURL() = %q, want retried URL", got)
	}
	if attempts != 2 {
		t.Fatalf("request attempts = %d, want 2", attempts)
	}
}

func TestFindRecentConversationByPromptMatchesRecentTitle(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/backend-api/conversations" || r.URL.Query().Get("order") != "updated" {
			t.Fatalf("request = %s?%s", r.URL.Path, r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[{"id":"conv-old","title":"unrelated","update_time":1},{"id":"conv-image","title":"A watercolor cat in a garden","updated_at":"2026-09-09T12:00:30Z"}]}`))
	}))
	defer server.Close()

	client := &Client{BaseURL: server.URL, AccessToken: "token-1", httpClient: server.Client(), fp: map[string]string{}}
	startedAt, err := time.Parse(time.RFC3339, "2026-09-09T12:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.FindRecentConversationByPrompt(context.Background(), "A watercolor cat in a garden", startedAt)
	if err != nil {
		t.Fatalf("FindRecentConversationByPrompt() error = %v", err)
	}
	if got != "conv-image" {
		t.Fatalf("FindRecentConversationByPrompt() = %q, want conv-image", got)
	}
}

func TestFindRecentConversationByPromptMatchesChineseTitlePrefix(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[{"id":"conv-image","title":"雨夜霓虹街道上的白猫","update_time":1788936030}]}`))
	}))
	defer server.Close()

	client := &Client{BaseURL: server.URL, AccessToken: "token-1", httpClient: server.Client(), fp: map[string]string{}}
	got, err := client.FindRecentConversationByPrompt(context.Background(), "雨夜霓虹街道上的白猫，电影感灯光，16:9 横屏构图", time.Unix(1788936000, 0))
	if err != nil {
		t.Fatal(err)
	}
	if got != "conv-image" {
		t.Fatalf("FindRecentConversationByPrompt() = %q, want conv-image", got)
	}
}

func TestFindRecentConversationByPromptRejectsAmbiguousMatches(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[{"id":"conv-1","title":"雨夜霓虹街道上的白猫","update_time":1788936030},{"id":"conv-2","title":"雨夜霓虹街道上的白猫电影感","update_time":1788936031}]}`))
	}))
	defer server.Close()

	client := &Client{BaseURL: server.URL, AccessToken: "token-1", httpClient: server.Client(), fp: map[string]string{}}
	got, err := client.FindRecentConversationByPrompt(context.Background(), "雨夜霓虹街道上的白猫电影感灯光", time.Unix(1788936000, 0))
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("FindRecentConversationByPrompt() = %q, want ambiguous result rejected", got)
	}
}

func TestExtractImageToolRecordsFindsAssistantAssetPointers(t *testing.T) {
	conversation := map[string]any{
		"mapping": map[string]any{
			"assistant-image": map[string]any{
				"message": map[string]any{
					"author":      map[string]any{"role": "assistant"},
					"create_time": 2,
					"metadata": map[string]any{
						"async_task_type": "image_gen",
						"asset_pointer":   "sediment://sed_123",
					},
					"content": map[string]any{
						"content_type":  "image_asset_pointer",
						"asset_pointer": "file-service://file_service_abc",
						"parts": []any{
							map[string]any{"asset_pointer": "file_00000000abcdefabcdefabcdefabcdef"},
						},
					},
				},
			},
		},
	}

	files, sediments := extractImageToolRecords(conversation)
	if !contains(files, "file_service_abc") {
		t.Fatalf("files = %#v, want file_service_abc", files)
	}
	if !contains(files, "file_00000000abcdefabcdefabcdefabcdef") {
		t.Fatalf("files = %#v, want real file id", files)
	}
	if !contains(sediments, "sed_123") {
		t.Fatalf("sediments = %#v, want sed_123", sediments)
	}
}

func TestExtractImageToolRecordsFindsAssistantAssetWithoutAsyncTaskType(t *testing.T) {
	conversation := map[string]any{
		"mapping": map[string]any{
			"assistant-image": map[string]any{
				"message": map[string]any{
					"author":   map[string]any{"role": "assistant"},
					"metadata": map[string]any{},
					"content": map[string]any{
						"content_type":  "image_asset_pointer",
						"asset_pointer": "file-service://file_without_task_type",
					},
				},
			},
		},
	}

	files, sediments := extractImageToolRecords(conversation)
	if !contains(files, "file_without_task_type") || len(sediments) != 0 {
		t.Fatalf("files=%#v sediments=%#v, want assistant asset pointer", files, sediments)
	}
}

func TestExtractImageToolRecordsRejectsOrdinaryAssistantAttachment(t *testing.T) {
	conversation := map[string]any{
		"mapping": map[string]any{
			"assistant-attachment": map[string]any{
				"message": map[string]any{
					"author":      map[string]any{"role": "assistant"},
					"create_time": 2,
					"metadata":    map[string]any{},
					"content": map[string]any{
						"content_type": "text",
						"parts":        []any{"file-service://ordinary_attachment"},
					},
				},
			},
		},
	}

	files, sediments := extractImageToolRecords(conversation)
	if len(files) != 0 || len(sediments) != 0 {
		t.Fatalf("ordinary assistant attachment leaked into results: files=%#v sediments=%#v", files, sediments)
	}
}

func TestExtractImageTaskRecordsFindsAsyncTaskAssets(t *testing.T) {
	tasks := []map[string]any{{
		"conversation_id": "conversation-1",
		"image_gen_message": map[string]any{
			"content": map[string]any{
				"parts": []any{
					"file-service://file_task_abc",
					"sediment://sed_task_xyz",
				},
			},
		},
	}}

	files, sediments := extractImageTaskRecords(tasks)
	if !contains(files, "file_task_abc") {
		t.Fatalf("files = %#v, want file_task_abc", files)
	}
	if !contains(sediments, "sed_task_xyz") {
		t.Fatalf("sediments = %#v, want sed_task_xyz", sediments)
	}
}

func TestDownloadImageBytesAuthenticatesChatGPTBackendURLs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer token-1" {
			t.Fatalf("Authorization = %q", got)
		}
		if got := r.Header.Get("Origin"); got != serverURL(r) {
			t.Fatalf("Origin = %q", got)
		}
		if got := r.Header.Get("X-OpenAI-Target-Path"); got != "/backend-api/files/stream" {
			t.Fatalf("target path = %q", got)
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("png-data"))
	}))
	defer server.Close()

	client := &Client{
		BaseURL:     server.URL,
		AccessToken: "token-1",
		httpClient:  server.Client(),
		fp:          map[string]string{},
		userAgent:   browserUserAgent,
	}
	got, err := client.DownloadImageBytes(context.Background(), []string{server.URL + "/backend-api/files/stream"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || string(got[0]) != "png-data" {
		t.Fatalf("DownloadImageBytes() = %#v", got)
	}
}

func TestDownloadImageBytesRetriesTransientResponse(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		if attempts == 1 {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`temporary`))
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("png-data"))
	}))
	defer server.Close()

	client := &Client{
		BaseURL:     server.URL,
		AccessToken: "token-1",
		httpClient:  server.Client(),
		fp:          map[string]string{},
		userAgent:   browserUserAgent,
	}
	got, err := client.DownloadImageBytes(context.Background(), []string{server.URL + "/backend-api/files/stream"})
	if err != nil {
		t.Fatalf("DownloadImageBytes() error = %v", err)
	}
	if len(got) != 1 || string(got[0]) != "png-data" {
		t.Fatalf("DownloadImageBytes() = %#v", got)
	}
	if attempts != 2 {
		t.Fatalf("request attempts = %d, want 2", attempts)
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func serverURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}
