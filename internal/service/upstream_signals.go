package service

import (
	"strconv"
	"strings"
)

// Shared upstream error signals used by account disposal and image-task user messaging.
//
// Priority for pool disposal (ClassifyAccountFailure) is not "first rule wins for all
// Is* helpers". Rules are tagged by kind; Is* helpers match any rule of that kind.
// Classify uses: dead_token → rate/cf (temporary) → network/timeout/gateway (unknown)
// with event-specific 401 handling layered on top.
//
// When adding phrases: put them in the matching kind table below so pool policy and
// UI classification cannot drift independently.

func signalText(message string) string {
	return strings.ToLower(strings.TrimSpace(message))
}

// upstreamSignalKind classifies a matched phrase set.
type upstreamSignalKind string

const (
	signalKindDeadToken  upstreamSignalKind = "dead_token"
	signalKindCloudflare upstreamSignalKind = "cloudflare"
	// HTTP 429 / rate_limit phrases — UI "upstream_rate_limited" (before usage_limit rule).
	signalKindRateLimit upstreamSignalKind = "rate_limit"
	// Account quota / generation cap — temporary for pool; separate so UI can map to usage_limit.
	signalKindAccountQuota upstreamSignalKind = "account_quota"
	signalKindTimeout      upstreamSignalKind = "timeout"
	signalKindGateway      upstreamSignalKind = "gateway"
	signalKindNetworkFlaky upstreamSignalKind = "network_flaky"
)

type upstreamSignalRule struct {
	kind upstreamSignalKind
	// match receives lowercased, trimmed text (may be empty — caller skips empty).
	match func(text string) bool
}

func containsAny(text string, parts ...string) bool {
	for _, p := range parts {
		if strings.Contains(text, p) {
			return true
		}
	}
	return false
}

// upstreamSignalRules is the canonical phrase table.
// Order within a kind does not matter for Is*; disposal priority is kind-based.
var upstreamSignalRules = []upstreamSignalRule{
	// --- dead session / revoked OAuth (permanent for pool) ---
	{kind: signalKindDeadToken, match: func(t string) bool {
		return containsAny(t,
			"token_invalidated",
			"token_revoked",
			"token_expired",
			"authentication token has been invalidated",
			"authentication token is expired",
			"provided authentication token is expired",
			"invalidated oauth token",
		)
	}},
	{kind: signalKindDeadToken, match: func(t string) bool {
		return strings.Contains(t, "please try signing in again") &&
			containsAny(t, "401", "token", "expired")
	}},

	// --- rate limit (429-style; UI code upstream_rate_limited) ---
	{kind: signalKindRateLimit, match: func(t string) bool {
		return containsAny(t,
			"rate limit",
			"rate_limit",
			"too many requests",
			"too_many_requests",
			"status=429",
			"http_429",
			"速率限制",
			"速率超过",
			"请求过多",
		)
	}},
	{kind: signalKindRateLimit, match: func(t string) bool {
		return hasHTTPStatus(t, 429)
	}},

	// --- account quota / gen cap (pool temporary; UI may use upstream_usage_limit) ---
	{kind: signalKindAccountQuota, match: func(t string) bool {
		return containsAny(t,
			"insufficient_quota",
			"limit reached",
			"usage limit",
			"usage_limit",
			"image generation limit",
			"you've reached",
			"you have reached",
			"限流",
			"额度已用尽",
			"生成上限",
			"已达上限",
		)
	}},

	// --- Cloudflare challenge (temporary) ---
	{kind: signalKindCloudflare, match: func(t string) bool {
		return containsAny(t,
			"cloudflare",
			"cf-ray",
			"cf-chl",
			"just a moment",
			"attention required",
		)
	}},

	// --- timeout (UI subset + contributes to network flaky for pool) ---
	{kind: signalKindTimeout, match: func(t string) bool {
		return containsAny(t,
			"deadline exceeded",
			"timeout",
			"timed out",
			"gateway timeout",
			"status=524",
			"http_524",
			"error code: 524",
		)
	}},

	// --- gateway 502/503/504 ---
	{kind: signalKindGateway, match: func(t string) bool {
		return containsAny(t,
			"bad gateway",
			"status=502",
			"status=503",
			"status=504",
			"http_502",
			"http_503",
			"http_504",
			"error code: 502",
			"error code: 503",
			"error code: 504",
		)
	}},

	// --- other transport noise (unknown / cooldown only for pool) ---
	// Intentionally NO bare "eof" — use "unexpected eof" only.
	{kind: signalKindNetworkFlaky, match: func(t string) bool {
		return containsAny(t,
			"temporar",
			"connection reset",
			"unexpected eof",
			"connection refused",
			"no such host",
			"network is unreachable",
		)
	}},
	{kind: signalKindNetworkFlaky, match: func(t string) bool {
		return strings.Contains(t, "http 5") ||
			strings.Contains(t, "status=5") ||
			strings.Contains(t, "error code: 5")
	}},
}

func matchSignalKind(message string, kind upstreamSignalKind) bool {
	text := signalText(message)
	if text == "" {
		return false
	}
	for _, rule := range upstreamSignalRules {
		if rule.kind != kind {
			continue
		}
		if rule.match(text) {
			return true
		}
	}
	return false
}

func matchAnySignalKind(message string, kinds ...upstreamSignalKind) bool {
	for _, k := range kinds {
		if matchSignalKind(message, k) {
			return true
		}
	}
	return false
}

// IsDeadTokenSignal is a definitive dead session / revoked / expired OAuth token.
func IsDeadTokenSignal(message string) bool {
	return matchSignalKind(message, signalKindDeadToken)
}

// IsCloudflareSignal detects CF challenge / interstitial copy.
func IsCloudflareSignal(message string) bool {
	return matchSignalKind(message, signalKindCloudflare)
}

// IsNetworkFlakySignal is timeout / reset / 5xx transport noise — not a ban.
func IsNetworkFlakySignal(message string) bool {
	return matchAnySignalKind(message,
		signalKindTimeout,
		signalKindGateway,
		signalKindNetworkFlaky,
	)
}

// IsUpstreamTimeoutSignal is the user-facing timeout subset (includes CF 524).
func IsUpstreamTimeoutSignal(message string) bool {
	return matchSignalKind(message, signalKindTimeout)
}

// IsUpstreamGatewaySignal is 502/503/504 style gateway failures.
func IsUpstreamGatewaySignal(message string) bool {
	return matchSignalKind(message, signalKindGateway)
}

// IsUpstreamRateLimitSignal is the UI/task-facing rate-limit subset.
func IsUpstreamRateLimitSignal(message string) bool {
	return matchSignalKind(message, signalKindRateLimit)
}

// IsUpstreamAccountQuotaSignal detects an account-level generation quota/cap.
// It is deliberately separate from shared HTTP 429 rate limiting so callers
// can explain the failure without suggesting that the whole egress is limited.
func IsUpstreamAccountQuotaSignal(message string) bool {
	return matchSignalKind(message, signalKindAccountQuota)
}

func hasHTTPStatus(message string, status int) bool {
	code := strconv.Itoa(status)
	lower := strings.ToLower(message)
	return strings.Contains(lower, "http "+code) ||
		strings.Contains(lower, "status="+code) ||
		strings.Contains(lower, "status: "+code) ||
		strings.Contains(message, `"status":`+code) ||
		strings.Contains(lower, "http_"+code)
}

func hasAccountHTTPStatus(message string, status int) bool {
	if !hasHTTPStatus(message, status) {
		return false
	}
	text := signalText(message)
	return strings.Contains(text, "/backend-api/") ||
		strings.Contains(text, "auth_chat_requirements") ||
		strings.Contains(text, "authorization") ||
		strings.Contains(text, "token")
}

func isBootstrapErrorMessage(message string) bool {
	return strings.HasPrefix(strings.TrimSpace(message), "bootstrap failed")
}

// itoa is a package helper used by account labels and tests.
func itoa(v int) string {
	return strconv.Itoa(v)
}
