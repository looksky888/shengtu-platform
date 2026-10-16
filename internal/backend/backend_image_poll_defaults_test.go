package backend

import (
	"testing"
	"time"
)

func TestImagePollIntervalDefaultMatchesReference(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_POLL_INTERVAL_SECONDS", "")
	if got := imagePollInterval(); got != 5*time.Second {
		t.Fatalf("imagePollInterval() = %s, want 5s", got)
	}
}
