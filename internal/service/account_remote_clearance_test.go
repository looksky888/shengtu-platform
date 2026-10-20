package service

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestIsCloudflareRefreshError(t *testing.T) {
	cases := []struct {
		msg  string
		want bool
	}{
		{"bootstrap failed: HTTP 403, upstream returned Cloudflare challenge page; refresh browser fingerprint/session or change proxy", true},
		{"bootstrap failed: HTTP 401, unauthorized", false},
		{"network timeout", false},
		{"HTTP 403, body=challenge-platform cf_chl", true},
	}
	for _, tc := range cases {
		got := isCloudflareRefreshError(errString(tc.msg))
		if got != tc.want {
			t.Fatalf("isCloudflareRefreshError(%q)=%v want %v", tc.msg, got, tc.want)
		}
	}
}

func TestAccountCloudflareChallengeResponseExcludesJSON403(t *testing.T) {
	for _, tc := range []struct {
		name        string
		contentType string
		mitigated   string
		body        string
		want        bool
	}{
		{name: "html challenge", contentType: "text/html", body: "<title>Just a moment...</title>", want: true},
		{name: "mitigated challenge", mitigated: "challenge", body: "blocked", want: true},
		{name: "json rejection", contentType: "application/json", mitigated: "challenge", body: `{"detail":"Cloudflare policy"}`, want: false},
		{name: "ordinary text", contentType: "text/plain", body: "forbidden", want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: http.StatusForbidden, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}
			resp.Header.Set("Content-Type", tc.contentType)
			resp.Header.Set("CF-Mitigated", tc.mitigated)
			if got := isAccountCloudflareChallengeResponse(resp, []byte(tc.body)); got != tc.want {
				t.Fatalf("isAccountCloudflareChallengeResponse() = %v, want %v", got, tc.want)
			}
		})
	}
}

type errString string

func (e errString) Error() string { return string(e) }
