package app

import (
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const iCloudWebAuthUserCookie = "X-APPLE-WEBAUTH-USER"

func cookieHeader(cookies []SessionCookie, rawURL string) string {
	return cookieHeaderAt(cookies, rawURL, time.Now())
}

func cookieHeaderAt(cookies []SessionCookie, rawURL string, now time.Time) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	nowUnix := float64(now.Unix())
	type cookiePair struct {
		name  string
		value string
		order int
		index int
	}
	var pairs []cookiePair
	for i, cookie := range cookies {
		if cookie.Name == "" || cookie.Value == "" {
			continue
		}
		if cookie.Expires > 0 && cookie.Expires < nowUnix {
			continue
		}
		if !cookieDomainMatch(host, cookie.Domain) {
			continue
		}
		if cookie.Path != "" && !strings.HasPrefix(path, cookie.Path) {
			continue
		}
		pairs = append(pairs, cookiePair{
			name:  cookie.Name,
			value: cookie.Value,
			order: preferredICloudCookieOrder(cookie.Name),
			index: i,
		})
	}
	sort.SliceStable(pairs, func(i, j int) bool {
		if pairs[i].order != pairs[j].order {
			return pairs[i].order < pairs[j].order
		}
		return pairs[i].index < pairs[j].index
	})
	out := make([]string, 0, len(pairs))
	for _, pair := range pairs {
		out = append(out, pair.name+"="+pair.value)
	}
	return strings.Join(out, "; ")
}

func validateICloudWebRequestCookies(session ICloudSession, rawURL string, now time.Time) error {
	state, saved := iCloudWebLoginState(session)
	if !saved {
		return errCode("icloud_web_login_missing", "未保存旧接口登录态，请重新完成 iCloud Web 登录", true)
	}
	present, current := namedCookieValidity(state.Cookies, iCloudWebAuthUserCookie, now)
	if present && !current {
		return errCode("icloud_web_login_expired", "旧接口登录态已过期，请重新完成 iCloud Web 登录和双重认证", true)
	}
	if !present {
		return errCode("icloud_web_login_incomplete", "旧接口登录态不完整，缺少关键认证 Cookie，请重新完成 iCloud Web 登录", true)
	}
	if !cookieHeaderContains(cookieHeaderAt(state.Cookies, rawURL, now), iCloudWebAuthUserCookie) {
		return errCode("icloud_web_login_invalid", "旧接口关键认证 Cookie 与当前 iCloud 服务地址不匹配，请重新登录", true)
	}
	return nil
}

func namedCookieValidity(cookies []SessionCookie, name string, now time.Time) (present, current bool) {
	nowUnix := float64(now.Unix())
	for _, cookie := range cookies {
		if !strings.EqualFold(strings.TrimSpace(cookie.Name), name) || strings.TrimSpace(cookie.Value) == "" {
			continue
		}
		present = true
		if cookie.Expires <= 0 || cookie.Expires >= nowUnix {
			current = true
		}
	}
	return present, current
}

func cookieHeaderContains(header, name string) bool {
	for _, part := range strings.Split(header, ";") {
		pair := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(pair) == 2 && strings.EqualFold(pair[0], name) {
			return true
		}
	}
	return false
}

func mergeSessionCookies(cookies *[]SessionCookie, requestURL *url.URL, setCookies []*http.Cookie) {
	if cookies == nil {
		return
	}
	for _, c := range setCookies {
		domain := strings.TrimSpace(c.Domain)
		if domain == "" && requestURL != nil {
			domain = requestURL.Hostname()
		}
		path := c.Path
		if path == "" {
			path = "/"
		}
		next := SessionCookie{
			Name:     c.Name,
			Value:    c.Value,
			Domain:   domain,
			Path:     path,
			Secure:   c.Secure,
			HTTPOnly: c.HttpOnly,
		}
		if !c.Expires.IsZero() {
			next.Expires = float64(c.Expires.Unix())
		}
		replaced := false
		for i, old := range *cookies {
			if old.Name == next.Name && strings.EqualFold(strings.TrimPrefix(old.Domain, "."), strings.TrimPrefix(next.Domain, ".")) && old.Path == next.Path {
				if next.Value == "" {
					*cookies = append((*cookies)[:i], (*cookies)[i+1:]...)
				} else {
					(*cookies)[i] = next
				}
				replaced = true
				break
			}
		}
		if !replaced && next.Value != "" {
			*cookies = append(*cookies, next)
		}
	}
}

func preferredICloudCookieOrder(name string) int {
	for i, candidate := range preferredICloudCookies {
		if candidate == "X_APPLE_WEB_KB-" && strings.HasPrefix(name, candidate) {
			return i
		}
		if candidate != "X_APPLE_WEB_KB-" && name == candidate {
			return i
		}
	}
	return len(preferredICloudCookies) + 100
}

var preferredICloudCookies = []string{
	"X-APPLE-UNIQUE-CLIENT-ID",
	"X-APPLE-WEBAUTH-USER",
	"X_APPLE_WEB_KB-",
	"X-Apple-GCBD-Cookie",
	"X-APPLE-WEBAUTH-HSA-TRUST",
	"X-APPLE-WEBAUTH-PCS-Documents",
	"X-APPLE-WEBAUTH-PCS-Photos",
	"X-APPLE-WEBAUTH-PCS-Cloudkit",
	"X-APPLE-WEBAUTH-PCS-Safari",
	"X-APPLE-WEBAUTH-PCS-Mail",
	"X-APPLE-WEBAUTH-PCS-Notes",
	"X-APPLE-WEBAUTH-PCS-News",
	"X-APPLE-WEBAUTH-PCS-Sharing",
	"X-APPLE-WEBAUTH-LOGIN",
	"X-APPLE-DS-WEB-SESSION-TOKEN",
	"X-APPLE-WEB-ID",
	"X-APPLE-WEBAUTH-VALIDATE",
	"X-APPLE-WEBAUTH-TOKEN",
}

func cookieDomainMatch(host, domain string) bool {
	domain = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(domain)), ".")
	if domain == "" {
		return false
	}
	return host == domain || strings.HasSuffix(host, "."+domain)
}
