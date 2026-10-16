package backend

import (
	"fmt"
	"net/http"
	"strings"
)

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
	return fmt.Errorf("%s (%s)", err.Error(), strings.Join(evidence, " "))
}
