package service

import (
	"chatgpt2api/internal/util"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"
)

func newRegisterWorker(service *RegisterService, index int, config map[string]any) (*registerWorker, error) {
	deviceID := util.NewUUID()
	client, err := registerHTTPClient(util.Clean(config["proxy"]), 60*time.Second, deviceID)
	if err != nil {
		return nil, err
	}
	return &registerWorker{
		service:  service,
		index:    index,
		config:   config,
		mail:     util.StringMap(config["mail"]),
		client:   client,
		deviceID: deviceID,
	}, nil
}

func registerHTTPClient(proxy string, timeout time.Duration, deviceID string) (*http.Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	proxy = strings.TrimSpace(proxy)
	if proxy != "" {
		parsed, parseErr := url.Parse(proxy)
		if parseErr != nil {
			return nil, parseErr
		}
		if parsed.Host == "" {
			return nil, fmt.Errorf("代理 URL 无效")
		}
	}
	var client *http.Client
	if registerProxyIsSOCKS(proxy) {
		client = &http.Client{Timeout: timeout, Transport: transportForProxy(proxy)}
	} else {
		client = browserHTTPClientForProfile(proxy, "chrome-windows", timeout)
	}
	if client == nil {
		client = &http.Client{Timeout: timeout, Transport: transportForProxy(proxy)}
	}
	client.Timeout = timeout
	if client.Transport == nil {
		client.Transport = transportForProxy(proxy)
	}
	client.Jar = jar
	authURL, _ := url.Parse(registerAuthBase)
	if authURL != nil {
		jar.SetCookies(authURL, []*http.Cookie{
			{Name: "oai-did", Value: deviceID, Domain: ".auth.openai.com", Path: "/"},
			{Name: "oai-did", Value: deviceID, Domain: "auth.openai.com", Path: "/"},
		})
	}
	return client, nil
}

func registerProxyIsSOCKS(candidate string) bool {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return false
	}
	parsed, err := url.Parse(candidate)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return scheme == "socks5" || scheme == "socks5h"
}

func (w *registerWorker) close() {
	if w.client != nil {
		w.client.CloseIdleConnections()
	}
}

func (w *registerWorker) run(ctx context.Context) (map[string]any, error) {
	w.step("开始创建邮箱")
	mailbox, err := createRegisterMailbox(w.mail, "")
	if err != nil {
		return nil, err
	}
	email := util.Clean(mailbox["address"])
	if email == "" {
		primary := fmt.Errorf("邮箱服务未返回地址")
		if releaseErr := releaseRegisterMailbox(mailbox); releaseErr != nil {
			return nil, errors.Join(primary, fmt.Errorf("释放 OutlookToken 邮箱状态失败: %w", releaseErr))
		}
		return nil, primary
	}
	w.step("邮箱创建成功: " + email)
	tokens, runErr := w.runWithMailbox(ctx, mailbox, email)
	if runErr != nil {
		if stateErr := markRegisterMailboxResult(mailbox, false, runErr); stateErr != nil {
			return nil, errors.Join(runErr, fmt.Errorf("保存 OutlookToken 失败状态失败: %w", stateErr))
		}
		return nil, runErr
	}
	if err := markRegisterMailboxResult(mailbox, true, nil); err != nil {
		return nil, fmt.Errorf("保存 OutlookToken 成功状态失败: %w", err)
	}
	return tokens, nil
}

func (w *registerWorker) runWithMailbox(ctx context.Context, mailbox map[string]any, email string) (map[string]any, error) {
	// Passwordless signup: authorize → (optional passwordless/send-otp) → email OTP → create_account → oauth token.
	// Do not call user/register; OpenAI rejects it with invalid_auth_step on the current flow.
	firstName, lastName := registerRandomName()
	if err := w.platformAuthorize(ctx, email); err != nil {
		return nil, err
	}
	if !w.passwordlessSignup {
		if err := w.startPasswordlessSignup(ctx); err != nil {
			return nil, err
		}
	}
	w.step("已进入 passwordless signup，不创建本地密码")
	w.step("等待邮箱验证码")
	code, err := waitRegisterCode(ctx, w.mail, mailbox)
	if err != nil {
		return nil, err
	}
	if code == "" {
		return nil, fmt.Errorf("等待注册验证码超时")
	}
	w.step("收到验证码: " + code)
	if err := w.validateOTP(ctx, code); err != nil {
		return nil, err
	}
	if err := w.createAccount(ctx, firstName+" "+lastName, registerRandomBirthdate()); err != nil {
		return nil, err
	}
	tokens, err := w.exchangePlatformOAuthTokens(ctx)
	if err != nil {
		return nil, err
	}
	tokens["email"] = email
	tokens["password"] = ""
	tokens["created_at"] = util.NowISO()
	return tokens, nil
}

func registerAuthorizeErrorDetail(payload map[string]any) string {
	errPayload := util.StringMap(payload["error"])
	if len(errPayload) == 0 {
		return registerResponseDetail(payload)
	}
	var parts []string
	if code := util.Clean(errPayload["code"]); code != "" {
		parts = append(parts, code)
	}
	if message := util.Clean(errPayload["message"]); message != "" {
		parts = append(parts, message)
	}
	if len(parts) == 0 {
		return registerResponseDetail(payload)
	}
	return ": " + strings.Join(parts, " - ")
}

func registerResponseDetail(payload map[string]any) string {
	if len(payload) == 0 {
		return ""
	}
	data, err := json.Marshal(payload)
	if err != nil || len(data) == 0 {
		return ""
	}
	return ", detail=" + string(data)
}

func registerFailedToCreateAccount(payload map[string]any) bool {
	return util.Clean(payload["message"]) == "Failed to create account. Please try again."
}
