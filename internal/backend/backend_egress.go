package backend

import (
	"strings"

	"chatgpt2api/internal/util"
)

// accountEgress resolves once per backend client so the upstream HTTP client,
// Sentinel browser context and payload timezone cannot drift during an attempt.
func (c *Client) accountEgress() (string, string) {
	proxyURL := ""
	if c.proxy != nil {
		proxyURL = c.proxy.ProxyURL()
	}
	if c.lookup == nil || strings.TrimSpace(c.AccessToken) == "" {
		return proxyURL, ""
	}
	account := c.lookup.GetAccount(c.AccessToken)
	if value := util.Clean(account["proxy_url"]); value != "" {
		proxyURL = value
	}
	return proxyURL, util.Clean(account["proxy_timezone"])
}
