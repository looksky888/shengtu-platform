package protocol

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type testProtocolImageConfig struct {
	root string
}

func (c testProtocolImageConfig) ImagesDir() string {
	path := filepath.Join(c.root, "images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testProtocolImageConfig) ImageMetadataDir() string {
	path := filepath.Join(c.root, "image_metadata")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testProtocolImageConfig) BaseURL() string {
	return "https://example.test"
}

func (c testProtocolImageConfig) CleanupOldImages() int {
	return 0
}

func TestFormatImageResultStoresOwnerName(t *testing.T) {
	config := testProtocolImageConfig{root: t.TempDir()}
	engine := &Engine{Config: config}
	imageData := base64.StdEncoding.EncodeToString([]byte("png-bytes"))

	result, err := engine.FormatImageResult(
		[]map[string]any{{"b64_json": imageData}},
		"draw",
		"url",
		"https://example.test",
		"linuxdo:41499",
		"Cassianvale",
		123,
		"",
	)
	if err != nil {
		t.Fatalf("FormatImageResult: %v", err)
	}
	items, _ := result["data"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("FormatImageResult() data = %#v", result["data"])
	}
	imageURL, _ := items[0]["url"].(string)
	rel := strings.TrimPrefix(imageURL, "https://example.test/images/")
	if rel == imageURL || rel == "" {
		t.Fatalf("image url = %q", imageURL)
	}

	data, err := os.ReadFile(filepath.Join(config.ImageMetadataDir(), filepath.FromSlash(rel)+".json"))
	if err != nil {
		t.Fatalf("ReadFile(metadata) error = %v", err)
	}
	var meta map[string]any
	if err := json.Unmarshal(data, &meta); err != nil {
		t.Fatalf("Unmarshal(metadata) error = %v", err)
	}
	if meta["owner_id"] != "linuxdo:41499" || meta["owner_name"] != "Cassianvale" {
		t.Fatalf("metadata = %#v", meta)
	}
}

func TestExtractConversationIDsSupportsFileServiceAndSedimentPointers(t *testing.T) {
	payload := `{"conversation_id":"conv-1","asset_pointer":"file-service://file_service_abc","other":"file_00000000abcdefabcdefabcdefabcdef","sed":"sediment://sed_123"}`
	conversationID, fileIDs, sedimentIDs := ExtractConversationIDs(payload)
	if conversationID != "conv-1" {
		t.Fatalf("conversationID = %q, want conv-1", conversationID)
	}
	if !stringSliceContains(fileIDs, "file_service_abc") {
		t.Fatalf("fileIDs = %#v, want file_service_abc", fileIDs)
	}
	if !stringSliceContains(fileIDs, "file_00000000abcdefabcdefabcdefabcdef") {
		t.Fatalf("fileIDs = %#v, want real file id", fileIDs)
	}
	if !stringSliceContains(sedimentIDs, "sed_123") {
		t.Fatalf("sedimentIDs = %#v, want sed_123", sedimentIDs)
	}
}

func TestIsImageToolEventRejectsOrdinaryAssistantAttachment(t *testing.T) {
	event := map[string]any{
		"message": map[string]any{
			"author":   map[string]any{"role": "assistant"},
			"metadata": map[string]any{},
			"content": map[string]any{
				"content_type":  "image_asset_pointer",
				"asset_pointer": "file-service://ordinary_attachment",
			},
		},
	}
	if IsImageToolEvent(event) {
		t.Fatal("ordinary assistant attachment was classified as an image-generation result")
	}
}

func TestIsImageToolEventAcceptsAsyncImageGeneration(t *testing.T) {
	event := map[string]any{
		"message": map[string]any{
			"author": map[string]any{"role": "assistant"},
			"metadata": map[string]any{
				"async_task_type": "image_gen",
			},
			"content": map[string]any{
				"content_type":  "image_asset_pointer",
				"asset_pointer": "file-service://generated_image",
			},
		},
	}
	if !IsImageToolEvent(event) {
		t.Fatal("async image-generation event was rejected")
	}
}

func TestShortEvidenceHashesOmitsRawValues(t *testing.T) {
	values := []string{"reference-image-payload", "file-service-id"}
	hashes := shortEvidenceHashes(values)
	if len(hashes) != len(values) {
		t.Fatalf("shortEvidenceHashes() length = %d, want %d", len(hashes), len(values))
	}
	for index, hash := range hashes {
		if len(hash) != 16 {
			t.Fatalf("hash length = %d, want 16", len(hash))
		}
		if hash == values[index] || strings.Contains(hash, values[index]) {
			t.Fatalf("hash leaked raw value %q", values[index])
		}
	}
}

func stringSliceContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func TestFormatImageResultEncodesRequestedOutputFormat(t *testing.T) {
	config := testProtocolImageConfig{root: t.TempDir()}
	engine := &Engine{Config: config}
	src := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	src.Set(0, 0, color.NRGBA{R: 255, A: 255})
	src.Set(1, 0, color.NRGBA{G: 255, A: 255})
	src.Set(0, 1, color.NRGBA{B: 255, A: 255})
	src.Set(1, 1, color.NRGBA{R: 255, G: 255, B: 255, A: 128})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, src); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	compression := 25

	result, err := engine.FormatImageResultWithOptions(
		[]map[string]any{{"b64_json": base64.StdEncoding.EncodeToString(encoded.Bytes())}},
		"draw",
		"b64_json",
		"https://example.test",
		"owner-1",
		"Alice",
		123,
		"",
		ImageOutputOptions{Format: "jpeg", Compression: &compression},
	)
	if err != nil {
		t.Fatalf("FormatImageResult: %v", err)
	}
	items, _ := result["data"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("FormatImageResultWithOptions() data = %#v", result["data"])
	}
	if items[0]["output_format"] != "jpeg" {
		t.Fatalf("output_format = %#v, want jpeg", items[0]["output_format"])
	}
	imageURL, _ := items[0]["url"].(string)
	if !strings.HasSuffix(imageURL, ".jpg") {
		t.Fatalf("image url = %q, want .jpg suffix", imageURL)
	}
	b64, _ := items[0]["b64_json"].(string)
	converted, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		t.Fatalf("DecodeString() error = %v", err)
	}
	_, format, err := image.DecodeConfig(bytes.NewReader(converted))
	if err != nil {
		t.Fatalf("DecodeConfig() error = %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("decoded format = %q, want jpeg", format)
	}
	rel := strings.TrimPrefix(imageURL, "https://example.test/images/")
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))); err != nil {
		t.Fatalf("stored jpeg missing: %v", err)
	}
}

func TestImageStreamErrorMessage(t *testing.T) {
	cloudflare := `bootstrap failed: status=403, body=<html><script>window._cf_chl_opt={}</script>Enable JavaScript and cookies to continue</html>`
	if got := imageStreamErrorMessage(cloudflare); got != "upstream returned Cloudflare challenge page; refresh browser fingerprint/session or change proxy" {
		t.Fatalf("cloudflare challenge error = %q", got)
	}

	cases := []string{
		"curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL",
		"TLS connect error: connection reset by peer",
		"error: OPENSSL_INTERNAL:WRONG_VERSION_NUMBER",
		`Get "https://chatgpt.com/": surf: HTTP/2 request failed: uTLS.HandshakeContext() error: EOF; HTTP/1.1 fallback failed: uTLS.HandshakeContext() error: EOF`,
	}
	for _, input := range cases {
		if got := imageStreamErrorMessage(input); got != "upstream connection failed before TLS handshake completed; check proxy reachability to chatgpt.com or change proxy" {
			t.Fatalf("imageStreamErrorMessage(%q) = %q", input, got)
		}
	}
	if got := imageStreamErrorMessage("stream error: stream ID 1; INTERNAL_ERROR; received from peer"); got != "upstream image stream was reset by peer; retry later or switch model / lower resolution" {
		t.Fatalf("internal stream reset error = %q", got)
	}
	if got := imageStreamErrorMessage("upstream returned 500"); got != "upstream returned 500" {
		t.Fatalf("non-connection error = %q", got)
	}
	if got := imageStreamErrorMessage(""); got != "image generation failed" {
		t.Fatalf("empty error = %q", got)
	}
}

func TestNewImageStreamGenerationErrorPreservesUpstreamEvidence(t *testing.T) {
	err := newImageStreamGenerationError("bootstrap failed: status=403 upstream_host=chatgpt.com request_id=req-cf cf-ray=ray-cf; upstream returned Cloudflare challenge page")
	if err.Message != "upstream returned Cloudflare challenge page; refresh browser fingerprint/session or change proxy" {
		t.Fatalf("friendly message = %q", err.Message)
	}
	if err.UpstreamHTTPStatus != 403 || err.UpstreamHost != "chatgpt.com" {
		t.Fatalf("status/host evidence = %#v", err)
	}
	if err.UpstreamRequestID != "req-cf" || err.UpstreamCFRay != "ray-cf" {
		t.Fatalf("request evidence = %#v", err)
	}
}

func TestResponsesImageToolEventErrorMessage(t *testing.T) {
	tests := []struct {
		name  string
		event map[string]any
		want  string
	}{
		{
			name:  "top level error",
			event: map[string]any{"type": "response.failed", "error": map[string]any{"message": "upstream rejected request"}},
			want:  "upstream rejected request",
		},
		{
			name:  "response error",
			event: map[string]any{"type": "response.failed", "response": map[string]any{"error": map[string]any{"message": "safety blocked"}}},
			want:  "safety blocked",
		},
		{
			name:  "incomplete details",
			event: map[string]any{"type": "response.incomplete", "response": map[string]any{"incomplete_details": map[string]any{"reason": "max_output_tokens"}}},
			want:  "max_output_tokens",
		},
		{
			name:  "ignored progress",
			event: map[string]any{"type": "response.output_item.done", "error": map[string]any{"message": "not terminal"}},
			want:  "",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := responsesImageToolEventErrorMessage(test.event); got != test.want {
				t.Fatalf("responsesImageToolEventErrorMessage() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestRetryableImageStreamError(t *testing.T) {
	for _, input := range []string{
		"stream error: stream ID 1; INTERNAL_ERROR; received from peer",
		"upstream image stream was reset by peer; retry later or switch model / lower resolution",
		"unexpected EOF",
		"HTTP2 stream closed",
	} {
		if !isRetryableImageStreamError(input) {
			t.Fatalf("isRetryableImageStreamError(%q) = false, want true", input)
		}
	}
	if isRetryableImageStreamError("content policy violation") {
		t.Fatal("isRetryableImageStreamError(content policy violation) = true, want false")
	}
}

func TestImageStreamErrorMessageIncludesTextFallbackContext(t *testing.T) {
	got := imageStreamErrorMessage("image generation returned text output instead of image data: fallback explanation")
	if got != "image generation returned text output instead of image data: fallback explanation" {
		t.Fatalf("imageStreamErrorMessage(text fallback) = %q", got)
	}
}

func TestImageAttemptTimeoutDefaultMatchesReference(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_ATTEMPT_TIMEOUT_SECONDS", "")
	if got := imageAttemptTimeout(); got != 80*time.Second {
		t.Fatalf("imageAttemptTimeout() = %s, want 80s", got)
	}
}

func TestImageResultContextUsesParentTaskBudget(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_POLL_TIMEOUT_SECONDS", "60")
	parent, cancelParent := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelParent()
	attempt, cancelAttempt := context.WithTimeout(
		context.WithValue(parent, imageAttemptParentContextKey{}, parent),
		time.Millisecond,
	)
	defer cancelAttempt()

	result, cancelResult := imageResultContext(attempt)
	defer cancelResult()
	resultDeadline, resultHasDeadline := result.Deadline()
	attemptDeadline, attemptHasDeadline := attempt.Deadline()
	if !resultHasDeadline || !attemptHasDeadline {
		t.Fatal("image result and attempt contexts must both have deadlines")
	}
	if !resultDeadline.After(attemptDeadline) {
		t.Fatalf("image result deadline = %s, attempt deadline = %s; result polling reused attempt budget", resultDeadline, attemptDeadline)
	}
	if remaining := time.Until(resultDeadline); remaining < time.Second {
		t.Fatalf("image result context budget = %s, want parent task budget", remaining)
	}
}
