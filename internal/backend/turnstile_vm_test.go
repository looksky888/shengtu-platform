package backend

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/service"
)

func buildTurnstileBytecodeFixture(t *testing.T, key string) string {
	t.Helper()
	// Verify VM opcodes matching yukkcat/chatgpt2api/utils/turnstile.py:
	// - Op 2 (set literal in register)
	// - Op 6 (jsProp property access on reg 10 "window")
	// - Op 11 (set nil in register)
	// - Op 17 (call window.Object.create(null) -> OrderedMap in reg 25)
	// - Op 7 (call window.Reflect.set(reg 25, "status", "ok"))
	// - Op 15 (JSON.stringify reg 25 -> reg 32)
	// - Op 1 (XOR reg 32 with reg 16 p)
	// - Op 7 (call reg 3 func_3 with reg 32 to base64-encode output)
	program := []any{
		[]any{2, 20, "Object"},
		[]any{6, 21, 10, 20},
		[]any{2, 22, "create"},
		[]any{6, 23, 21, 22},
		[]any{11, 24, 0},
		[]any{17, 25, 23, 24},
		[]any{2, 26, "Reflect"},
		[]any{6, 27, 10, 26},
		[]any{2, 28, "set"},
		[]any{6, 29, 27, 28},
		[]any{2, 30, "status"},
		[]any{2, 31, "ok"},
		[]any{7, 29, 25, 30, 31},
		[]any{15, 32, 25},
		[]any{1, 32, 16},
		[]any{7, 3, 32},
	}
	raw, err := json.Marshal(program)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString([]byte(turnstileXORString(string(raw), key)))
}

func TestSolveTurnstileTokenExecutesBytecodeVM(t *testing.T) {
	p, err := buildLegacyRequirementsToken(browserUserAgent, []string{"https://chatgpt.com/cdn/assets/main.js"}, "prod-test-build", "en-US")
	if err != nil {
		t.Fatalf("buildLegacyRequirementsToken() error = %v", err)
	}
	if !strings.HasPrefix(p, "gAAAAAC") {
		t.Fatalf("legacy requirements token prefix = %q", p)
	}
	dx := buildTurnstileBytecodeFixture(t, p)
	token, err := solveTurnstileToken(dx, p)
	if err != nil {
		t.Fatalf("solveTurnstileToken() error = %v", err)
	}
	if token == "" {
		t.Fatal("solveTurnstileToken() returned empty token")
	}
	decodedBytes, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		t.Fatalf("base64 decode turnstile token: %v", err)
	}
	decrypted := turnstileXORString(string(decodedBytes), p)
	if decrypted != `{"status":"ok"}` {
		t.Fatalf("decrypted turnstile payload = %q, want %q", decrypted, `{"status":"ok"}`)
	}
}

func TestNativeSentinelRequirementsSolvesWithoutExternalContainer(t *testing.T) {
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_MODE", "native")
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_URL", "")
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_KEY", "")

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		switch r.URL.Path {
		case "/backend-api/sentinel/chat-requirements/prepare":
			p, _ := body["p"].(string)
			if !strings.HasPrefix(p, "gAAAAAC") {
				t.Fatalf("prepare p = %q, want gAAAAAC...", p)
			}
			dx := buildTurnstileBytecodeFixture(t, p)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"prepare_token": "prep-native-1",
				"proofofwork": map[string]any{
					"required":   true,
					"seed":       "seed-native",
					"difficulty": "f",
				},
				"turnstile": map[string]any{
					"required": true,
					"dx":       dx,
				},
			})
		case "/backend-api/sentinel/chat-requirements/finalize":
			if body["prepare_token"] != "prep-native-1" {
				t.Fatalf("prepare_token = %#v", body["prepare_token"])
			}
			powToken, _ := body["proofofwork"].(string)
			if !strings.HasPrefix(powToken, "gAAAAAB") || !strings.HasSuffix(powToken, "~S") {
				t.Fatalf("proofofwork = %q", powToken)
			}
			tsToken, _ := body["turnstile"].(string)
			if tsToken == "" {
				t.Fatal("missing turnstile token in finalize")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"token": "final-native-token",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	client := NewClient("native-account", nil, nil)
	client.BaseURL = upstream.URL
	client.httpClient = upstream.Client()
	client.powSources = []string{"https://chatgpt.com/cdn/assets/app.js"}
	client.powDataBuild = "prod-a194cd50d4416d3c0b47c740f206b12ce60f5887"

	reqs, err := client.getChatRequirements(context.Background())
	if err != nil {
		t.Fatalf("getChatRequirements() error = %v", err)
	}
	if reqs.Token != "final-native-token" {
		t.Fatalf("Token = %q, want final-native-token", reqs.Token)
	}
	if !strings.HasPrefix(reqs.ProofToken, "gAAAAAB") {
		t.Fatalf("ProofToken = %q", reqs.ProofToken)
	}
	if reqs.TurnstileToken == "" {
		t.Fatal("TurnstileToken should not be empty")
	}
}

func TestHeadersContextPreservesClearanceUserAgentWithSentinel(t *testing.T) {
	service.InvalidateUpstreamClearance()
	t.Cleanup(service.InvalidateUpstreamClearance)

	const flareUA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
	flare := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","solution":{"userAgent":"` + flareUA + `","cookies":[{"name":"cf_clearance","value":"clearance-1","domain":".chatgpt.com","path":"/"}]}}`))
	}))
	defer flare.Close()

	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", flare.URL)

	if _, err := service.RefreshUpstreamClearanceForChallengeWithProxy(context.Background(), ""); err != nil {
		t.Fatalf("RefreshUpstreamClearanceForChallengeWithProxy: %v", err)
	}

	client := NewClient("token-1", nil, nil)
	if err := client.prepareSentinelContext(context.Background()); err != nil {
		t.Fatalf("prepareSentinelContext: %v", err)
	}
	headers := client.headersContext(context.Background(), "/backend-api/f/conversation", nil)
	if got := headers["User-Agent"]; got != flareUA {
		t.Fatalf("User-Agent = %q, want clearance UA %q", got, flareUA)
	}
	if !strings.Contains(headers["Sec-Ch-Ua"], `"142"`) {
		t.Fatalf("Sec-Ch-Ua = %q, want major version 142 aligned with clearance UA", headers["Sec-Ch-Ua"])
	}
}

func TestStreamPictureConversationBootstrapsBeforeUploadAndPrepare(t *testing.T) {
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_MODE", "native")
	var sequence []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sequence = append(sequence, r.Method+" "+r.URL.Path)
		switch r.URL.Path {
		case "/":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<!doctype html><html data-build="prod-bootstrap-build"><head><script src="https://chatgpt.com/cdn/assets/boot.js"></script></head></html>`))
		case "/backend-api/me":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"user-1"}`))
		case "/backend-api/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"slug":"gpt-5-3"}]}`))
		case "/backend-api/accounts/check/v4-2023-04-27":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"accounts":{"default":{"entitlement":{"subscription_plan":"chatgptplusplan"}}}}`))
		case "/backend-api/settings/user":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		case "/backend-api/files":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"success","file_id":"file-ref-1","upload_url":"` + serverURL(r) + `/upload-put"}`))
		case "/upload-put":
			w.WriteHeader(http.StatusOK)
		case "/backend-api/files/file-ref-1/uploaded":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"success","download_url":"https://files.example/ref.png"}`))
		case "/backend-api/sentinel/chat-requirements/prepare":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"prepare_token":"prep-1","proofofwork":{"required":false},"turnstile":{"required":false}}`))
		case "/backend-api/sentinel/chat-requirements/finalize":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"token":"req-token-1"}`))
		case "/backend-api/f/conversation/prepare":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"conduit_token":"conduit-1"}`))
		case "/backend-api/f/conversation":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("data: {\"type\":\"message_stream_complete\",\"v\":{\"message\":{\"status\":\"finished_successfully\",\"metadata\":{\"is_complete\":true}}}}\n\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient("token-1", nil, nil)
	client.BaseURL = server.URL
	client.httpClient = server.Client()

	// Tiny 1x1 PNG in base64
	const tinyPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	out := make(chan string, 16)
	err := client.streamPictureConversation(context.Background(), out, "transform this cat", "gpt-image-2", []string{tinyPNG})
	close(out)
	if err != nil {
		t.Fatalf("streamPictureConversation() error = %v", err)
	}

	findIndex := func(target string) int {
		for idx, item := range sequence {
			if item == target {
				return idx
			}
		}
		return -1
	}
	bootIdx := findIndex("GET /")
	uploadIdx := findIndex("POST /backend-api/files")
	sentinelIdx := findIndex("POST /backend-api/sentinel/chat-requirements/prepare")
	if bootIdx == -1 || uploadIdx == -1 || sentinelIdx == -1 {
		t.Fatalf("unexpected request sequence: %v", sequence)
	}
	if !(bootIdx < uploadIdx && uploadIdx < sentinelIdx) {
		t.Fatalf("bootstrap must precede uploadImage and sentinel prepare, got sequence: %v", sequence)
	}
}

func TestDoUpstreamRequestSyncsUserAgentAndSecCHUAOnClearanceRefresh(t *testing.T) {
	service.InvalidateUpstreamClearance()
	t.Cleanup(service.InvalidateUpstreamClearance)

	const refreshedUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
	flare := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","solution":{"userAgent":"` + refreshedUA + `","cookies":[{"name":"cf_clearance","value":"fresh-139","domain":".chatgpt.com","path":"/"}]}}`))
	}))
	defer flare.Close()

	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED", "true")
	t.Setenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE", "flaresolverr")
	t.Setenv("CHATGPT2API_FLARESOLVERR_URL", flare.URL)

	var (
		calls      int
		retryUA    string
		retryCHUA  string
		retryClear string
	)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("<!doctype html><title>Just a moment...</title>"))
			return
		}
		retryUA = r.Header.Get("User-Agent")
		retryCHUA = r.Header.Get("Sec-Ch-Ua")
		retryClear = r.Header.Get("Cookie")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	client := NewClient("token-1", nil, nil)
	client.BaseURL = upstream.URL
	client.httpClient = upstream.Client()
	initialHeaders := client.headersContext(context.Background(), "/backend-api/f/conversation/prepare", map[string]string{"Content-Type": "application/json"})

	resp, err := client.postRaw(context.Background(), "/backend-api/f/conversation/prepare", []byte(`{}`), initialHeaders, false)
	if err != nil {
		t.Fatalf("postRaw() error = %v", err)
	}
	resp.Body.Close()
	if calls != 2 {
		t.Fatalf("calls = %d, want 2", calls)
	}
	if retryUA != refreshedUA {
		t.Fatalf("retry User-Agent = %q, want refreshed clearance UA %q", retryUA, refreshedUA)
	}
	if !strings.Contains(retryCHUA, `"139"`) {
		t.Fatalf("retry Sec-Ch-Ua = %q, want major version 139 aligned with refreshed clearance UA", retryCHUA)
	}
	if !strings.Contains(retryClear, "cf_clearance=fresh-139") {
		t.Fatalf("retry Cookie = %q, want cf_clearance=fresh-139", retryClear)
	}
}

func TestResolveConversationImageURLsImmediateWithoutHardSettleSleep(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_RESULT_SETTLE_SECONDS", "")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"download_url":"https://files.oaiusercontent.com/signed.png"}`))
	}))
	defer server.Close()

	client := NewClient("token-1", nil, nil)
	client.BaseURL = server.URL
	client.httpClient = server.Client()

	start := time.Now()
	urls := client.ResolveConversationImageURLs(context.Background(), "conv-fast", []string{"file_fast"}, nil, true)
	elapsed := time.Since(start)
	if len(urls) != 1 || urls[0] != "https://files.oaiusercontent.com/signed.png" {
		t.Fatalf("urls = %#v", urls)
	}
	if elapsed > time.Second {
		t.Fatalf("ResolveConversationImageURLs took %s, want immediate resolution without 5s hard sleep", elapsed)
	}
}

func TestUploadReferenceImagesConcurrentPreservesOrder(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_UPLOAD_SETTLE_MS", "")
	var mu sync.Mutex
	fileCounter := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/backend-api/files":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			fileName, _ := body["file_name"].(string)
			mu.Lock()
			fileCounter++
			mu.Unlock()
			id := strings.TrimSuffix(fileName, ".png")
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(fmt.Sprintf(`{"status":"success","file_id":"id-%s","upload_url":"%s/put/%s"}`, id, serverURL(r), id)))
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/put/"):
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/uploaded"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"success"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient("token-1", nil, nil)
	client.BaseURL = server.URL
	client.httpClient = server.Client()

	const tinyPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	refs, err := client.uploadReferenceImages(context.Background(), []string{tinyPNG, tinyPNG, tinyPNG})
	if err != nil {
		t.Fatalf("uploadReferenceImages() error = %v", err)
	}
	if len(refs) != 3 {
		t.Fatalf("len(refs) = %d, want 3", len(refs))
	}
	for idx, wantID := range []string{"id-image_1", "id-image_2", "id-image_3"} {
		if refs[idx].FileID != wantID {
			t.Fatalf("refs[%d].FileID = %q, want %q", idx, refs[idx].FileID, wantID)
		}
	}
}

func TestDownloadImageBytesSendsBrowserImageFetchHeadersToCDN(t *testing.T) {
	var captured http.Header
	cdn := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = r.Header.Clone()
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("cdn-image-bytes"))
	}))
	defer cdn.Close()

	client := NewClient("token-1", nil, nil)
	client.BaseURL = "https://chatgpt.com"
	client.httpClient = cdn.Client()

	data, err := client.DownloadImageBytes(context.Background(), []string{cdn.URL + "/signed/asset.png"})
	if err != nil {
		t.Fatalf("DownloadImageBytes() error = %v", err)
	}
	if len(data) != 1 || string(data[0]) != "cdn-image-bytes" {
		t.Fatalf("data = %#v", data)
	}
	if got := captured.Get("Sec-Fetch-Dest"); got != "image" {
		t.Fatalf("Sec-Fetch-Dest = %q, want image", got)
	}
	if got := captured.Get("Sec-Fetch-Mode"); got != "no-cors" {
		t.Fatalf("Sec-Fetch-Mode = %q, want no-cors", got)
	}
	if got := captured.Get("Sec-Fetch-Site"); got != "cross-site" {
		t.Fatalf("Sec-Fetch-Site = %q, want cross-site", got)
	}
	if got := captured.Get("Referer"); got != "https://chatgpt.com/" {
		t.Fatalf("Referer = %q, want https://chatgpt.com/", got)
	}
	if got := captured.Get("Sec-Ch-Ua"); !strings.Contains(got, `"146"`) {
		t.Fatalf("Sec-Ch-Ua = %q, want Chrome 146 client hints", got)
	}
}
