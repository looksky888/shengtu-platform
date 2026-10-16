package service

import (
	"chatgpt2api/internal/util"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func (w *registerWorker) exchangePlatformOAuthTokens(ctx context.Context) (map[string]any, error) {
	code := strings.TrimSpace(w.platformAuthCode)
	codeVerifier := strings.TrimSpace(w.platformCodeVerifier)
	if code == "" || codeVerifier == "" {
		return nil, fmt.Errorf("platform oauth code or verifier missing")
	}
	w.step("开始直接交换 token")
	status, tokenPayload, err := w.request(ctx, http.MethodPost, registerAuthBase+"/api/accounts/oauth/token", map[string]any{
		"client_id":     registerPlatformOAuthClientID,
		"code_verifier": codeVerifier,
		"grant_type":    "authorization_code",
		"code":          code,
		"redirect_uri":  registerPlatformOAuthRedirectURI,
	}, w.platformOAuthTokenHeaders(), true)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("direct_oauth_token_http_%d%s", status, registerResponseDetail(tokenPayload))
	}
	accessToken := util.Clean(tokenPayload["access_token"])
	refreshToken := util.Clean(tokenPayload["refresh_token"])
	idToken := util.Clean(tokenPayload["id_token"])
	if accessToken == "" || refreshToken == "" || idToken == "" {
		return nil, fmt.Errorf("token exchange response missing access_token, refresh_token, or id_token")
	}
	w.step("token 交换完成")
	return map[string]any{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"id_token":      idToken,
	}, nil
}

func (w *registerWorker) validateOTPCode(ctx context.Context, code string) (map[string]any, error) {
	status, payload, err := w.request(ctx, http.MethodPost, registerAuthBase+"/api/accounts/email-otp/validate", map[string]any{"code": code}, w.jsonHeaders(registerAuthBase+"/email-verification"), true)
	if err != nil {
		return nil, err
	}
	if status == http.StatusOK {
		w.captureAccountContinueURL(payload)
		return payload, nil
	}
	headers := w.jsonHeaders(registerAuthBase + "/email-verification")
	token, tokenErr := w.buildSentinelToken(ctx, "authorize_continue")
	if tokenErr != nil {
		return nil, fmt.Errorf("validate_otp_http_%d; sentinel fallback failed: %w", status, tokenErr)
	}
	headers["openai-sentinel-token"] = token
	status, payload, err = w.request(ctx, http.MethodPost, registerAuthBase+"/api/accounts/email-otp/validate", map[string]any{"code": code}, headers, true)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("validate_otp_http_%d", status)
	}
	w.captureAccountContinueURL(payload)
	return payload, nil
}

func (w *registerWorker) captureAccountContinueURL(payload map[string]any) {
	if continueURL := util.Clean(payload["continue_url"]); continueURL != "" {
		w.accountContinueURL = continueURL
	}
}

func (w *registerWorker) completeAuthorizeContinue(ctx context.Context) error {
	continueURL := strings.TrimSpace(w.accountContinueURL)
	if continueURL == "" {
		return nil
	}
	if strings.HasPrefix(continueURL, "/") {
		continueURL = registerAuthBase + continueURL
	}
	status, _, err := w.request(ctx, http.MethodGet, continueURL, nil, w.navigateHeaders(registerAuthBase+"/"), true)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("authorize_continue_http_%d", status)
	}
	w.accountContinueURL = ""
	return nil
}

func (w *registerWorker) selectWorkspaceForConsentCode(ctx context.Context, consentURL string) (string, error) {
	workspaceID := w.authSessionWorkspaceID()
	if workspaceID == "" {
		return "", nil
	}
	if strings.HasPrefix(consentURL, "/") {
		consentURL = registerAuthBase + consentURL
	}
	headers := w.jsonHeaders(consentURL)
	status, wsPayload, wsHeaders, err := w.requestDetailed(ctx, http.MethodPost, registerAuthBase+"/api/accounts/workspace/select", map[string]any{
		"workspace_id": workspaceID,
	}, headers, false)
	if err != nil {
		return "", err
	}
	if code := registerOAuthCode(wsHeaders.Get("Location")); code != "" {
		return code, nil
	}
	if code := registerOAuthCode(util.Clean(wsPayload["continue_url"])); code != "" {
		return code, nil
	}
	if status < 200 || status >= 400 {
		return "", fmt.Errorf("workspace_select_http_%d", status)
	}
	data := util.StringMap(wsPayload["data"])
	orgs := util.AsMapSlice(data["orgs"])
	if len(orgs) == 0 {
		return "", nil
	}
	orgID := util.Clean(orgs[0]["id"])
	if orgID == "" {
		return "", nil
	}
	orgBody := map[string]any{"org_id": orgID}
	if projects := util.AsMapSlice(orgs[0]["projects"]); len(projects) > 0 {
		if projectID := util.Clean(projects[0]["id"]); projectID != "" {
			orgBody["project_id"] = projectID
		}
	}
	orgReferer := firstNonEmpty(util.Clean(wsPayload["continue_url"]), consentURL)
	status, orgPayload, orgHeaders, err := w.requestDetailed(ctx, http.MethodPost, registerAuthBase+"/api/accounts/organization/select", orgBody, w.jsonHeaders(orgReferer), false)
	if err != nil {
		return "", err
	}
	if code := registerOAuthCode(orgHeaders.Get("Location")); code != "" {
		return code, nil
	}
	if code := registerOAuthCode(util.Clean(orgPayload["continue_url"])); code != "" {
		return code, nil
	}
	if status < 200 || status >= 400 {
		return "", fmt.Errorf("organization_select_http_%d", status)
	}
	return "", nil
}

func (w *registerWorker) authSessionWorkspaceID() string {
	if w.client == nil || w.client.Jar == nil {
		return ""
	}
	authURL, err := url.Parse(registerAuthBase)
	if err != nil {
		return ""
	}
	var raw string
	for _, cookie := range w.client.Jar.Cookies(authURL) {
		if cookie.Name == "oai-client-auth-session" {
			raw = cookie.Value
			break
		}
	}
	if raw == "" {
		return ""
	}
	firstPart := strings.Split(raw, ".")[0]
	padding := len(firstPart) % 4
	if padding != 0 {
		firstPart += strings.Repeat("=", 4-padding)
	}
	data, err := base64.URLEncoding.DecodeString(firstPart)
	if err != nil {
		return ""
	}
	var payload map[string]any
	if json.Unmarshal(data, &payload) != nil {
		return ""
	}
	workspaces := util.AsMapSlice(payload["workspaces"])
	if len(workspaces) == 0 {
		return ""
	}
	return util.Clean(workspaces[0]["id"])
}
