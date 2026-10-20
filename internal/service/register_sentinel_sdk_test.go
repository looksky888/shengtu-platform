package service

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

// TestRegisterSentinelAbsoluteSDKURLRejectsUnsafeTargets pins the audit
// finding: the SDK URL is extracted from upstream HTML and handed to Node's vm,
// which is not a security boundary, so only https on an allowlisted host may
// survive.
func TestRegisterSentinelAbsoluteSDKURLRejectsUnsafeTargets(t *testing.T) {
	for _, value := range []string{
		"http://sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
		"http://cdn.oaistatic.com/sentinel/20260124ceb8/sdk.js",
		"HTTP://sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
		"https://evil.example.com/sentinel/20260124ceb8/sdk.js",
		"https://sentinel.openai.com.evil.example.com/sentinel/20260124ceb8/sdk.js",
		"https://cdn.oaistatic.com.evil.example.com/sentinel/20260124ceb8/sdk.js",
		"https://127.0.0.1:8080/sentinel/20260124ceb8/sdk.js",
		"https://user:pass@sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
		"ftp://sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
		"javascript:alert(1)",
		"",
	} {
		if got := registerSentinelAbsoluteSDKURL(value); got != "" {
			t.Fatalf("registerSentinelAbsoluteSDKURL(%q) = %q, want rejected", value, got)
		}
	}
}

func TestRegisterSentinelAbsoluteSDKURLKeepsAllowlistedHTTPS(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  string
	}{
		{
			value: "https://sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
			want:  "https://sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
		},
		{
			value: "https://cdn.oaistatic.com/sentinel/20260124ceb8/sdk.js",
			want:  "https://cdn.oaistatic.com/sentinel/20260124ceb8/sdk.js",
		},
		{
			value: "//cdn.oaistatic.com/sentinel/20260124ceb8/sdk.js",
			want:  "https://cdn.oaistatic.com/sentinel/20260124ceb8/sdk.js",
		},
		{
			value: "/sentinel/20260124ceb8/sdk.js",
			want:  registerSentinelBase + "/sentinel/20260124ceb8/sdk.js",
		},
		{
			value: "sentinel/20260124ceb8/sdk.js",
			want:  registerSentinelBase + "/sentinel/20260124ceb8/sdk.js",
		},
	} {
		if got := registerSentinelAbsoluteSDKURL(tc.value); got != tc.want {
			t.Fatalf("registerSentinelAbsoluteSDKURL(%q) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

// TestLoadSentinelSDKAssetsRejectsForeignSDKURL proves the boundary holds
// end-to-end: a foreign src in the upstream frame HTML is refused and its script
// is never downloaded.
func TestLoadSentinelSDKAssetsRejectsForeignSDKURL(t *testing.T) {
	resetRegisterSentinelSDKCacheForTest(t)
	var fetched []string
	worker := &registerWorker{client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		fetched = append(fetched, req.URL.String())
		if strings.HasSuffix(req.URL.Path, "/backend-api/sentinel/frame.html") {
			return registerTextResponse(req, http.StatusOK, "text/html", `<html><script src="https://evil.example.com/sentinel/20260124ceb8/sdk.js"></script></html>`), nil
		}
		return registerTextResponse(req, http.StatusOK, "application/javascript", "SentinelSDK"), nil
	})}}
	if _, _, err := worker.loadSentinelSDKAssets(context.Background(), registerUserAgent); err == nil || err.Error() != "sentinel_sdk_url_rejected" {
		t.Fatalf("loadSentinelSDKAssets() error = %v, want sentinel_sdk_url_rejected", err)
	}
	for _, url := range fetched {
		if strings.Contains(url, "evil.example.com") {
			t.Fatalf("foreign SDK URL was fetched: %s", url)
		}
	}
}

func TestLoadSentinelSDKAssetsAcceptsAllowlistedHost(t *testing.T) {
	resetRegisterSentinelSDKCacheForTest(t)
	var fetched []string
	worker := &registerWorker{client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		fetched = append(fetched, req.URL.String())
		if strings.HasSuffix(req.URL.Path, "/backend-api/sentinel/frame.html") {
			return registerTextResponse(req, http.StatusOK, "text/html", `<html><script src="/sentinel/20260124ceb8/sdk.js"></script></html>`), nil
		}
		return registerTextResponse(req, http.StatusOK, "application/javascript", "/* SentinelSDK */"), nil
	})}}
	sdkURL, source, err := worker.loadSentinelSDKAssets(context.Background(), registerUserAgent)
	if err != nil {
		t.Fatalf("loadSentinelSDKAssets() error = %v", err)
	}
	if sdkURL != registerSentinelSDK {
		t.Fatalf("sdkURL = %q", sdkURL)
	}
	if source == "" || len(fetched) != 2 {
		t.Fatalf("source=%q fetched=%v", source, fetched)
	}
}
