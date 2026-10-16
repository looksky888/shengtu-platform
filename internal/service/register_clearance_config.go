package service

import (
	"chatgpt2api/internal/util"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"time"
)

func registerEnvBool(name string, fallback bool) bool {
	value, ok := os.LookupEnv(name)
	if !ok {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func registerEnvInt(names []string, fallback, minimum int) int {
	for _, name := range names {
		value := strings.TrimSpace(os.Getenv(name))
		if value == "" {
			continue
		}
		parsed, err := strconv.Atoi(value)
		if err == nil {
			if parsed < minimum {
				return minimum
			}
			return parsed
		}
	}
	if fallback < minimum {
		return minimum
	}
	return fallback
}

func registerFlareSolverrURL() string {
	return strings.TrimRight(strings.TrimSpace(os.Getenv("CHATGPT2API_FLARESOLVERR_URL")), "/")
}

func registerClearanceEnabled() bool {
	if _, ok := os.LookupEnv("CHATGPT2API_REGISTER_CLEARANCE_ENABLED"); ok {
		return registerEnvBool("CHATGPT2API_REGISTER_CLEARANCE_ENABLED", false)
	}
	return registerFlareSolverrURL() != ""
}

func registerClearanceTimeout() time.Duration {
	seconds := registerEnvInt([]string{"CHATGPT2API_REGISTER_CLEARANCE_TIMEOUT_SECONDS", "CHATGPT2API_PROXY_RUNTIME_CLEARANCE_TIMEOUT_SEC"}, 60, 1)
	return time.Duration(seconds) * time.Second
}

func registerClearanceRefreshInterval() time.Duration {
	seconds := registerEnvInt([]string{"CHATGPT2API_REGISTER_CLEARANCE_REFRESH_INTERVAL_SECONDS", "CHATGPT2API_PROXY_RUNTIME_CLEARANCE_REFRESH_INTERVAL"}, 3600, 0)
	return time.Duration(seconds) * time.Second
}

func registerClearanceProxy(registerProxy string) string {
	if override := strings.TrimSpace(os.Getenv("CHATGPT2API_REGISTER_CLEARANCE_PROXY")); override != "" {
		switch strings.ToLower(override) {
		case "-", "none", "direct":
			return ""
		default:
			return override
		}
	}
	return strings.TrimSpace(registerProxy)
}

func registerCookieExpires(value any) time.Time {
	switch v := value.(type) {
	case float64:
		if v > 0 {
			return time.Unix(int64(v), 0)
		}
	case int64:
		if v > 0 {
			return time.Unix(v, 0)
		}
	case json.Number:
		if parsed, err := strconv.ParseInt(v.String(), 10, 64); err == nil && parsed > 0 {
			return time.Unix(parsed, 0)
		}
	case string:
		value := strings.TrimSpace(v)
		if value == "" {
			return time.Time{}
		}
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil && parsed > 0 {
			return time.Unix(parsed, 0)
		}
		for _, layout := range []string{time.RFC1123, time.RFC1123Z, time.RFC3339} {
			if parsed, err := time.Parse(layout, value); err == nil {
				return parsed
			}
		}
	}
	return time.Time{}
}

func registerSnippet(text string, limit int) string {
	text = strings.Join(strings.Fields(text), " ")
	if limit > 0 && len(text) > limit {
		return text[:limit]
	}
	return text
}

func (w *registerWorker) clearanceConfig() map[string]any {
	return util.StringMap(w.config["clearance"])
}

func (w *registerWorker) clearanceEnabled() bool {
	cfg := w.clearanceConfig()
	if _, ok := cfg["enabled"]; ok {
		return util.ToBool(cfg["enabled"])
	}
	return registerClearanceEnabled()
}

func (w *registerWorker) clearanceMode() string {
	mode := strings.ToLower(strings.TrimSpace(util.Clean(w.clearanceConfig()["mode"])))
	if mode == "manual" || mode == "flaresolverr" || mode == "none" {
		return mode
	}
	return "flaresolverr"
}

func (w *registerWorker) clearanceFlareSolverrURL() string {
	if value := strings.TrimRight(strings.TrimSpace(util.Clean(w.clearanceConfig()["flaresolverr_url"])), "/"); value != "" {
		return value
	}
	return registerFlareSolverrURL()
}

func (w *registerWorker) clearanceTimeout() time.Duration {
	if value, ok := w.clearanceConfig()["timeout_seconds"]; ok {
		return time.Duration(maxInt(1, util.ToInt(value, 60))) * time.Second
	}
	return registerClearanceTimeout()
}

func (w *registerWorker) clearanceRefreshInterval() time.Duration {
	if value, ok := w.clearanceConfig()["refresh_interval_seconds"]; ok {
		return time.Duration(maxInt(0, util.ToInt(value, 3600))) * time.Second
	}
	return registerClearanceRefreshInterval()
}

func (w *registerWorker) clearanceProxy() string {
	if value := strings.TrimSpace(util.Clean(w.clearanceConfig()["proxy"])); value != "" {
		switch strings.ToLower(value) {
		case "-", "none", "direct":
			return ""
		default:
			return value
		}
	}
	return registerClearanceProxy(w.registerProxy())
}
