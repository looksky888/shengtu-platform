package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

func IsImageAccountAvailable(account map[string]any) bool {
	acc, ok := accountFromMap(account)
	if !ok {
		return false
	}
	return acc.isImageAvailable()
}

func IsPaidImageAccount(account map[string]any) bool {
	acc, ok := accountFromMap(account)
	if !ok {
		// Paid filter may receive sparse maps; fall back to type only.
		if account == nil {
			return false
		}
		switch util.Clean(account["type"]) {
		case "Plus", "ProLite", "Pro", "Team":
			return true
		default:
			return false
		}
	}
	return acc.isPaidImage()
}

func publicAccounts(accounts []Account) []map[string]any {
	out := make([]map[string]any, 0, len(accounts))
	for _, account := range accounts {
		token := util.Clean(account.AccessToken)
		if token == "" {
			continue
		}
		// Map bridge for residual callers; typed paths use AccountPublicFromRecord.
		// Empty strings stay "" (omitempty on AccountPublic); maps keep nil for legacy clients.
		out = append(out, map[string]any{
			"id":                 accountIDFromToken(token),
			"token_preview":      util.AnonymizeToken(token),
			"access_token":       token,
			"type":               firstNonEmpty(account.Type, "Free"),
			"status":             firstNonEmpty(account.Status, "正常"),
			"quota":              account.Quota,
			"imageQuotaUnknown":  account.ImageQuotaUnknown,
			"email":              nilIfEmpty(account.Email),
			"user_id":            nilIfEmpty(account.UserID),
			"limits_progress":    accountLimitsPublic(account.LimitsProgress),
			"default_model_slug": nilIfEmpty(account.DefaultModelSlug),
			"restoreAt":          nilIfEmpty(account.RestoreAt),
			"success":            account.Success,
			"fail":               account.Fail,
			"lastUsedAt":         nilIfEmpty(account.LastUsedAt),
		})
	}
	return out
}

func nilIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func accountIDFromToken(token string) string {
	return util.SHA1Short(token, 16)
}

func cleanAccountIDs(ids []string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

func cleanTokens(tokens []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(tokens))
	for _, token := range tokens {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		if _, ok := seen[token]; ok {
			continue
		}
		seen[token] = struct{}{}
		out = append(out, token)
	}
	return out
}

func decodeAccessTokenPayload(accessToken string) map[string]any {
	parts := strings.Split(util.Clean(accessToken), ".")
	if len(parts) < 2 {
		return map[string]any{}
	}
	payload := parts[1]
	data, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		data, err = base64.URLEncoding.DecodeString(payload)
	}
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if json.Unmarshal(data, &out) != nil {
		return map[string]any{}
	}
	return out
}

func anyList(value any) []any {
	if list, ok := value.([]any); ok {
		return list
	}
	if list, ok := value.([]map[string]any); ok {
		out := make([]any, len(list))
		for i, item := range list {
			out[i] = item
		}
		return out
	}
	return []any{}
}

func mergeMaps(items ...map[string]any) map[string]any {
	out := map[string]any{}
	for _, item := range items {
		for key, value := range item {
			out[key] = value
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func refreshHTTPError(context string, status int, body []byte) error {
	detail := summarizeRefreshErrorBody(body)
	if detail == "" {
		return fmt.Errorf("%s failed: HTTP %d", context, status)
	}
	return fmt.Errorf("%s failed: HTTP %d, %s", context, status, detail)
}

func summarizeRefreshErrorBody(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	lower := strings.ToLower(text)
	if strings.Contains(lower, "cf_chl") ||
		strings.Contains(lower, "challenge-platform") ||
		strings.Contains(lower, "enable javascript and cookies to continue") ||
		strings.Contains(lower, "cloudflare") {
		return "upstream returned Cloudflare challenge page; refresh browser fingerprint/session or change proxy"
	}
	if strings.Contains(lower, "<html") || strings.Contains(lower, "<!doctype html") || strings.Contains(lower, "<body") {
		return "upstream returned HTML error page"
	}
	const maxBodyDetail = 2048
	if len(text) > maxBodyDetail {
		return "body=" + text[:maxBodyDetail] + "...(truncated)"
	}
	return "body=" + text
}
