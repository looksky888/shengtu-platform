package backend

import (
	"fmt"
	"regexp"
	"strings"

	"chatgpt2api/internal/util"
)

func (c *Client) buildFingerprint() map[string]string {
	account := map[string]any{}
	if c.AccessToken != "" && c.lookup != nil {
		account = c.lookup.GetAccount(c.AccessToken)
	}
	fp := map[string]string{}
	if raw, ok := account["fp"].(map[string]any); ok {
		for key, value := range raw {
			if text := util.Clean(value); text != "" {
				fp[strings.ToLower(key)] = text
			}
		}
	}
	for _, key := range []string{"user-agent", "impersonate", "oai-device-id", "oai-session-id", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"} {
		if value := util.Clean(account[key]); value != "" {
			fp[key] = value
		}
	}
	defaults := map[string]string{
		"user-agent":         browserUserAgent,
		"impersonate":        browserImpersonationProfile,
		"oai-device-id":      util.NewUUID(),
		"oai-session-id":     util.NewUUID(),
		"sec-ch-ua-mobile":   browserSecCHUAMobile,
		"sec-ch-ua-platform": browserSecCHUAPlatform,
	}
	for key, value := range defaults {
		if fp[key] == "" {
			fp[key] = value
		}
	}
	return fp
}

func (c *Client) applyBrowserFingerprint() {
	if c.fp == nil {
		c.fp = map[string]string{}
	}
	setDefault := func(key, value string) {
		if strings.TrimSpace(c.fp[key]) == "" {
			c.fp[key] = value
		}
	}
	setDefault("impersonate", browserImpersonationProfile)
	setDefault("user-agent", browserUserAgent)
	setDefault("sec-ch-ua-mobile", browserSecCHUAMobile)
	setDefault("sec-ch-ua-platform", browserSecCHUAPlatform)
	metadata := browserMetadataFromUserAgent(c.fp["user-agent"])
	setDefault("sec-ch-ua", metadata.secCHUA)
	setDefault("sec-ch-ua-arch", browserSecCHUAArch)
	setDefault("sec-ch-ua-bitness", browserSecCHUABitness)
	setDefault("sec-ch-ua-full-version", quoteHeaderValue(metadata.fullVersion))
	setDefault("sec-ch-ua-full-version-list", metadata.fullVersionList)
	setDefault("sec-ch-ua-platform-version", browserSecCHUAPlatformVersion)
}

type browserHeaderMetadata struct {
	secCHUA         string
	fullVersion     string
	fullVersionList string
}

func browserMetadataFromUserAgent(userAgent string) browserHeaderMetadata {
	chromeVersion := regexpVersion(userAgent, `Chrome/([0-9]+(?:\.[0-9]+){0,3})`)
	edgeVersion := regexpVersion(userAgent, `Edg[A-Z]*/([0-9]+(?:\.[0-9]+){0,3})`)
	if edgeVersion != "" {
		edgeMajor := majorVersion(edgeVersion)
		chromiumVersion := firstNonEmpty(chromeVersion, edgeVersion)
		chromiumMajor := majorVersion(chromiumVersion)
		return browserHeaderMetadata{
			secCHUA:         fmt.Sprintf(`"Microsoft Edge";v="%s", "Chromium";v="%s", "Not A(Brand";v="24"`, edgeMajor, chromiumMajor),
			fullVersion:     edgeVersion,
			fullVersionList: fmt.Sprintf(`"Microsoft Edge";v="%s", "Chromium";v="%s", "Not A(Brand";v="24.0.0.0"`, normalizeFullVersion(edgeVersion), normalizeFullVersion(chromiumVersion)),
		}
	}
	if chromeVersion != "" {
		major := majorVersion(chromeVersion)
		full := normalizeFullVersion(chromeVersion)
		return browserHeaderMetadata{
			secCHUA:         fmt.Sprintf(`"Not:A-Brand";v="99", "Google Chrome";v="%s", "Chromium";v="%s"`, major, major),
			fullVersion:     full,
			fullVersionList: fmt.Sprintf(`"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="%s", "Chromium";v="%s"`, full, full),
		}
	}
	return browserHeaderMetadata{
		secCHUA:         browserSecCHUA,
		fullVersion:     strings.Trim(browserSecCHUAFullVersion, `"`),
		fullVersionList: browserSecCHUAFullVersionList,
	}
}

func regexpVersion(value, pattern string) string {
	match := regexp.MustCompile(pattern).FindStringSubmatch(value)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

func majorVersion(version string) string {
	if before, _, ok := strings.Cut(version, "."); ok {
		return before
	}
	return version
}

func normalizeFullVersion(version string) string {
	version = strings.TrimSpace(version)
	if version == "" {
		return strings.Trim(browserSecCHUAFullVersion, `"`)
	}
	parts := strings.Split(version, ".")
	for len(parts) < 4 {
		parts = append(parts, "0")
	}
	return strings.Join(parts[:4], ".")
}

func quoteHeaderValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = strings.Trim(browserSecCHUAFullVersion, `"`)
	}
	if strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) {
		return value
	}
	return `"` + value + `"`
}
