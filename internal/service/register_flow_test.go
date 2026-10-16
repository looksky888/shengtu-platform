package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func registerJSONResponse(req *http.Request, status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}
}

func registerTextResponse(req *http.Request, status int, contentType string, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{contentType}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}
}

func disableRegisterSentinelOfficialSDKForTest(t *testing.T) {
	t.Helper()
	old := registerSentinelOfficialSDKEnabled
	registerSentinelOfficialSDKEnabled = false
	t.Cleanup(func() { registerSentinelOfficialSDKEnabled = old })
}

func resetRegisterSentinelSDKCacheForTest(t *testing.T) {
	t.Helper()
	registerSentinelSDKAssetCache.Lock()
	oldURL := registerSentinelSDKAssetCache.URL
	oldSource := registerSentinelSDKAssetCache.Source
	oldFetchedAt := registerSentinelSDKAssetCache.FetchedAt
	registerSentinelSDKAssetCache.URL = ""
	registerSentinelSDKAssetCache.Source = ""
	registerSentinelSDKAssetCache.FetchedAt = time.Time{}
	registerSentinelSDKAssetCache.Unlock()
	t.Cleanup(func() {
		registerSentinelSDKAssetCache.Lock()
		registerSentinelSDKAssetCache.URL = oldURL
		registerSentinelSDKAssetCache.Source = oldSource
		registerSentinelSDKAssetCache.FetchedAt = oldFetchedAt
		registerSentinelSDKAssetCache.Unlock()
	})
}

func TestRegisterFNV1A32MatchesPythonImplementation(t *testing.T) {
	cases := map[string]string{
		"":            "ab3e7c0b",
		"abc":         "1cc93dbc",
		"seedpayload": "769860aa",
		"OpenAI":      "ce220710",
	}
	for input, want := range cases {
		if got := registerFNV1A32(input); got != want {
			t.Fatalf("registerFNV1A32(%q) = %s, want %s", input, got, want)
		}
	}
}

func TestBuildSentinelTokenUsesSentinelChallenge(t *testing.T) {
	worker := &registerWorker{
		deviceID: "device-1",
		client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != registerSentinelBase+"/backend-api/sentinel/req" {
				t.Fatalf("unexpected request URL: %s", req.URL.String())
			}
			if got := req.Header.Get("Content-Type"); got != "text/plain;charset=UTF-8" {
				t.Fatalf("Content-Type = %q", got)
			}
			return registerJSONResponse(req, http.StatusOK, `{"token":"challenge-token","proofofwork":{"required":false}}`), nil
		})},
	}

	token, err := worker.buildSentinelToken(context.Background(), "username_password_create")
	if err != nil {
		t.Fatalf("buildSentinelToken() error = %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(token), &payload); err != nil {
		t.Fatalf("sentinel token is not JSON: %v", err)
	}
	if payload["c"] != "challenge-token" || payload["id"] != "device-1" || payload["flow"] != "username_password_create" {
		t.Fatalf("sentinel payload = %#v", payload)
	}
	p, _ := payload["p"].(string)
	if !strings.HasPrefix(p, "gAAAAAC") {
		t.Fatalf("sentinel proof token = %q", p)
	}
}

func TestValidateOTPCodeRetriesWithSentinelToken(t *testing.T) {
	validateCalls := 0
	worker := &registerWorker{
		deviceID: "device-1",
		client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/accounts/email-otp/validate":
				validateCalls++
				if validateCalls == 1 {
					if req.Header.Get("openai-sentinel-token") != "" {
						t.Fatal("first OTP validate unexpectedly had sentinel token")
					}
					return registerJSONResponse(req, http.StatusForbidden, `{"error":"sentinel_required"}`), nil
				}
				if req.Header.Get("openai-sentinel-token") == "" {
					t.Fatal("second OTP validate did not carry sentinel token")
				}
				return registerJSONResponse(req, http.StatusOK, `{"continue_url":"/continue"}`), nil
			case "/backend-api/sentinel/req":
				return registerJSONResponse(req, http.StatusOK, `{"token":"challenge-token","proofofwork":{"required":false}}`), nil
			default:
				t.Fatalf("unexpected request path: %s", req.URL.Path)
				return nil, nil
			}
		})},
	}

	payload, err := worker.validateOTPCode(context.Background(), "123456")
	if err != nil {
		t.Fatalf("validateOTPCode() error = %v", err)
	}
	if validateCalls != 2 {
		t.Fatalf("validate calls = %d, want 2", validateCalls)
	}
	if payload["continue_url"] != "/continue" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestSelectWorkspaceForConsentCodeUsesCookieFallback(t *testing.T) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New() error = %v", err)
	}
	authURL, _ := url.Parse(registerAuthBase)
	cookiePayload, _ := json.Marshal(map[string]any{"workspaces": []map[string]any{{"id": "workspace-1"}}})
	jar.SetCookies(authURL, []*http.Cookie{
		{Name: "oai-client-auth-session", Value: base64.RawURLEncoding.EncodeToString(cookiePayload) + ".rest", Path: "/"},
	})
	worker := &registerWorker{
		deviceID: "device-1",
		client: &http.Client{Jar: jar, Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/accounts/workspace/select":
				return registerJSONResponse(req, http.StatusOK, `{"data":{"orgs":[{"id":"org-1","projects":[{"id":"project-1"}]}]},"continue_url":"https://auth.openai.com/continue"}`), nil
			case "/api/accounts/organization/select":
				resp := registerJSONResponse(req, http.StatusFound, `{}`)
				resp.Header.Set("Location", registerPlatformOAuthRedirectURI+"?code=callback-code&state=state")
				return resp, nil
			default:
				t.Fatalf("unexpected request path: %s", req.URL.Path)
				return nil, nil
			}
		})},
	}

	code, err := worker.selectWorkspaceForConsentCode(context.Background(), registerAuthBase+"/sign-in-with-chatgpt/codex/consent")
	if err != nil {
		t.Fatalf("selectWorkspaceForConsentCode() error = %v", err)
	}
	if code != "callback-code" {
		t.Fatalf("code = %q", code)
	}
}

func TestRegisterHTTPClientUsesSOCKSTransport(t *testing.T) {
	client, err := registerHTTPClient("socks5h://127.0.0.1:1", time.Second, "device-1")
	if err != nil {
		t.Fatalf("registerHTTPClient() error = %v", err)
	}
	transport, ok := client.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("transport type = %T", client.Transport)
	}
	if transport.Proxy != nil {
		t.Fatal("SOCKS register transport should not use http.ProxyURL")
	}
	if transport.DialContext == nil {
		t.Fatal("SOCKS register transport missing DialContext")
	}
}

func TestExtractRegisterMailCodeFromRawMIME(t *testing.T) {
	raw := strings.Join([]string{
		"From: OpenAI <noreply@example.test>",
		"To: user@example.test",
		"Subject: Verify",
		"Content-Type: multipart/alternative; boundary=abc",
		"",
		"--abc",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"Your verification code is 654321",
		"--abc--",
	}, "\r\n")
	if got := extractRegisterMailCode(map[string]any{"raw": raw}); got != "654321" {
		t.Fatalf("extractRegisterMailCode(raw) = %q", got)
	}
}

func TestRegisterMessageMatchesEmail(t *testing.T) {
	message := map[string]any{"to": []any{map[string]any{"address": "target@example.test"}}}
	if !registerMessageMatchesEmail(message, "target@example.test") {
		t.Fatal("matching recipient was rejected")
	}
	if registerMessageMatchesEmail(message, "other@example.test") {
		t.Fatal("non-matching recipient was accepted")
	}
}

func TestLatestRegisterMailMessageByTimestamp(t *testing.T) {
	items := []map[string]any{
		{"id": "old", "timestamp": float64(100), "subject": "old"},
		{"id": "new", "timestamp": float64(200), "subject": "new"},
	}
	if got := latestRegisterMailMessage(items); got["id"] != "new" {
		t.Fatalf("latestRegisterMailMessage() = %#v", got)
	}
}
func TestBuildSentinelTokensExtractsSOToken(t *testing.T) {
	disableRegisterSentinelOfficialSDKForTest(t)
	oldDelay := registerSentinelSOObserverDelay
	registerSentinelSOObserverDelay = 0
	t.Cleanup(func() { registerSentinelSOObserverDelay = oldDelay })
	worker := &registerWorker{
		deviceID: "device-1",
		client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != registerSentinelBase+"/backend-api/sentinel/req" {
				t.Fatalf("unexpected request URL: %s", req.URL.String())
			}
			return registerJSONResponse(req, http.StatusOK, `{"token":"challenge-token","requirements":{"so_token":"so-token"},"proofofwork":{"required":false}}`), nil
		})},
	}

	tokens, err := worker.buildSentinelTokens(context.Background(), "oauth_create_account")
	if err != nil {
		t.Fatalf("buildSentinelTokens() error = %v", err)
	}
	if tokens.Token == "" || tokens.SOToken != "so-token" || tokens.SDK != registerSentinelSDK {
		t.Fatalf("tokens = %#v", tokens)
	}
}

func TestBuildSentinelTokensSolvesNestedSORequirement(t *testing.T) {
	disableRegisterSentinelOfficialSDKForTest(t)
	oldDelay := registerSentinelSOObserverDelay
	registerSentinelSOObserverDelay = 0
	t.Cleanup(func() { registerSentinelSOObserverDelay = oldDelay })
	worker := &registerWorker{
		deviceID: "device-1",
		client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != registerSentinelBase+"/backend-api/sentinel/req" {
				t.Fatalf("unexpected request URL: %s", req.URL.String())
			}
			return registerJSONResponse(req, http.StatusOK, `{"token":"challenge-token","requirements":{"so":{"required":true,"seed":"seed","difficulty":"ffffffff"}},"proofofwork":{"required":false}}`), nil
		})},
	}

	tokens, err := worker.buildSentinelTokens(context.Background(), "oauth_create_account")
	if err != nil {
		t.Fatalf("buildSentinelTokens() error = %v", err)
	}
	if tokens.SOToken == "" || !strings.HasPrefix(tokens.SOToken, "gAAAAAB") {
		t.Fatalf("SO token = %q", tokens.SOToken)
	}
	if tokens.SODiagnostic == "" {
		t.Fatalf("SODiagnostic was empty: %#v", tokens)
	}
}

func TestBuildSentinelTokensUsesOfficialSDKForCreateAccount(t *testing.T) {
	resetRegisterSentinelSDKCacheForTest(t)
	oldEnabled := registerSentinelOfficialSDKEnabled
	oldRunner := registerSentinelSDKRunner
	registerSentinelOfficialSDKEnabled = true
	registerSentinelSDKRunner = func(ctx context.Context, payload map[string]any) (map[string]any, error) {
		switch payload["mode"] {
		case "prepare":
			if payload["sdk_source"] == "" || payload["sdk_url"] == "" {
				t.Fatalf("prepare payload missing sdk fields: %#v", payload)
			}
			return map[string]any{"prepare_token": "sdk-prepare-token"}, nil
		case "artifacts":
			reqData, ok := payload["req_data"].(map[string]any)
			if !ok || reqData["token"] != "challenge-token" {
				t.Fatalf("artifacts payload req_data = %#v", payload["req_data"])
			}
			return map[string]any{"token": "sdk-final-token", "so_token": "sdk-so-token"}, nil
		default:
			t.Fatalf("unexpected sdk runner mode: %#v", payload)
			return nil, nil
		}
	}
	t.Cleanup(func() {
		registerSentinelOfficialSDKEnabled = oldEnabled
		registerSentinelSDKRunner = oldRunner
	})

	const sdkURL = registerSentinelBase + "/sentinel/20260124test/sdk.js"
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New() error = %v", err)
	}
	worker := &registerWorker{
		deviceID: "device-1",
		client: &http.Client{Jar: jar, Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case registerSentinelBase + "/backend-api/sentinel/frame.html":
				return registerTextResponse(req, http.StatusOK, "text/html", `<script src="`+sdkURL+`"></script>`), nil
			case sdkURL:
				return registerTextResponse(req, http.StatusOK, "application/javascript", `var SentinelSDK={};`), nil
			case registerSentinelBase + "/backend-api/sentinel/req":
				var body map[string]any
				raw, _ := io.ReadAll(req.Body)
				if err := json.Unmarshal(raw, &body); err != nil {
					t.Fatalf("sentinel req body is not JSON: %v", err)
				}
				if body["p"] != "sdk-prepare-token" || body["id"] != "device-1" || body["flow"] != "oauth_create_account" {
					t.Fatalf("sentinel req body = %#v", body)
				}
				return registerJSONResponse(req, http.StatusOK, `{"token":"challenge-token","so":{"required":true,"collector_dx":"collector","snapshot_dx":"snapshot"},"proofofwork":{"required":false}}`), nil
			default:
				t.Fatalf("unexpected request URL: %s", req.URL.String())
				return nil, nil
			}
		})},
	}

	tokens, err := worker.buildSentinelTokens(context.Background(), "oauth_create_account")
	if err != nil {
		t.Fatalf("buildSentinelTokens() error = %v", err)
	}
	if tokens.Token != "sdk-final-token" || tokens.SOToken != "sdk-so-token" || tokens.SDK != sdkURL || tokens.Source != "official_sdk" {
		t.Fatalf("tokens = %#v", tokens)
	}
	authURL, _ := url.Parse(registerAuthBase + "/")
	foundCookie := false
	for _, cookie := range jar.Cookies(authURL) {
		if cookie.Name == "oai-sc" && cookie.Value == "0challenge-token" {
			foundCookie = true
			break
		}
	}
	if !foundCookie {
		t.Fatalf("oai-sc cookie was not applied: %#v", jar.Cookies(authURL))
	}
}

func TestCompleteAuthorizeContinueFollowsOTPContinueURL(t *testing.T) {
	called := false
	worker := &registerWorker{
		service:            &RegisterService{subscribers: map[chan string]struct{}{}},
		index:              1,
		deviceID:           "device-1",
		accountContinueURL: registerAuthBase + "/continue/email",
		client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.Path != "/continue/email" {
				t.Fatalf("unexpected request path: %s", req.URL.Path)
			}
			called = true
			return registerJSONResponse(req, http.StatusOK, `{}`), nil
		})},
	}

	if err := worker.completeAuthorizeContinue(context.Background()); err != nil {
		t.Fatalf("completeAuthorizeContinue() error = %v", err)
	}
	if !called {
		t.Fatal("continue URL was not requested")
	}
	if worker.accountContinueURL != "" {
		t.Fatalf("accountContinueURL = %q, want cleared", worker.accountContinueURL)
	}
}
