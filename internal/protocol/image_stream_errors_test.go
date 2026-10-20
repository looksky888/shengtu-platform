package protocol

import "testing"

// TestIsRetryableImageStreamErrorIgnoresUpstreamBody pins the audit finding:
// upstreamHTTPError* embeds up to 2 KiB of the upstream response body in the
// error text, so body wording must not decide retryability.
func TestIsRetryableImageStreamErrorIgnoresUpstreamBody(t *testing.T) {
	body := `{"error":{"message":"the stream was closed because of a connection timeout while streaming; unexpected eof; reset by peer; http2"}}`
	for _, message := range []string{
		`getConversation failed: status=400, ` + body,
		`getConversation failed: status=404, ` + body,
		`conversation failed: status=422, ` + body,
		`request failed: status=403, ` + body,
	} {
		if isRetryableImageStreamError(message) {
			t.Fatalf("isRetryableImageStreamError(%q) = true, want false", message)
		}
	}
}

// TestIsRetryableImageStreamErrorUsesEnvelopeStatus keeps the documented retry
// behaviour for rate limiting and upstream 5xx by reading the status out of our
// own error envelope instead of scanning for "status=500" words.
func TestIsRetryableImageStreamErrorUsesEnvelopeStatus(t *testing.T) {
	for _, message := range []string{
		`getConversation failed: status=429, {"error":{"message":"rate limited"}}`,
		`getConversation failed: status=500, {"error":{"message":"internal"}}`,
		`getConversation failed: status=502, {"error":{"message":"bad gateway"}}`,
		`getConversation failed: status=503, {"error":{"message":"unavailable"}}`,
		`getConversation failed: status=504, {"error":{"message":"gateway timeout"}}`,
	} {
		if !isRetryableImageStreamError(message) {
			t.Fatalf("isRetryableImageStreamError(%q) = false, want true", message)
		}
	}
}

func TestIsRetryableImageStreamErrorKeepsTransportSignals(t *testing.T) {
	for _, message := range []string{
		"stream error: stream ID 1; INTERNAL_ERROR; received from peer",
		"upstream image stream was reset by peer; retry later or switch model / lower resolution",
		"unexpected EOF",
		"HTTP2 stream closed",
		"context deadline exceeded",
		"upstream image attempt timed out after 80s",
		`Get "https://chatgpt.com/backend-api/conversation": dial tcp: lookup chatgpt.com: no such host`,
		"read tcp 10.0.0.1:5432->1.2.3.4:443: read: connection reset by peer",
	} {
		if !isRetryableImageStreamError(message) {
			t.Fatalf("isRetryableImageStreamError(%q) = false, want true", message)
		}
	}
	for _, message := range []string{
		"content policy violation",
		"image generation returned text output instead of image data",
		"invalid size parameter",
	} {
		if isRetryableImageStreamError(message) {
			t.Fatalf("isRetryableImageStreamError(%q) = true, want false", message)
		}
	}
	if !isRetryableImageStreamError("") {
		t.Fatal("empty message must stay retryable")
	}
}

// TestImageStreamErrorHeadExcludesUpstreamBody pins the window used by the
// wording matcher: everything after our own " failed: status=<code>, " envelope
// is the upstream body and must not influence classification.
func TestImageStreamErrorHeadExcludesUpstreamBody(t *testing.T) {
	head := imageStreamErrorHead("getconversation failed: status=400, timeout connection reset")
	if head != "getconversation failed: status=400" {
		t.Fatalf("imageStreamErrorHead() = %q", head)
	}
	if got := imageStreamErrorHead("stream error: stream id 1"); got != "stream error: stream id 1" {
		t.Fatalf("imageStreamErrorHead(no envelope) = %q", got)
	}
}
