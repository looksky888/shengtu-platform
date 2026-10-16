package protocol

import "testing"

func TestImageGenerationErrorMetadataKeepsUpstreamStatusDistinct(t *testing.T) {
	err := &ImageGenerationError{StatusCode: 502}
	if got := err.ImageTaskUpstreamMetadata().HTTPStatus; got != 0 {
		t.Fatalf("HTTPStatus = %d, want 0 without an upstream response", got)
	}

	err.UpstreamHTTPStatus = 503
	if got := err.ImageTaskUpstreamMetadata().HTTPStatus; got != 503 {
		t.Fatalf("HTTPStatus = %d, want 503", got)
	}
}
