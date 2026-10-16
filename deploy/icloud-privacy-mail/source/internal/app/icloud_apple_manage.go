package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func (c *ICloudClient) RefreshAppleAccountManageState(ctx context.Context, loginState LoginState) (LoginState, error) {
	release, err := acquireAppleAccountOperationGate(ctx, appleAccountOperationKey(ICloudSession{}, loginState))
	if err != nil {
		return loginState, err
	}
	defer release()
	return c.refreshAppleAccountManageStateUnlocked(ctx, loginState)
}

func (c *ICloudClient) KeepAliveAppleAccountManageState(ctx context.Context, loginState LoginState) (LoginState, error) {
	release, err := acquireAppleAccountOperationGate(ctx, appleAccountOperationKey(ICloudSession{}, loginState))
	if err != nil {
		return loginState, err
	}
	defer release()
	return c.keepAliveAppleAccountManageStateUnlocked(ctx, loginState)
}

func (c *ICloudClient) keepAliveAppleAccountManageStateUnlocked(ctx context.Context, loginState LoginState) (LoginState, error) {
	if strings.TrimSpace(loginState.Scnt) == "" {
		return loginState, errCode("apple_account_session_missing", "当前登录态缺少 Apple Account 管理态，请重新协议登录", true)
	}
	loginState, err := c.refreshAppleAccountManageStateUnlocked(ctx, loginState)
	if err != nil {
		return loginState, err
	}
	if _, err := c.callAppleAccountRaw(ctx, &loginState, loginState.APIKey, http.MethodGet, "/account/manage/forwardemail", nil, nil); err != nil {
		return loginState, err
	}
	if _, err := c.callAppleAccountRaw(ctx, &loginState, loginState.APIKey, http.MethodPost, "/v2/jslogs", appleAccountJSLogBody(), nil); err != nil {
		if os.Getenv("IPM_DEBUG_APPLE_ACCOUNT") == "1" {
			fmt.Fprintf(os.Stderr, "APPLE_ACCOUNT_DEBUG keepalive jslogs ignored err=%v\n", err)
		}
	}
	markAppleAccountManageOK(&loginState)
	return loginState, nil
}

func appleAccountJSLogBody() []map[string]any {
	return []map[string]any{{
		"eventId":       appleAccountJSLogEventID(),
		"timestamp":     time.Now().UnixMilli(),
		"eventType":     "custom",
		"componentName": "performance",
		"action":        "memory",
		"metadata": map[string]any{
			"domNodeCount":    0,
			"usedJSHeapSize":  0,
			"totalJSHeapSize": 0,
			"heapUtilization": 0,
			"createdAt":       0,
			"elapsedTime":     0,
			"marks": map[string]any{
				"startTime": 0,
			},
			"eventVersion": 1,
		},
	}}
}

func appleAccountKeepAliveDue(loginState LoginState, now time.Time, interval time.Duration) bool {
	if interval <= 0 {
		interval = appleAccountKeepAliveDefaultInterval
	}
	if loginState.LastCheckedAt.IsZero() {
		return true
	}
	return !now.Before(loginState.LastCheckedAt.Add(interval))
}

func (c *ICloudClient) refreshAppleAccountManageStateUnlocked(ctx context.Context, loginState LoginState) (LoginState, error) {
	if strings.TrimSpace(loginState.Scnt) == "" {
		return loginState, errCode("apple_account_session_missing", "当前登录态缺少 Apple Account 管理态，请重新协议登录", true)
	}
	var token struct {
		TimeOutInterval int `json:"timeOutInterval"`
	}
	if err := c.callAppleAccount(ctx, &loginState, "", http.MethodGet, "/account/manage/gs/ws/token", nil, &token); err != nil {
		return loginState, err
	}
	markAppleAccountManageTokenTTL(&loginState, token.TimeOutInterval, time.Now())
	if token.TimeOutInterval <= 0 {
		if err := c.warmAppleAccountPortal(ctx, &loginState); err == nil {
			token = struct {
				TimeOutInterval int `json:"timeOutInterval"`
			}{}
			withoutScnt := loginState
			withoutScnt.Scnt = ""
			if err := c.callAppleAccount(ctx, &withoutScnt, "", http.MethodGet, "/account/manage/gs/ws/token", nil, &token); err == nil {
				loginState = withoutScnt
				markAppleAccountManageTokenTTL(&loginState, token.TimeOutInterval, time.Now())
			} else if err := c.callAppleAccount(ctx, &loginState, "", http.MethodGet, "/account/manage/gs/ws/token", nil, &token); err == nil {
				markAppleAccountManageTokenTTL(&loginState, token.TimeOutInterval, time.Now())
			}
		}
	}
	tokenScnt := strings.TrimSpace(loginState.Scnt)
	if err := c.loadAppleAccountManageAPIKey(ctx, &loginState); err == nil {
		markAppleAccountManageOK(&loginState)
		return loginState, nil
	}
	if err := c.warmAppleAccountPortal(ctx, &loginState); err != nil {
		return loginState, err
	}
	withoutScnt := loginState
	withoutScnt.Scnt = ""
	if err := c.callAppleAccount(ctx, &withoutScnt, "", http.MethodGet, "/account/manage/gs/ws/token", nil, &token); err == nil {
		markAppleAccountManageTokenTTL(&withoutScnt, token.TimeOutInterval, time.Now())
		loginState = withoutScnt
	} else if err := c.callAppleAccount(ctx, &loginState, "", http.MethodGet, "/account/manage/gs/ws/token", nil, &token); err != nil {
		if tokenScnt == "" {
			return loginState, err
		}
		loginState.Scnt = tokenScnt
		if retryErr := c.callAppleAccount(ctx, &loginState, "", http.MethodGet, "/account/manage/gs/ws/token", nil, &token); retryErr != nil {
			return loginState, err
		}
		markAppleAccountManageTokenTTL(&loginState, token.TimeOutInterval, time.Now())
	} else {
		markAppleAccountManageTokenTTL(&loginState, token.TimeOutInterval, time.Now())
	}
	if err := c.loadAppleAccountManageAPIKey(ctx, &loginState); err != nil {
		return loginState, err
	}
	markAppleAccountManageOK(&loginState)
	return loginState, nil
}

func appleAccountOperationKey(session ICloudSession, loginState LoginState) string {
	owner := firstNonEmpty(session.OwnerID, "global")
	identity := firstNonEmpty(session.AccountID, session.DSID, session.AppleID, loginState.SessionID, loginState.Scnt, loginState.APIKey, "default")
	return owner + ":" + identity
}

func acquireAppleAccountOperationGate(ctx context.Context, key string) (func(), error) {
	key = strings.TrimSpace(key)
	if key == "" {
		key = "global:default"
	}
	appleAccountOperationMu.Lock()
	gate := appleAccountOperationGates[key]
	if gate == nil {
		gate = make(chan struct{}, 1)
		appleAccountOperationGates[key] = gate
	}
	appleAccountOperationMu.Unlock()

	select {
	case gate <- struct{}{}:
		return func() { <-gate }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (c *ICloudClient) loadAppleAccountManageAPIKey(ctx context.Context, loginState *LoginState) error {
	var manage struct {
		APIKey string `json:"apiKey"`
	}
	if err := c.callAppleAccount(ctx, loginState, "", http.MethodGet, "/account/manage", nil, &manage); err != nil {
		return err
	}
	if apiKey := strings.TrimSpace(manage.APIKey); apiKey != "" {
		loginState.APIKey = apiKey
	}
	if strings.TrimSpace(loginState.APIKey) == "" {
		return errCode("apple_account_api_key_missing", "Apple Account 管理接口未返回 api_key，请重新完成 Apple Account 登录流程", true)
	}
	return nil
}

func (c *ICloudClient) warmAppleAccountPortal(ctx context.Context, loginState *LoginState) error {
	if _, err := c.callAppleAccountPortal(ctx, loginState, "/account/manage/section/privacy", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", false, "document", "navigate"); err != nil {
		return err
	}
	data, err := c.callAppleAccountPortal(ctx, loginState, "/bootstrap/portal", "application/json, text/plain, */*", true, "empty", "cors")
	if err != nil {
		return err
	}
	var portal struct {
		TimeOutInterval int `json:"timeOutInterval"`
	}
	if json.Unmarshal(data, &portal) == nil {
		markAppleAccountManageTokenTTL(loginState, portal.TimeOutInterval, time.Now())
	}
	return nil
}

func (c *ICloudClient) callAppleAccountPortal(ctx context.Context, loginState *LoginState, path, accept string, jsonContent bool, secFetchDest, secFetchMode string) ([]byte, error) {
	var data []byte
	err := retryAppleTransient(ctx, func() error {
		next, err := c.callAppleAccountPortalOnce(ctx, loginState, path, accept, jsonContent, secFetchDest, secFetchMode)
		if err != nil {
			return err
		}
		data = next
		return nil
	})
	return data, err
}

func (c *ICloudClient) callAppleAccountPortalOnce(ctx context.Context, loginState *LoginState, path, accept string, jsonContent bool, secFetchDest, secFetchMode string) ([]byte, error) {
	if loginState == nil {
		return nil, errCode("apple_account_session_missing", "当前登录态缺少 Apple Account 管理态，请重新协议登录", true)
	}
	base, err := url.Parse(strings.TrimRight(appleAccountPortalBaseForState(*loginState), "/") + "/")
	if err != nil {
		return nil, err
	}
	rel := &url.URL{Path: strings.TrimLeft(path, "/")}
	rawURL := base.ResolveReference(rel).String()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	userAgent := firstNonEmpty(loginState.UserAgent, appleAccountManageUserAgent)
	req.Header.Set("Accept", accept)
	if jsonContent {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Referer", strings.TrimRight(firstNonEmpty(loginState.Origin, appleAccountManageOrigin), "/")+"/")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept-Language", appleAccountManageLanguage+",en;q=0.9")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Set("Sec-Fetch-Mode", secFetchMode)
	req.Header.Set("Sec-Fetch-Dest", secFetchDest)
	req.Header.Set("Sec-CH-UA-Platform", appleAccountManagePlatform)
	req.Header.Set("Sec-CH-UA", `"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"`)
	req.Header.Set("Sec-CH-UA-Mobile", "?0")
	if cookie := cookieHeader(loginState.Cookies, rawURL); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if jsonContent {
		req.Header.Set("X-Apple-I-Request-Context", appleAccountManageRequestCtx)
		req.Header.Set("X-Apple-I-TimeZone", appleAccountManageTimeZone)
		req.Header.Set("X-Apple-I-FD-Client-Info", appleAccountFDClientInfo(userAgent))
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if os.Getenv("IPM_DEBUG_APPLE_ACCOUNT") == "1" {
		fmt.Fprintf(os.Stderr, "APPLE_ACCOUNT_PORTAL_DEBUG method=GET path=%s status=%d req_cookie_len=%d req_scnt=%s res_scnt=%s res_session=%s set_cookie=%d body=%q\n",
			path,
			resp.StatusCode,
			len(req.Header.Get("Cookie")),
			appleDebugFingerprint(req.Header.Get("scnt")),
			appleDebugFingerprint(resp.Header.Get("scnt")),
			appleDebugFingerprint(resp.Header.Get("X-Apple-ID-Session-Id")),
			len(resp.Cookies()),
			appleDebugBody(data),
		)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return data, appleAccountAPIError(resp.StatusCode, data, appleAccountRequestStage(http.MethodGet, path))
	}
	mergeSessionCookies(&loginState.Cookies, resp.Request.URL, resp.Cookies())
	updateAppleAccountLoginStateFromHeaders(loginState, resp.Header)
	return data, nil
}
