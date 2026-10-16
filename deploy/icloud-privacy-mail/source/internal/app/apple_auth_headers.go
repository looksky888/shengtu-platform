package app

import (
	"strings"
)

func (s *appleAuthSession) srpHeaders() map[string]string {
	frameTag := "auth-" + s.FrameID
	origin := strings.TrimSuffix(s.Endpoints.Auth, "/appleauth/auth")
	userAgent := firstNonEmpty(s.UserAgent, appleAuthUserAgent)
	headers := map[string]string{
		"Accept":                           "application/json",
		"Content-Type":                     "application/json",
		"Origin":                           origin,
		"Referer":                          origin + "/",
		"X-Apple-Widget-Key":               s.ClientID,
		"X-Apple-OAuth-Client-Id":          s.ClientID,
		"X-Apple-OAuth-Client-Type":        "firstPartyAuth",
		"X-Apple-OAuth-Redirect-URI":       s.Endpoints.Home,
		"X-Apple-OAuth-Require-Grant-Code": "true",
		"X-Apple-OAuth-Response-Mode":      "web_message",
		"X-Apple-OAuth-Response-Type":      "code",
		"X-Apple-OAuth-State":              frameTag,
		"X-Apple-Frame-Id":                 frameTag,
		"X-Requested-With":                 "XMLHttpRequest",
		"X-Apple-Mandate-Security-Upgrade": "0",
		"X-Apple-I-Require-UE":             "true",
		"X-Apple-I-FD-Client-Info":         `{"U":"` + userAgent + `","L":"zh-CN","Z":"GMT+08:00","V":"1.1","F":""}`,
	}
	if s.isAppleAccountManage() {
		headers["Accept"] = "application/json, text/javascript, */*; q=0.01"
		headers["X-Apple-I-FD-Client-Info"] = appleAccountFDClientInfo(userAgent)
		applyAppleAccountBrowserHints(headers)
		headers["Sec-Fetch-Dest"] = "empty"
		headers["Sec-Fetch-Mode"] = "cors"
		headers["Sec-Fetch-Site"] = "same-origin"
		delete(headers, "X-Apple-OAuth-Require-Grant-Code")
		delete(headers, "X-Apple-Mandate-Security-Upgrade")
		delete(headers, "X-Apple-I-Require-UE")
	}
	if s.AuthAttributes != "" {
		headers["X-Apple-Auth-Attributes"] = s.AuthAttributes
	}
	if s.Scnt != "" {
		headers["scnt"] = s.Scnt
	}
	if s.SessionID != "" {
		headers["X-Apple-ID-Session-Id"] = s.SessionID
	}
	if s.SessionToken != "" {
		headers["X-Apple-Session-Token"] = s.SessionToken
	}
	if s.isAppleAccountManage() {
		headers["X-Apple-Domain-Id"] = "11"
		headers["X-Apple-Privacy-Consent"] = "true"
		headers["X-Apple-Privacy-Consent-Accepted"] = "true"
	}
	return headers
}

func (s *appleAuthSession) authHeaders() map[string]string {
	return s.srpHeaders()
}

func (s *appleAuthSession) twoFactorHeaders() map[string]string {
	headers := s.authHeaders()
	if s.isAppleAccountManage() {
		headers["Accept"] = "application/json, text/plain, */*"
		headers["X-Apple-App-Id"] = s.ClientID
		delete(headers, "X-Requested-With")
	}
	return headers
}

func applyAppleAccountBrowserHints(headers map[string]string) {
	headers["Accept-Language"] = appleAccountManageLanguage + ",en;q=0.9"
	headers["Sec-CH-UA"] = `"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"`
	headers["Sec-CH-UA-Mobile"] = "?0"
	headers["Sec-CH-UA-Platform"] = appleAccountManagePlatform
}

func (s *appleAuthSession) isAppleAccountManage() bool {
	if s == nil {
		return false
	}
	return strings.EqualFold(strings.TrimRight(s.Endpoints.Home, "/"), "https://account.apple.com")
}

func (s *appleAuthSession) commonHeaders(overwrite map[string]string) map[string]string {
	userAgent := firstNonEmpty(s.UserAgent, appleAuthUserAgent)
	headers := map[string]string{
		"Accept":       "application/json",
		"Content-Type": "application/json",
		"Origin":       s.Endpoints.Home,
		"Referer":      s.Endpoints.Home + "/",
		"User-Agent":   userAgent,
	}
	for key, value := range overwrite {
		headers[key] = value
	}
	return headers
}
