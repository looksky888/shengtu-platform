package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"chatgpt2api/internal/util"
)

func normalizeUpdateRepo(value any) string {
	repo := strings.Trim(strings.TrimSpace(fmt.Sprint(value)), "/")
	if repo == "" || strings.EqualFold(repo, "ZyphrZero/chatgpt2api") {
		return "looksky888/shengtu-platform"
	}
	return repo
}

func validateUpdateRepo(value string) error {
	if !regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`).MatchString(value) {
		return errors.New("更新仓库须为 owner/repo 格式")
	}
	return nil
}

func validateAbsoluteHTTPURL(value string) error {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("URL 协议须为 http 或 https")
	}
	if parsed.Host == "" {
		return errors.New("URL 须包含主机名")
	}
	return nil
}

func intSetting(value any, fallback int) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case int32:
		return int(v)
	case float64:
		return int(v)
	case float32:
		return int(v)
	case json.Number:
		if n, err := strconv.Atoi(strings.TrimSpace(v.String())); err == nil {
			return n
		}
		if n, err := strconv.ParseFloat(strings.TrimSpace(v.String()), 64); err == nil {
			return int(n)
		}
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err == nil {
			return n
		}
	}
	return fallback
}

func floatSetting(value any, fallback float64) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err == nil {
			return n
		}
	}
	return fallback
}

func normalizeLoginPageImageMode(value any) string {
	mode := strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
	switch mode {
	case "cover", "contain", "fill":
		return mode
	default:
		return "contain"
	}
}

func normalizeImageCreditCost(value any, fallback int) int {
	cost := intSetting(value, fallback)
	if cost < 1 {
		return 1
	}
	if cost > 100000 {
		return 100000
	}
	return cost
}

func normalizeImageAccountSchedule(value any) string {
	switch strings.ToLower(strings.TrimSpace(fmt.Sprint(value))) {
	case "least_fail", "least-fail", "fail":
		return "least_fail"
	case "quota_aware", "quota-aware", "quota":
		return "quota_aware"
	default:
		return "least_loaded"
	}
}

func normalizeImageProvider(value any) string {
	switch strings.ToLower(strings.TrimSpace(fmt.Sprint(value))) {
	case "proxy_api":
		return "proxy_api"
	default:
		return "account_pool"
	}
}

func normalizeUpstreamClearanceMode(value any) string {
	switch strings.ToLower(strings.TrimSpace(fmt.Sprint(value))) {
	case "flaresolverr", "manual":
		return strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
	default:
		return "none"
	}
}

func normalizeImageDefaultModel(value any) string {
	model := strings.TrimSpace(fmt.Sprint(value))
	if util.IsGrokImageModel(model) {
		return util.ImageModelGPT25Flare
	}
	switch model {
	case util.ImageModelGPT, util.ImageModelGPT25, util.ImageModelGPT25Flare, util.ImageModelGPT25Sunburst, util.ImageModelAuto:
		return model
	default:
		return util.ImageModelGPT25Flare
	}
}

func normalizeImageInternalModelSlug(value any) string {
	model := strings.TrimSpace(fmt.Sprint(value))
	if model == "" || util.IsGPTImageModel(model) {
		return util.ImageModelGPT53
	}
	if model == util.ImageModelAuto {
		return util.ImageModelAuto
	}
	if isAllowedImageInternalModelSlug(model) {
		return model
	}
	return util.ImageModelGPT53
}

func normalizeImageFallbackModelSlugs(value any) []string {
	models := cleanCSVSetting(value)
	if len(models) == 0 {
		models = []string{util.ImageModelGPT55, util.ImageModelAuto}
	}
	out := make([]string, 0, len(models))
	seen := map[string]struct{}{}
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		if util.IsGPTImageModel(model) {
			model = util.ImageModelAuto
		}
		if !isAllowedImageInternalModelSlug(model) {
			continue
		}
		if _, ok := seen[model]; ok {
			continue
		}
		seen[model] = struct{}{}
		out = append(out, model)
	}
	if len(out) == 0 {
		return []string{util.ImageModelGPT55, util.ImageModelAuto}
	}
	return out
}

func isAllowedImageInternalModelSlug(model string) bool {
	switch strings.TrimSpace(model) {
	case util.ImageModelAuto, util.ImageModelGPT55Thinking, util.ImageModelGPT53, util.ImageModelGPT53Mini, util.ImageModelGPT55, util.ImageModelGPT54, util.ImageModelGPT5, util.ImageModelGPT51, util.ImageModelGPT52, util.ImageModelGPTMini:
		return true
	default:
		return false
	}
}

func cleanCSVSetting(value any) []string {
	var raw []string
	switch v := value.(type) {
	case []string:
		raw = v
	case []any:
		for _, item := range v {
			raw = append(raw, fmt.Sprint(item))
		}
	default:
		raw = strings.Split(fmt.Sprint(v), ",")
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func maskSecret(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= 8 {
		return "****"
	}
	return string(runes[:3]) + "****" + string(runes[len(runes)-4:])
}

func normalizeImageTaskTimeoutSeconds(value any) int {
	seconds := intSetting(value, defaultImageTaskTimeoutSeconds)
	if seconds < minImageTaskTimeoutSeconds {
		return minImageTaskTimeoutSeconds
	}
	if seconds > maxImageTaskTimeoutSeconds {
		return maxImageTaskTimeoutSeconds
	}
	return seconds
}

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
