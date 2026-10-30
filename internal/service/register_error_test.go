package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type registerErrorRoundTripFunc func(*http.Request) (*http.Response, error)

func (f registerErrorRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func registerErrorJSONResponse(req *http.Request, status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}
}

func testRegisterWorker(transport http.RoundTripper) (*registerWorker, *RegisterService) {
	service := &RegisterService{subscribers: map[chan string]struct{}{}}
	return &registerWorker{
		service:  service,
		index:    1,
		client:   &http.Client{Transport: transport},
		deviceID: "device-1",
	}, service
}

func TestPlatformAuthorizeIncludesUpstreamErrorDetail(t *testing.T) {
	worker, _ := testRegisterWorker(registerErrorRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/accounts/authorize" {
			t.Fatalf("unexpected request path: %s", req.URL.Path)
		}
		return registerErrorJSONResponse(req, http.StatusForbidden, `{"error":{"code":"country_blocked","message":"not allowed"}}`), nil
	}))

	err := worker.platformAuthorize(context.Background(), "user@example.test")
	if err == nil {
		t.Fatal("platformAuthorize() returned nil error")
	}
	if got := err.Error(); !strings.Contains(got, "platform_authorize_http_403: country_blocked - not allowed") {
		t.Fatalf("platformAuthorize() error = %q", got)
	}
}

func TestStartPasswordlessSignupSuccess(t *testing.T) {
	worker, _ := testRegisterWorker(registerErrorRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/accounts/passwordless/send-otp" {
			t.Fatalf("unexpected path: %s", req.URL.Path)
		}
		if req.Method != http.MethodPost {
			t.Fatalf("method = %s", req.Method)
		}
		return registerErrorJSONResponse(req, http.StatusOK, `{"success":true}`), nil
	}))
	if err := worker.startPasswordlessSignup(context.Background()); err != nil {
		t.Fatalf("startPasswordlessSignup() error = %v", err)
	}
	if !worker.passwordlessSignup {
		t.Fatal("passwordlessSignup not set")
	}
}

func TestPlatformAuthorizeDetectsPasswordlessLanding(t *testing.T) {
	worker, _ := testRegisterWorker(registerErrorRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/accounts/authorize" {
			t.Fatalf("unexpected path: %s", req.URL.Path)
		}
		resp := registerErrorJSONResponse(req, http.StatusOK, `{}`)
		// Simulate redirect landing on email verification page.
		final, _ := http.NewRequest(http.MethodGet, "https://auth.openai.com/email-verification", nil)
		resp.Request = final
		return resp, nil
	}))
	if err := worker.platformAuthorize(context.Background(), "user@example.test"); err != nil {
		t.Fatalf("platformAuthorize() error = %v", err)
	}
	if !worker.passwordlessSignup {
		t.Fatal("expected passwordlessSignup=true when landing on email-verification")
	}
}

func TestRegisterUserIncludesResponseDetailAndDomainHint(t *testing.T) {
	worker, service := testRegisterWorker(registerErrorRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/backend-api/sentinel/req":
			return registerErrorJSONResponse(req, http.StatusOK, `{"token":"challenge-token","proofofwork":{"required":false}}`), nil
		case "/api/accounts/user/register":
			if req.Header.Get("openai-sentinel-token") == "" {
				t.Fatal("register request did not include sentinel token")
			}
			return registerErrorJSONResponse(req, http.StatusBadRequest, `{"message":"Failed to create account. Please try again.","request_id":"req_1"}`), nil
		default:
			t.Fatalf("unexpected request path: %s", req.URL.Path)
			return nil, nil
		}
	}))

	err := worker.registerUser(context.Background(), "user@example.test", "password")
	if err == nil {
		t.Fatal("registerUser() returned nil error")
	}
	if got := err.Error(); !strings.Contains(got, "user_register_http_400, detail=") || !strings.Contains(got, "Failed to create account") {
		t.Fatalf("registerUser() error = %q", got)
	}
	if !registerLogsContain(service.logs, "邮箱域名很可能因滥用被封禁") {
		t.Fatalf("logs did not contain domain-block hint: %#v", service.logs)
	}
}

func TestCreateAccountIncludesResponseDetailAndDomainHint(t *testing.T) {
	disableRegisterSentinelOfficialSDKForTest(t)
	oldDelay := registerSentinelSOObserverDelay
	registerSentinelSOObserverDelay = 0
	t.Cleanup(func() { registerSentinelSOObserverDelay = oldDelay })
	worker, service := testRegisterWorker(registerErrorRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/backend-api/sentinel/req":
			return registerErrorJSONResponse(req, http.StatusOK, `{"token":"challenge-token","so_token":"so-token","proofofwork":{"required":false}}`), nil
		case "/api/accounts/create_account":
			if req.Header.Get("openai-sentinel-token") == "" {
				t.Fatal("create account request did not include sentinel token")
			}
			if req.Header.Get("openai-sentinel-so-token") != "so-token" {
				t.Fatalf("create account SO token = %q", req.Header.Get("openai-sentinel-so-token"))
			}
			return registerErrorJSONResponse(req, http.StatusBadRequest, `{"message":"Failed to create account. Please try again.","request_id":"req_2"}`), nil
		default:
			t.Fatalf("unexpected request path: %s", req.URL.Path)
			return nil, nil
		}
	}))

	err := worker.createAccount(context.Background(), "Test User", "1990-01-01")
	if err == nil {
		t.Fatal("createAccount() returned nil error")
	}
	if got := err.Error(); !strings.Contains(got, "create_account_http_400, detail=") || !strings.Contains(got, "Failed to create account") {
		t.Fatalf("createAccount() error = %q", got)
	}
	if !registerLogsContain(service.logs, "\u521b\u5efa\u8d26\u53f7\u5931\u8d25\u63d0\u793a") {
		t.Fatalf("logs did not contain domain-block hint: %#v", service.logs)
	}
}

func TestCreateAccountRequiresSentinelSOToken(t *testing.T) {
	disableRegisterSentinelOfficialSDKForTest(t)
	oldDelay := registerSentinelSOObserverDelay
	registerSentinelSOObserverDelay = 0
	t.Cleanup(func() { registerSentinelSOObserverDelay = oldDelay })
	createAccountCalled := false
	worker, service := testRegisterWorker(registerErrorRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/backend-api/sentinel/req":
			return registerErrorJSONResponse(req, http.StatusOK, `{"token":"challenge-token","proofofwork":{"required":false}}`), nil
		case "/api/accounts/create_account":
			createAccountCalled = true
			return registerErrorJSONResponse(req, http.StatusOK, `{}`), nil
		default:
			t.Fatalf("unexpected request path: %s", req.URL.Path)
			return nil, nil
		}
	}))

	err := worker.createAccount(context.Background(), "Test User", "1990-01-01")
	if err == nil || !strings.Contains(err.Error(), "sentinel_so_token_missing") {
		t.Fatalf("createAccount() error = %v, want sentinel_so_token_missing", err)
	}
	if createAccountCalled {
		t.Fatal("create_account was called without SO token")
	}
	if !registerLogsContain(service.logs, "\u7f3a\u5c11 SO token") {
		t.Fatalf("logs did not contain SO token diagnostic: %#v", service.logs)
	}
}

func TestRegisterServiceLogMessagesAreReadableChinese(t *testing.T) {
	service := NewRegisterService(t.TempDir(), nil)

	if _, err := service.Stop(); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if !registerLogsContain(service.logs, "已请求停止注册任务") {
		t.Fatalf("stop log is not readable Chinese: %#v", service.logs)
	}
	assertRegisterLogsNoMojibake(t, service.logs)

	service.logs = nil
	cfg := registerDefaultConfig()
	cfg.Proxy = "http://"
	result := service.runWorker(context.Background(), 1, cfg.toMap())
	if result.ok {
		t.Fatal("runWorker() succeeded with invalid proxy")
	}
	if !registerLogsContain(service.logs, "任务1 初始化失败") {
		t.Fatalf("worker failure log is not readable Chinese: %#v", service.logs)
	}
	assertRegisterLogsNoMojibake(t, service.logs)
}

func registerLogsContain(logs []RegisterLog, text string) bool {
	for _, item := range logs {
		if strings.Contains(item.Text, text) {
			return true
		}
	}
	return false
}

func assertRegisterLogsNoMojibake(t *testing.T, logs []RegisterLog) {
	t.Helper()
	markers := []string{"\u951b", "\u5a09", "\u6d60", "\u95c1", "\u95ba", "\u7035", "\u93c2", "\u59af", "\ufffd"}
	for _, item := range logs {
		for _, marker := range markers {
			if strings.Contains(item.Text, marker) {
				t.Fatalf("log contains mojibake marker %q: %q", marker, item.Text)
			}
		}
	}
}
