package app

import (
	"bytes"
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

func (c *ICloudClient) callAppleAccount(ctx context.Context, loginState *LoginState, apiKey, method, path string, body any, result any) error {
	_, err := c.callAppleAccountRaw(ctx, loginState, apiKey, method, path, body, result)
	return err
}

type appleAccountRawResponse struct {
	StatusCode int
	Body       []byte
}

func (c *ICloudClient) fetchAppleAccountManageTokenScnt(ctx context.Context, loginState LoginState, result any) (string, error) {
	var scnt string
	err := retryAppleTransient(ctx, func() error {
		next, err := c.fetchAppleAccountManageTokenScntOnce(ctx, loginState, result)
		if strings.TrimSpace(next) != "" {
			scnt = next
		}
		if err != nil {
			return err
		}
		return nil
	})
	return scnt, err
}

func (c *ICloudClient) fetchAppleAccountManageTokenScntOnce(ctx context.Context, loginState LoginState, result any) (string, error) {
	base, err := url.Parse(strings.TrimRight(appleAccountManageBaseForState(loginState), "/") + "/")
	if err != nil {
		return "", err
	}
	rawURL := base.ResolveReference(&url.URL{Path: "account/manage/gs/ws/token"}).String()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	origin := strings.TrimRight(firstNonEmpty(loginState.Origin, appleAccountManageOriginForHost(loginState.Host), appleAccountManageOrigin), "/")
	userAgent := firstNonEmpty(loginState.UserAgent, appleAccountManageUserAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", origin)
	req.Header.Set("Referer", origin+"/")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept-Language", appleAccountManageLanguage+",en;q=0.9")
	req.Header.Set("Sec-Fetch-Site", "same-site")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-CH-UA-Platform", appleAccountManagePlatform)
	req.Header.Set("Sec-CH-UA", `"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"`)
	req.Header.Set("Sec-CH-UA-Mobile", "?0")
	req.Header.Set("X-Apple-I-FD-Client-Info", appleAccountFDClientInfo(userAgent))
	req.Header.Set("X-Apple-I-Request-Context", appleAccountManageRequestCtx)
	req.Header.Set("X-Apple-I-TimeZone", appleAccountManageTimeZone)
	if cookie := cookieHeader(loginState.Cookies, rawURL); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	scnt := strings.TrimSpace(resp.Header.Get("scnt"))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return scnt, appleAccountAPIError(resp.StatusCode, data, appleAccountRequestStage(http.MethodGet, "/account/manage/gs/ws/token"))
	}
	if result != nil && len(bytes.TrimSpace(data)) > 0 {
		if err := json.Unmarshal(data, result); err != nil {
			return scnt, errCode("apple_account_bad_response", "Apple Account 返回无法解析；"+appleAccountResponseDetail(appleAccountRequestStage(http.MethodGet, "/account/manage/gs/ws/token"), data), true)
		}
	}
	return scnt, nil
}

func (c *ICloudClient) callAppleAccountRaw(ctx context.Context, loginState *LoginState, apiKey, method, path string, body any, result any) (appleAccountRawResponse, error) {
	var raw appleAccountRawResponse
	err := retryAppleTransient(ctx, func() error {
		next, err := c.callAppleAccountRawOnce(ctx, loginState, apiKey, method, path, body, result)
		if err != nil {
			return err
		}
		raw = next
		return nil
	})
	return raw, err
}

func (c *ICloudClient) callAppleAccountRawOnce(ctx context.Context, loginState *LoginState, apiKey, method, path string, body any, result any) (appleAccountRawResponse, error) {
	if loginState == nil {
		return appleAccountRawResponse{}, errCode("apple_account_session_missing", "当前登录态缺少 Apple Account 管理态，请重新协议登录", true)
	}
	base, err := url.Parse(strings.TrimRight(appleAccountManageBaseForState(*loginState), "/") + "/")
	if err != nil {
		return appleAccountRawResponse{}, err
	}
	rel := &url.URL{Path: strings.TrimLeft(path, "/")}
	rawURL := base.ResolveReference(rel).String()

	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return appleAccountRawResponse{}, err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return appleAccountRawResponse{}, err
	}
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Content-Type", "application/json")
	origin := strings.TrimRight(firstNonEmpty(loginState.Origin, appleAccountManageOriginForHost(loginState.Host), appleAccountManageOrigin), "/")
	userAgent := firstNonEmpty(loginState.UserAgent, appleAccountManageUserAgent)
	req.Header.Set("Origin", origin)
	req.Header.Set("Referer", origin+"/")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept-Language", appleAccountManageLanguage+",en;q=0.9")
	req.Header.Set("Sec-Fetch-Site", "same-site")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-CH-UA-Platform", appleAccountManagePlatform)
	req.Header.Set("Sec-CH-UA", `"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"`)
	req.Header.Set("Sec-CH-UA-Mobile", "?0")
	if scnt := strings.TrimSpace(loginState.Scnt); scnt != "" {
		req.Header.Set("scnt", scnt)
	}
	if apiKey = strings.TrimSpace(apiKey); apiKey != "" {
		req.Header.Set("X-Apple-Api-Key", apiKey)
	}
	req.Header.Set("X-Apple-I-FD-Client-Info", appleAccountFDClientInfo(userAgent))
	req.Header.Set("X-Apple-I-Request-Context", appleAccountManageRequestCtx)
	req.Header.Set("X-Apple-I-TimeZone", appleAccountManageTimeZone)
	if cookie := cookieHeader(loginState.Cookies, rawURL); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return appleAccountRawResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	raw := appleAccountRawResponse{StatusCode: resp.StatusCode, Body: data}
	if err != nil {
		return raw, err
	}
	if os.Getenv("IPM_DEBUG_APPLE_ACCOUNT") == "1" {
		fmt.Fprintf(os.Stderr, "APPLE_ACCOUNT_DEBUG method=%s path=%s status=%d req_cookie_len=%d req_scnt=%s res_scnt=%s res_session=%s set_cookie=%d body=%q\n",
			method,
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
		if os.Getenv("IPM_DEBUG_APPLE_ACCOUNT") == "1" {
			fmt.Fprintf(os.Stderr, "APPLE_ACCOUNT_DEBUG method=%s path=%s status=%d body=%q\n", method, path, resp.StatusCode, appleDebugBody(data))
		}
		return raw, appleAccountAPIError(resp.StatusCode, data, appleAccountRequestStage(method, path))
	}
	mergeSessionCookies(&loginState.Cookies, resp.Request.URL, resp.Cookies())
	updateAppleAccountLoginStateFromHeaders(loginState, resp.Header)
	if result != nil && len(bytes.TrimSpace(data)) > 0 {
		if err := json.Unmarshal(data, result); err != nil {
			return raw, errCode("apple_account_bad_response", "Apple Account 返回无法解析；"+appleAccountRawResponseDetail(appleAccountRequestStage(method, path), raw), true)
		}
	}
	return raw, nil
}

func updateAppleAccountLoginStateFromHeaders(loginState *LoginState, header http.Header) {
	if loginState == nil {
		return
	}
	if scnt := strings.TrimSpace(header.Get("scnt")); scnt != "" {
		loginState.Scnt = scnt
	}
	if sessionID := strings.TrimSpace(header.Get("X-Apple-ID-Session-Id")); sessionID != "" {
		loginState.SessionID = sessionID
	}
	if token := strings.TrimSpace(firstNonEmpty(header.Get("X-Apple-I-DA-Token"), header.Get("X-Apple-I-Cont-X-Apple-I-DA-Token"))); token != "" {
		loginState.DataAccessToken = token
	}
	loginState.SavedAt = time.Now()
}
