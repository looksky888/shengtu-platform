package service

import (
	"chatgpt2api/internal/util"
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (w *registerWorker) platformAuthorize(ctx context.Context, email string) error {
	w.step("开始 platform authorize")
	codeVerifier, codeChallenge := generateRegisterPKCE()
	w.platformCodeVerifier = codeVerifier
	w.platformAuthCode = ""
	w.passwordlessSignup = false
	w.lastFinalURL = ""
	values := registerAuthorizeParams(email, w.deviceID, registerRandomToken(), registerRandomToken(), codeChallenge)
	status, payload, err := w.request(ctx, http.MethodGet, registerAuthBase+"/api/accounts/authorize?"+values.Encode(), nil, w.navigateHeaders(registerPlatformBase+"/"), true)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("platform_authorize_http_%d%s", status, registerAuthorizeErrorDetail(payload))
	}
	// Landed URL may already be the email OTP page (passwordless).
	finalURL := strings.ToLower(w.lastFinalURL)
	w.passwordlessSignup = strings.Contains(finalURL, "email-verification") || strings.Contains(finalURL, "email-otp")
	mode := "password"
	if w.passwordlessSignup {
		mode = "passwordless"
	}
	w.step(fmt.Sprintf("platform authorize 完成 mode=%s", mode))
	return nil
}

// startPasswordlessSignup switches the auth session into passwordless OTP signup
// (POST /api/accounts/passwordless/send-otp). Replaces the obsolete user/register + email-otp/send path.
func (w *registerWorker) startPasswordlessSignup(ctx context.Context) error {
	w.step("开始切换 passwordless signup 并发送验证码")
	status, payload, err := w.request(ctx, http.MethodPost, registerAuthBase+"/api/accounts/passwordless/send-otp", map[string]any{}, w.jsonHeaders(registerAuthBase+"/create-account/password"), true)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("passwordless_send_otp_http_%d%s", status, registerResponseDetail(payload))
	}
	w.passwordlessSignup = true
	w.step("passwordless signup 验证码发送完成")
	return nil
}

// registerUser is retained for tests / emergency fallback. Prefer passwordless flow.
func (w *registerWorker) registerUser(ctx context.Context, email, password string) error {
	w.step("开始提交注册密码")
	headers := w.jsonHeaders(registerAuthBase + "/create-account/password")
	token, err := w.buildSentinelToken(ctx, "username_password_create")
	if err != nil {
		return err
	}
	headers["openai-sentinel-token"] = token
	status, payload, err := w.request(ctx, http.MethodPost, registerAuthBase+"/api/accounts/user/register", map[string]any{
		"username": email,
		"password": password,
	}, headers, true)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		if registerFailedToCreateAccount(payload) {
			w.step("\u6ce8\u518c\u5931\u8d25\u63d0\u793a: \u90ae\u7bb1\u57df\u540d\u5f88\u53ef\u80fd\u56e0\u6ee5\u7528\u88ab\u5c01\u7981\uff0c\u8bf7\u66f4\u6362\u90ae\u7bb1\u57df\u540d")
		}
		return fmt.Errorf("user_register_http_%d%s", status, registerResponseDetail(payload))
	}
	w.step("提交注册密码完成")
	return nil
}

func (w *registerWorker) validateOTP(ctx context.Context, code string) error {
	w.step("开始校验验证码 " + code)
	if _, err := w.validateOTPCode(ctx, code); err != nil {
		return err
	}
	w.step("验证码校验完成")
	if err := w.completeAuthorizeContinue(ctx); err != nil {
		return err
	}
	return nil
}

func (w *registerWorker) createAccount(ctx context.Context, name, birthdate string) error {
	w.step("开始创建账号资料")
	headers := w.jsonHeaders(registerAuthBase + "/about-you")
	tokens, err := w.buildCreateAccountSentinelTokens(ctx)
	if err != nil {
		return err
	}
	headers["openai-sentinel-token"] = tokens.Token
	if tokens.SOToken == "" {
		w.step(fmt.Sprintf(
			"Sentinel create_account token \u7f3a\u5c11 SO token: token_len=%d sdk=%s source=%s detail=%s",
			len(tokens.Token),
			firstNonEmpty(tokens.SDK, registerSentinelSDK),
			firstNonEmpty(tokens.Source, "sentinel_req"),
			firstNonEmpty(tokens.SODiagnostic, "so=unknown"),
		))
		return fmt.Errorf("sentinel_so_token_missing")
	}
	headers["openai-sentinel-so-token"] = tokens.SOToken
	status, payload, err := w.request(ctx, http.MethodPost, registerAuthBase+"/api/accounts/create_account", map[string]any{
		"name":      name,
		"birthdate": birthdate,
	}, headers, true)
	if err != nil {
		return err
	}
	if status != http.StatusOK && status != http.StatusFound {
		if registerFailedToCreateAccount(payload) {
			w.step("\u521b\u5efa\u8d26\u53f7\u5931\u8d25\u63d0\u793a: \u90ae\u7bb1\u57df\u540d\u5f88\u53ef\u80fd\u56e0\u6ee5\u7528\u88ab\u5c01\u7981\uff0c\u8bf7\u66f4\u6362\u90ae\u7bb1\u57df\u540d")
		}
		return fmt.Errorf("create_account_http_%d%s", status, registerResponseDetail(payload))
	}
	if code := registerOAuthCode(util.Clean(payload["continue_url"])); code != "" {
		w.platformAuthCode = code
	}
	w.step("创建账号资料完成")
	return nil
}

func (w *registerWorker) buildCreateAccountSentinelTokens(ctx context.Context) (registerSentinelTokens, error) {
	var last registerSentinelTokens
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		tokens, err := w.buildSentinelTokens(ctx, "oauth_create_account")
		if err != nil {
			lastErr = err
			continue
		}
		last = tokens
		if tokens.SOToken != "" {
			if attempt > 1 {
				w.step(fmt.Sprintf("Sentinel create_account SO token \u7b2c %d \u6b21\u91cd\u8bd5\u751f\u6210\u6210\u529f", attempt))
			}
			return tokens, nil
		}
		w.step(fmt.Sprintf(
			"Sentinel create_account token \u7f3a\u5c11 SO token\uff0c\u51c6\u5907\u91cd\u8bd5: attempt=%d token_len=%d sdk=%s source=%s detail=%s",
			attempt,
			len(tokens.Token),
			firstNonEmpty(tokens.SDK, registerSentinelSDK),
			firstNonEmpty(tokens.Source, "sentinel_req"),
			firstNonEmpty(tokens.SODiagnostic, "so=unknown"),
		))
		if attempt < 2 {
			select {
			case <-ctx.Done():
				return registerSentinelTokens{}, ctx.Err()
			case <-time.After(800 * time.Millisecond):
			}
		}
	}
	if last.Token != "" || lastErr == nil {
		return last, nil
	}
	return registerSentinelTokens{}, lastErr
}
