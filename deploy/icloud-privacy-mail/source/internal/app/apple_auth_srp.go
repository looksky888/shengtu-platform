package app

import (
	"context"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func (c *AppleAuthClient) authStart(ctx context.Context, session *appleAuthSession) error {
	frameTag := "auth-" + session.FrameID
	u, err := url.Parse(session.Endpoints.Auth + "/authorize/signin")
	if err != nil {
		return err
	}
	q := u.Query()
	q.Set("frame_id", frameTag)
	q.Set("skVersion", "7")
	q.Set("iframeId", frameTag)
	q.Set("client_id", session.ClientID)
	q.Set("redirect_uri", session.Endpoints.Home)
	q.Set("response_type", "code")
	q.Set("response_mode", "web_message")
	q.Set("state", frameTag)
	headers := map[string]string{"Accept": "*/*"}
	if session.isAppleAccountManage() {
		q.Set("authVersion", "8.0.2")
		headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
		headers["Referer"] = session.Endpoints.Home + "/"
		applyAppleAccountBrowserHints(headers)
		headers["Sec-Fetch-Dest"] = "iframe"
		headers["Sec-Fetch-Mode"] = "navigate"
		headers["Sec-Fetch-Site"] = "same-site"
	} else {
		q.Set("language", "zh_CN")
		q.Set("authVersion", "latest")
	}
	u.RawQuery = q.Encode()
	_, _, err = c.doWithTransientRetry(ctx, session, http.MethodGet, u.String(), headers, nil, nil, false)
	if err != nil {
		return err
	}
	if session.isAppleAccountManage() {
		session.rememberCompleteHashcashChallenge()
	}
	return nil
}

func (c *AppleAuthClient) authDeviceKeyChallenge(ctx context.Context, session *appleAuthSession) error {
	if !session.isAppleAccountManage() {
		return nil
	}
	body := map[string]bool{"passkeyAutofill": false}
	headers := session.srpHeaders()
	delete(headers, "scnt")
	delete(headers, "X-Apple-ID-Session-Id")
	delete(headers, "X-Apple-App-Id")
	_, _, err := c.doWithTransientRetry(ctx, session, http.MethodPost, session.Endpoints.Auth+"/verify/device/key/challenge", headers, body, nil, false)
	return err
}

func (c *AppleAuthClient) authFederate(ctx context.Context, session *appleAuthSession) error {
	u := session.Endpoints.Auth + "/federate?isRememberMeEnabled=true"
	body := map[string]any{"accountName": session.AppleID, "rememberMe": true}
	_, _, err := c.doWithTransientRetry(ctx, session, http.MethodPost, u, session.srpHeaders(), body, nil, false)
	return err
}

func (c *AppleAuthClient) authSRP(ctx context.Context, session *appleAuthSession, password string) (bool, error) {
	srp, err := newSRPClient()
	if err != nil {
		return false, err
	}
	var initResp appleSRPInitResponse
	initBody := map[string]any{
		"a":           base64.StdEncoding.EncodeToString(srp.ABytes()),
		"accountName": session.AppleID,
		"protocols":   []string{"s2k", "s2k_fo"},
	}
	if _, _, err := c.doWithTransientRetry(ctx, session, http.MethodPost, session.Endpoints.Auth+"/signin/init", session.srpHeaders(), initBody, &initResp, false); err != nil {
		return false, err
	}
	serverB, err := base64.StdEncoding.DecodeString(initResp.B)
	if err != nil {
		return false, fmt.Errorf("decode SRP B: %w", err)
	}
	salt, err := base64.StdEncoding.DecodeString(initResp.Salt)
	if err != nil {
		return false, fmt.Errorf("decode SRP salt: %w", err)
	}
	derived, err := deriveAppleSRPPassword(password, salt, initResp.Iteration, initResp.Protocol)
	if err != nil {
		return false, err
	}
	if err := srp.processChallenge([]byte(session.AppleID), derived, salt, serverB); err != nil {
		return false, err
	}
	completeBody := map[string]any{
		"accountName": session.AppleID,
		"m1":          base64.StdEncoding.EncodeToString(srp.M1),
		"m2":          base64.StdEncoding.EncodeToString(srp.M2),
		"c":           initResp.C,
		"rememberMe":  true,
	}
	if !session.isAppleAccountManage() {
		completeBody["trustTokens"] = []string{}
		if session.TrustToken != "" {
			completeBody["trustTokens"] = []string{session.TrustToken}
		}
	}
	headers := session.srpHeaders()
	if session.isAppleAccountManage() {
		bits, challenge := session.completeHashcashChallenge()
		hc, err := generateAppleHashcash(bits, challenge, time.Now())
		if err != nil {
			return false, err
		}
		headers["X-Apple-HC"] = hc
	}
	status, _, err := c.doWithTransientRetry(ctx, session, http.MethodPost, session.Endpoints.Auth+"/signin/complete?isRememberMeEnabled=true", headers, completeBody, nil, true)
	if status == http.StatusUnauthorized {
		return false, errCode("apple_credentials_invalid", "Apple ID 或密码错误，请检查后重新协议登录", false)
	}
	return status == http.StatusConflict, err
}

func generateAppleHashcash(bits int, challenge string, now time.Time) (string, error) {
	challenge = strings.TrimSpace(challenge)
	if bits <= 0 || challenge == "" {
		return "", errCode("apple_hc_missing", "Apple Account 缺少动态验证挑战，请重新协议登录", true)
	}
	if bits > appleHashcashMaxBits {
		return "", errCode("apple_hc_too_hard", "Apple Account 动态验证难度过高，请稍后重试", true)
	}
	prefix := fmt.Sprintf("1:%d:%s:%s::", bits, now.UTC().Format("20060102150405"), challenge)
	for counter := int64(0); counter < appleHashcashMaxAttempts; counter++ {
		value := prefix + strconv.FormatInt(counter, 36)
		sum := sha1.Sum([]byte(value))
		if leadingZeroBits(sum[:]) >= bits {
			return value, nil
		}
	}
	return "", errCode("apple_hc_failed", "Apple Account 动态验证生成失败，请稍后重试", true)
}

func leadingZeroBits(data []byte) int {
	total := 0
	for _, b := range data {
		for bit := 7; bit >= 0; bit-- {
			if b&(1<<bit) != 0 {
				return total
			}
			total++
		}
	}
	return total
}
