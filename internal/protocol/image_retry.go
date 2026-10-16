package protocol

import (
	"context"
	"time"
)

// imageRetryBackoff spreads account retries so a burst of tasks does not
// rotate every account at the same second after a shared upstream failure.
func imageRetryBackoff(retry int) time.Duration {
	if retry < 1 {
		retry = 1
	}
	base := time.Duration(retry) * time.Second
	// A small process-local jitter is sufficient here; this is scheduling noise,
	// not security material, and avoids synchronizing retries across workers.
	jitter := time.Duration(time.Now().UnixNano()%400) * time.Millisecond
	return base + jitter
}

func waitImageRetry(ctx context.Context, retry int) bool {
	timer := time.NewTimer(imageRetryBackoff(retry))
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
