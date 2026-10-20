package backend

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"syscall"
	"testing"
)

// upstreamStatusTestError mirrors the shape upstreamHTTPErrorWithResponse
// produces once the upstream status is exposed as a decidable field.
type upstreamStatusTestError struct {
	status int
	body   string
}

func (e upstreamStatusTestError) Error() string {
	return fmt.Sprintf("conversation failed: status=%d, %s", e.status, e.body)
}

func (e upstreamStatusTestError) StatusCode() int { return e.status }

// TestIsTransientPollErrorIgnoresUpstreamBodyWording pins the audit finding:
// the upstream response body is embedded in err.Error(), so ordinary words such
// as "connection", "stream", "timeout" or "eof" must not turn a deterministic
// failure into a poll retry.
func TestIsTransientPollErrorIgnoresUpstreamBodyWording(t *testing.T) {
	body := `{"error":{"message":"your stream hit a connection timeout while reading eof; unexpected eof; reset by peer"}}`
	for _, status := range []int{400, 401, 403, 404, 422} {
		err := fmt.Errorf("conversation failed: status=%d, %s", status, body)
		if isTransientPollError(err) {
			t.Fatalf("status=%d with transient-looking body classified as transient", status)
		}
	}
}

func TestIsTransientPollErrorUsesStructure(t *testing.T) {
	timeoutErr := &url.Error{Op: "Get", URL: "https://chatgpt.com/backend-api/conversation", Err: os.ErrDeadlineExceeded}
	opErr := &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	for _, tc := range []struct {
		name      string
		err       error
		transient bool
	}{
		{name: "nil", err: nil, transient: false},
		{name: "context cancelled", err: context.Canceled, transient: false},
		{name: "wrapped context cancelled", err: fmt.Errorf("poll: %w", context.Canceled), transient: false},
		{name: "context deadline exceeded", err: context.DeadlineExceeded, transient: true},
		{name: "wrapped deadline exceeded", err: fmt.Errorf("poll: %w", context.DeadlineExceeded), transient: true},
		{name: "unexpected eof sentinel", err: io.ErrUnexpectedEOF, transient: true},
		{name: "wrapped unexpected eof", err: fmt.Errorf("read body: %w", io.ErrUnexpectedEOF), transient: true},
		{name: "connection reset", err: fmt.Errorf("write: %w", syscall.ECONNRESET), transient: true},
		{name: "client timeout", err: timeoutErr, transient: true},
		{name: "dial op error", err: opErr, transient: true},
		{name: "typed 503", err: upstreamStatusTestError{status: 503, body: "{}"}, transient: true},
		{name: "typed 429", err: upstreamStatusTestError{status: 429, body: `{"message":"slow down"}`}, transient: true},
		{name: "typed 400 with transient body", err: upstreamStatusTestError{status: 400, body: `{"message":"timeout stream connection eof"}`}, transient: false},
		{name: "typed 404", err: upstreamStatusTestError{status: 404, body: "{}"}, transient: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isTransientPollError(tc.err); got != tc.transient {
				t.Fatalf("isTransientPollError(%v) = %v, want %v", tc.err, got, tc.transient)
			}
		})
	}
}

// TestIsTransientPollErrorUsesRealUpstreamStatus closes the loop on the finding
// above: the production error shape must carry the status so 429/5xx keep their
// retry (and backoff) while a 4xx with a transient-looking body does not.
func TestIsTransientPollErrorUsesRealUpstreamStatus(t *testing.T) {
	for _, tc := range []struct {
		name      string
		status    int
		transient bool
	}{
		{name: "429", status: http.StatusTooManyRequests, transient: true},
		{name: "500", status: http.StatusInternalServerError, transient: true},
		{name: "503", status: http.StatusServiceUnavailable, transient: true},
		{name: "400", status: http.StatusBadRequest, transient: false},
		{name: "401", status: http.StatusUnauthorized, transient: false},
		{name: "404", status: http.StatusNotFound, transient: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := upstreamHTTPError("conversation", tc.status, []byte(`{"message":"timeout stream connection eof"}`))
			if got := isTransientPollError(err); got != tc.transient {
				t.Fatalf("isTransientPollError(%v) = %v, want %v", err, got, tc.transient)
			}
			// Evidence enrichment must not erase the classification.
			enriched := withUpstreamEvidence(err, "request_id=abc cf-ray=def")
			if got := isTransientPollError(enriched); got != tc.transient {
				t.Fatalf("enriched error %v classified as %v, want %v", enriched, got, tc.transient)
			}
		})
	}
}

func TestIsTransientPollErrorKeepsTransportFailures(t *testing.T) {
	// A proxy/TLS failure must still be retried even though its message may not
	// contain any of the words the old substring matcher looked for.
	wrapped := fmt.Errorf("bootstrap failed: %w", &net.OpError{Op: "read", Net: "tcp", Err: errors.New("broken pipe")})
	if !isTransientPollError(wrapped) {
		t.Fatal("wrapped net.OpError classified as permanent")
	}
	if isTransientPollError(fmt.Errorf("image request rejected: content_policy_violation")) {
		t.Fatal("content policy rejection classified as transient")
	}
}
