package service

import "testing"

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

type errString string

func (e errString) Error() string { return string(e) }
