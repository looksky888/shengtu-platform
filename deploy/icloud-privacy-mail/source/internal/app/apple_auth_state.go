package app

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func (s *appleAuthSession) extract(resp *http.Response) {
	s.mergeCookies(resp.Request.URL, resp.Cookies())
	if v := resp.Header.Get("X-Apple-ID-Account-Country"); v != "" {
		s.AccountCountry = v
	}
	if v := resp.Header.Get("X-Apple-ID-Session-Id"); v != "" {
		s.SessionID = v
	}
	if v := resp.Header.Get("X-Apple-Session-Token"); v != "" {
		s.SessionToken = v
	}
	if v := resp.Header.Get("X-Apple-TwoSV-Trust-Token"); v != "" {
		s.TrustToken = v
	}
	if v := resp.Header.Get("scnt"); v != "" {
		s.Scnt = v
	}
	if v := resp.Header.Get("X-Apple-Auth-Attributes"); v != "" {
		s.AuthAttributes = v
	}
	if v := strings.TrimSpace(resp.Header.Get("X-Apple-HC-Bits")); v != "" {
		if bits, err := strconv.Atoi(v); err == nil && bits > 0 {
			s.HCBits = bits
		}
	}
	if v := strings.TrimSpace(resp.Header.Get("X-Apple-HC-Challenge")); v != "" {
		s.HCChallenge = v
	}
}

func (s *appleAuthSession) rememberCompleteHashcashChallenge() {
	if s == nil || s.CompleteHCBits > 0 || s.CompleteHCChallenge != "" {
		return
	}
	if s.HCBits > 0 && strings.TrimSpace(s.HCChallenge) != "" {
		s.CompleteHCBits = s.HCBits
		s.CompleteHCChallenge = s.HCChallenge
	}
}

func (s *appleAuthSession) completeHashcashChallenge() (int, string) {
	if s == nil {
		return 0, ""
	}
	if s.CompleteHCBits > 0 && strings.TrimSpace(s.CompleteHCChallenge) != "" {
		return s.CompleteHCBits, s.CompleteHCChallenge
	}
	return s.HCBits, s.HCChallenge
}

func (s *appleAuthSession) switchHost(host string) bool {
	next := appleAuthEndpointsForHost(host)
	if next.Host == "" || next.Host == s.Endpoints.Host {
		return false
	}
	s.Endpoints = next
	return true
}

func (s *appleAuthSession) redirectForAccountCountry() (appleDomainRedirectError, bool) {
	host := appleHostForAccountCountry(s.AccountCountry)
	if host == "" {
		return appleDomainRedirectError{}, false
	}
	next := appleAuthEndpointsForHost(host)
	if next.Host == "" || next.Host == s.Endpoints.Host {
		return appleDomainRedirectError{}, false
	}
	domain := "iCloud.com"
	if strings.Contains(next.Host, "icloud.com.cn") {
		domain = "iCloud.com.cn"
	}
	return appleDomainRedirectError{DomainToUse: domain, Host: next.Host}, true
}

func (s *appleAuthSession) mergeCookies(requestURL *url.URL, cookies []*http.Cookie) {
	mergeSessionCookies(&s.Cookies, requestURL, cookies)
}

func (s *appleAuthSession) cloneCookies() []SessionCookie {
	return append([]SessionCookie(nil), s.Cookies...)
}
