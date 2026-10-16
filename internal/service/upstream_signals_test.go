package service

import "testing"

func TestUpstreamSignalKindMatrix(t *testing.T) {
	// kind flags: dead, cf, rate, timeout, gateway, network(IsNetworkFlaky)
	type want struct {
		dead, cf, rate, timeout, gateway, network bool
	}
	cases := []struct {
		name string
		msg  string
		want want
	}{
		{
			name: "token_expired",
			msg:  `body={"error":{"code":"token_expired"}}`,
			want: want{dead: true},
		},
		{
			name: "authentication token expired phrase",
			msg:  "Provided authentication token is expired. Please try signing in again.",
			want: want{dead: true},
		},
		{
			name: "sign_in_again with 401",
			msg:  "please try signing in again status=401",
			want: want{dead: true},
		},
		{
			name: "rate_limit",
			msg:  "rate_limit exceeded",
			want: want{rate: true},
		},
		{
			name: "http_429",
			msg:  "upstream http_429",
			want: want{rate: true},
		},
		{
			name: "usage limit is quota not http rate",
			msg:  "You've reached the image generation limit for now.",
			// IsUpstreamRateLimitSignal stays false so UI can hit upstream_usage_limit rule first.
			want: want{},
		},
		{
			name: "usage limit still account rate-limited for pool",
			msg:  "You've reached the image generation limit for now.",
			// covered below via IsAccountRateLimitedErrorMessage
			want: want{},
		},
		{
			name: "cloudflare",
			msg:  "cloudflare challenge cf-ray=abc",
			want: want{cf: true},
		},
		{
			name: "deadline exceeded",
			msg:  `Get "https://chatgpt.com/": context deadline exceeded`,
			want: want{timeout: true, network: true},
		},
		{
			name: "gateway 502",
			msg:  "bad gateway status=502",
			want: want{gateway: true, network: true},
		},
		{
			name: "unexpected eof not bare eof",
			msg:  "stream: unexpected EOF",
			want: want{network: true},
		},
		{
			name: "bare eof must not match network",
			msg:  "parse error near eof in body",
			want: want{},
		},
		{
			name: "connection reset",
			msg:  "connection reset by peer",
			want: want{network: true},
		},
		{
			name: "empty",
			msg:  "   ",
			want: want{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := want{
				dead:    IsDeadTokenSignal(tc.msg),
				cf:      IsCloudflareSignal(tc.msg),
				rate:    IsUpstreamRateLimitSignal(tc.msg),
				timeout: IsUpstreamTimeoutSignal(tc.msg),
				gateway: IsUpstreamGatewaySignal(tc.msg),
				network: IsNetworkFlakySignal(tc.msg),
			}
			if got != tc.want {
				t.Fatalf("msg=%q\n got %+v\nwant %+v", tc.msg, got, tc.want)
			}
		})
	}
}

func TestClassifyAccountFailurePriorityMatrix(t *testing.T) {
	// Disposal priority: dead/permanent 401 > temporary (rate/cf) > unknown (network).
	cases := []struct {
		event, msg string
		want       DisposalGrade
	}{
		{"image_stream", "token_expired", DisposalPermanent},
		{"image_acquire", "authentication token has been invalidated", DisposalPermanent},
		{"image_acquire", `/backend-api/me failed: HTTP 401, unauthorized`, DisposalPermanent},
		{"image_stream", "rate_limit exceeded", DisposalTemporary},
		{"image_stream", "cloudflare challenge", DisposalTemporary},
		{"image_stream", "You've reached the image generation limit", DisposalTemporary},
		{"image_stream", `context deadline exceeded`, DisposalUnknown},
		{"image_stream", "connection reset by peer", DisposalUnknown},
		{"image_stream", "HTTP 503 upstream", DisposalUnknown},
		{"image_stream", "conversation failed: status=401, path=/backend-api/conversation", DisposalNone}, // transient stream 401
		{"image_stream", "bootstrap failed: HTTP 429", DisposalNone},
		{"image_stream", "parse error near eof in body", DisposalUnknown}, // no flaky match → falls through 401? no 401 → unknown default
	}
	// Last case: no dead/rate/cf/network → Classify returns DisposalUnknown at end (or None if empty).
	// "parse error near eof" has no signal → falls through to final 401 checks then DisposalUnknown.
	for _, tc := range cases {
		got := ClassifyAccountFailure(tc.event, tc.msg)
		if got != tc.want {
			t.Fatalf("ClassifyAccountFailure(%q,%q)=%q want %q", tc.event, tc.msg, got, tc.want)
		}
	}
}

func TestAccountRateLimitedUsesSignalTable(t *testing.T) {
	if !IsAccountRateLimitedErrorMessage("insufficient_quota") {
		t.Fatal("quota phrase should rate-limit for pool")
	}
	if !IsAccountRateLimitedErrorMessage("You've reached the image generation limit for now.") {
		t.Fatal("generation limit should rate-limit for pool")
	}
	if !IsAccountRateLimitedErrorMessage("status=429") {
		t.Fatal("429 should rate-limit")
	}
	if IsUpstreamRateLimitSignal("You've reached the image generation limit for now.") {
		t.Fatal("usage/gen limit must not be IsUpstreamRateLimitSignal (UI usage_limit rule)")
	}
	if IsAccountRateLimitedErrorMessage("bootstrap failed: HTTP 429") {
		t.Fatal("bootstrap failures must not count as account rate-limit")
	}
}
