package protocol

import (
	"context"
	"testing"
	"time"
)

func TestImageRetryBackoffIncludesBoundedJitter(t *testing.T) {
	for _, retry := range []int{1, 2, 3} {
		got := imageRetryBackoff(retry)
		base := time.Duration(retry) * time.Second
		if got < base || got >= base+400*time.Millisecond {
			t.Fatalf("retry %d backoff = %s, want [%s,%s)", retry, got, base, base+400*time.Millisecond)
		}
	}
}

func TestWaitImageRetryStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if waitImageRetry(ctx, 1) {
		t.Fatal("waitImageRetry returned true after cancellation")
	}
}
