package backend

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// upstreamHTTPStatusError is the upstream HTTP failure shape used by
// isTransientPollError: the status stays decidable while Error() keeps the
// human-readable message (and the summarized body) callers already log.
type upstreamHTTPStatusError struct {
	status  int
	message string
}

func (e *upstreamHTTPStatusError) Error() string { return e.message }

func (e *upstreamHTTPStatusError) StatusCode() int { return e.status }

func upstreamHTTPErrorWithResponse(context string, resp *http.Response, body []byte) error {
	if resp == nil {
		return upstreamHTTPError(context, 0, body)
	}
	err := upstreamHTTPError(context, resp.StatusCode, body)
	var evidence []string
	if resp.Request != nil && resp.Request.URL != nil {
		if host := strings.TrimSpace(resp.Request.URL.Hostname()); host != "" {
			evidence = append(evidence, "upstream_host="+host)
		}
	}
	for _, key := range []string{"X-Request-ID", "Request-ID", "OpenAI-Request-ID", "X-Amzn-RequestId"} {
		if value := strings.TrimSpace(resp.Header.Get(key)); value != "" {
			evidence = append(evidence, "request_id="+value)
			break
		}
	}
	if value := strings.TrimSpace(resp.Header.Get("CF-Ray")); value != "" {
		evidence = append(evidence, "cf-ray="+value)
	}
	if len(evidence) == 0 {
		return err
	}
	return withUpstreamEvidence(err, strings.Join(evidence, " "))
}

// withUpstreamEvidence appends diagnostic pairs while preserving the status, so
// the enriched error is still classifiable. A plain fmt.Errorf wrapper would
// erase StatusCode() and silently disable retry/backoff decisions.
func withUpstreamEvidence(err error, evidence string) error {
	var statusErr upstreamStatusError
	if errors.As(err, &statusErr) {
		return &upstreamHTTPStatusError{
			status:  statusErr.StatusCode(),
			message: fmt.Sprintf("%s (%s)", err.Error(), evidence),
		}
	}
	return fmt.Errorf("%s (%s)", err.Error(), evidence)
}
