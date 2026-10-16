package app

import (
	"bytes"
	"encoding/json"
	"strings"
)

func appleAuthEndpointsForHost(host string) appleAuthEndpoints {
	host = strings.ToLower(strings.TrimSpace(host))
	if strings.Contains(host, "icloud.com.cn") {
		return appleAuthEndpoints{
			Home:  "https://www.icloud.com.cn",
			Setup: "https://setup.icloud.com.cn/setup/ws/1",
			Auth:  "https://idmsa.apple.com.cn/appleauth/auth",
			Host:  "www.icloud.com.cn",
		}
	}
	return appleAuthEndpoints{
		Home:  "https://www.icloud.com",
		Setup: "https://setup.icloud.com/setup/ws/1",
		Auth:  "https://idmsa.apple.com/appleauth/auth",
		Host:  "www.icloud.com",
	}
}

func appleAccountManageAuthEndpoints() appleAuthEndpoints {
	return appleAuthEndpoints{
		Home: "https://account.apple.com",
		Auth: "https://idmsa.apple.com/appleauth/auth",
		Host: "appleid.apple.com",
	}
}

func appleDomainToHost(domain string) string {
	domain = strings.ToLower(strings.TrimSpace(domain))
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimPrefix(domain, "www.")
	domain = strings.TrimSuffix(domain, "/")
	if strings.Contains(domain, "icloud.com.cn") {
		return "www.icloud.com.cn"
	}
	if strings.Contains(domain, "icloud.com") {
		return "www.icloud.com"
	}
	return ""
}

func appleHostForAccountCountry(country string) string {
	country = strings.ToUpper(strings.TrimSpace(country))
	if country == "" {
		return ""
	}
	if country == "CHN" || country == "CN" {
		return "www.icloud.com.cn"
	}
	return "www.icloud.com"
}

func parseAppleDomainRedirect(status int, data []byte) (appleDomainRedirectError, bool) {
	if status < 300 || status >= 400 {
		return appleDomainRedirectError{}, false
	}
	var payload struct {
		DomainToUse string `json:"domainToUse"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(data), &payload); err != nil {
		return appleDomainRedirectError{}, false
	}
	host := appleDomainToHost(payload.DomainToUse)
	if host == "" {
		return appleDomainRedirectError{}, false
	}
	return appleDomainRedirectError{DomainToUse: payload.DomainToUse, Host: host}, true
}
