package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func (c *AppleAuthClient) requestTrustedDeviceCode(ctx context.Context, session *appleAuthSession) error {
	_, _, err := c.do(ctx, session, http.MethodPut, session.Endpoints.Auth+"/verify/trusteddevice/securitycode", session.twoFactorHeaders(), nil, nil, false)
	return err
}

func (c *AppleAuthClient) requestPhoneSecurityCode(ctx context.Context, session *appleAuthSession, phoneNumber json.RawMessage) error {
	phone, err := appleAccountPhoneNumberPayload(appleAccountFallbackPhoneNumber(phoneNumber, session.TwoFactorPhone), false)
	if err != nil {
		return err
	}
	body := map[string]any{
		"phoneNumber": phone,
		"mode":        "sms",
	}
	_, _, err = c.do(ctx, session, http.MethodPut, session.Endpoints.Auth+"/verify/phone", session.twoFactorHeaders(), body, nil, false)
	return err
}

func (c *AppleAuthClient) refreshAuthState(ctx context.Context, session *appleAuthSession) error {
	headers := session.authHeaders()
	headers["Accept"] = "text/html"
	headers["Referer"] = strings.TrimSuffix(session.Endpoints.Auth, "/appleauth/auth") + "/"
	headers["Sec-Fetch-Dest"] = "empty"
	headers["Sec-Fetch-Mode"] = "cors"
	headers["Sec-Fetch-Site"] = "same-origin"
	delete(headers, "Origin")
	delete(headers, "X-Apple-App-Id")
	_, data, err := c.do(ctx, session, http.MethodGet, session.Endpoints.Auth, headers, nil, nil, false)
	if err == nil {
		session.rememberTwoFactorPhoneNumber(data)
	}
	return err
}

func (c *AppleAuthClient) primeAppleAccountManageState(ctx context.Context, session *appleAuthSession) error {
	if session == nil || !session.isAppleAccountManage() {
		return nil
	}
	state := LoginState{
		Kind:      LoginStateAppleAccount,
		Host:      "appleid.apple.com",
		Origin:    appleAccountManageOrigin,
		UserAgent: firstNonEmpty(session.UserAgent, appleAccountManageUserAgent),
	}
	client := &ICloudClient{client: c.httpClient}
	if err := client.warmAppleAccountPortal(ctx, &state); err != nil {
		return err
	}
	var token struct {
		TimeOutInterval int `json:"timeOutInterval"`
	}
	tokenState := state
	tokenState.Scnt = ""
	scnt, err := client.fetchAppleAccountManageTokenScnt(ctx, tokenState, &token)
	if err != nil {
		if strings.TrimSpace(scnt) == "" {
			return err
		}
	}
	if scnt := strings.TrimSpace(scnt); scnt != "" {
		session.ManageScnt = scnt
	}
	return nil
}

func (c *AppleAuthClient) validateTrustedDeviceCode(ctx context.Context, session *appleAuthSession, code string) error {
	body := map[string]any{"securityCode": map[string]string{"code": code}}
	_, _, err := c.do(ctx, session, http.MethodPost, session.Endpoints.Auth+"/verify/trusteddevice/securitycode", session.twoFactorHeaders(), body, nil, false)
	if err != nil {
		var redirect appleDomainRedirectError
		if errors.As(err, &redirect) {
			return err
		}
		return errCode("apple_2fa_failed", "Apple 2FA 验证失败："+err.Error(), true)
	}
	return nil
}

func (c *AppleAuthClient) validatePhoneSecurityCode(ctx context.Context, session *appleAuthSession, code string, phoneNumber json.RawMessage) error {
	phone, err := appleAccountPhoneNumberPayload(appleAccountFallbackPhoneNumber(phoneNumber, session.TwoFactorPhone), true)
	if err != nil {
		return err
	}
	body := map[string]any{
		"phoneNumber":  phone,
		"securityCode": map[string]string{"code": code},
		"mode":         "sms",
	}
	_, _, err = c.do(ctx, session, http.MethodPost, session.Endpoints.Auth+"/verify/phone/securitycode", session.twoFactorHeaders(), body, nil, false)
	if err != nil {
		return errCode("apple_2fa_failed", "Apple 短信 2FA 验证失败："+err.Error(), true)
	}
	return nil
}

func appleAccountFallbackPhoneNumber(phoneNumber json.RawMessage, fallbacks ...json.RawMessage) json.RawMessage {
	phoneNumber = bytes.TrimSpace(phoneNumber)
	if len(phoneNumber) > 0 && string(phoneNumber) != "null" {
		return phoneNumber
	}
	for _, fallback := range fallbacks {
		fallback = bytes.TrimSpace(fallback)
		if len(fallback) > 0 && string(fallback) != "null" {
			return fallback
		}
	}
	return json.RawMessage(`{"id":1,"nonFTEU":true}`)
}

func appleAccountPhoneNumberPayload(phoneNumber json.RawMessage, includeNonFTEU bool) (map[string]any, error) {
	var phone map[string]any
	if err := json.Unmarshal(phoneNumber, &phone); err != nil {
		return nil, errCode("invalid_phone_number_payload", "短信验证码缺少有效 phoneNumber 参数", false)
	}
	if _, ok := phone["id"]; !ok {
		return nil, errCode("invalid_phone_number_payload", "短信验证码缺少有效 phoneNumber 参数", false)
	}
	if !includeNonFTEU {
		delete(phone, "nonFTEU")
	}
	return phone, nil
}

func (s *appleAuthSession) rememberTwoFactorPhoneNumber(data []byte) {
	if s == nil || len(bytes.TrimSpace(s.TwoFactorPhone)) > 0 {
		return
	}
	payload := extractAppleAppConfigJSON(data)
	if len(payload) == 0 {
		payload = bytes.TrimSpace(data)
	}
	var root any
	if err := json.Unmarshal(payload, &root); err != nil {
		return
	}
	if phone, ok := firstApplePhoneNumber(root, 0); ok {
		if data, err := json.Marshal(phone); err == nil {
			s.TwoFactorPhone = data
		}
	}
}

func extractAppleAppConfigJSON(data []byte) []byte {
	text := string(data)
	for _, marker := range []string{`id="app_config"`, `id='app_config'`} {
		idx := strings.Index(text, marker)
		if idx < 0 {
			continue
		}
		open := strings.Index(text[idx:], ">")
		if open < 0 {
			continue
		}
		start := idx + open + 1
		end := strings.Index(text[start:], "</script>")
		if end < 0 {
			continue
		}
		return []byte(strings.TrimSpace(text[start : start+end]))
	}
	return nil
}

func firstApplePhoneNumber(value any, depth int) (map[string]any, bool) {
	if depth > 16 {
		return nil, false
	}
	switch v := value.(type) {
	case map[string]any:
		if numbers, ok := v["trustedPhoneNumbers"].([]any); ok {
			for _, item := range numbers {
				if phone, ok := normalizeApplePhoneNumber(item); ok {
					return phone, true
				}
			}
		}
		if phone, ok := normalizeApplePhoneNumber(v["phoneNumber"]); ok {
			return phone, true
		}
		for _, item := range v {
			if phone, ok := firstApplePhoneNumber(item, depth+1); ok {
				return phone, true
			}
		}
	case []any:
		for _, item := range v {
			if phone, ok := firstApplePhoneNumber(item, depth+1); ok {
				return phone, true
			}
		}
	}
	return nil, false
}

func normalizeApplePhoneNumber(value any) (map[string]any, bool) {
	phone, ok := value.(map[string]any)
	if !ok {
		return nil, false
	}
	id, ok := phone["id"]
	if !ok {
		return nil, false
	}
	out := map[string]any{"id": id}
	if nonFTEU, ok := phone["nonFTEU"]; ok {
		out["nonFTEU"] = nonFTEU
	}
	return out, true
}
