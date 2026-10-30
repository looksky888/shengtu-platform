package service

import (
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"chatgpt2api/internal/util"
)

// Stable provider names persisted with creation tasks. They describe the
// effective route, not the user-facing model family.
const (
	ImageTaskProviderAccountPool = "account_pool"
	ImageTaskProviderProxyAPI    = "proxy_api"
	ImageTaskProviderGrokRuntime = "grok_runtime"

	ImageTaskChannelAccountPool = "chatgpt_account_pool"
	ImageTaskChannelProxyAPI    = "openai_compatible_proxy"
	ImageTaskChannelGrokRuntime = "grok_runtime"
)

// ImageTaskUpstreamMetadata is the non-secret evidence attached to one
// upstream attempt. It is intentionally independent of the HTTP package so
// service persistence can consume errors from every provider.
type ImageTaskUpstreamMetadata struct {
	Provider       string
	Channel        string
	EffectiveModel string
	UpstreamHost   string
	HTTPStatus     int
	RequestID      string
	CFRay          string
	RetryIndex     int
	AttemptCount   int
}

// ImageTaskUpstreamMetadataProvider lets upstream clients expose structured
// evidence without making the service package depend on their implementation.
type ImageTaskUpstreamMetadataProvider interface {
	ImageTaskUpstreamMetadata() ImageTaskUpstreamMetadata
}

var upstreamHTTPStatusPattern = regexp.MustCompile(`(?i)(?:status|http(?:_status)?|error[ _-]*code)[=: _-]*(\d{3})`)

var upstreamRetryPattern = regexp.MustCompile(`(?i)(?:retry_index|retry)[=: _-]*(\d+)`)

var upstreamAttemptPattern = regexp.MustCompile(`(?i)(?:attempt_count|attempt)[=: _-]*(\d+)`)

func imageTaskUpstreamMetadataFromError(err error) ImageTaskUpstreamMetadata {
	metadata := ImageTaskUpstreamMetadata{}
	if err == nil {
		return metadata
	}
	var provider ImageTaskUpstreamMetadataProvider
	if errors.As(err, &provider) {
		metadata = provider.ImageTaskUpstreamMetadata()
	}
	message := err.Error()
	if metadata.HTTPStatus <= 0 && !IsSentinelSolverSignal(message) {
		metadata.HTTPStatus = extractUpstreamHTTPStatus(message)
	}
	if metadata.RequestID == "" {
		metadata.RequestID = extractUpstreamRequestID(message)
	}
	if metadata.CFRay == "" {
		metadata.CFRay = extractUpstreamCFRay(message)
	}
	if metadata.UpstreamHost == "" {
		metadata.UpstreamHost = extractUpstreamHost(message)
	}
	if metadata.RetryIndex == 0 {
		metadata.RetryIndex = extractUpstreamInteger(message, upstreamRetryPattern)
	}
	if metadata.AttemptCount <= 0 {
		metadata.AttemptCount = extractUpstreamInteger(message, upstreamAttemptPattern)
	}
	if metadata.RetryIndex < 0 {
		metadata.RetryIndex = 0
	}
	if metadata.AttemptCount <= 0 && metadata.RetryIndex > 0 {
		metadata.AttemptCount = metadata.RetryIndex + 1
	}
	return metadata
}

// ImageTaskUpstreamMetadataFromError returns structured, non-secret evidence
// for logging task attempts at provider boundaries.
func ImageTaskUpstreamMetadataFromError(err error) ImageTaskUpstreamMetadata {
	return imageTaskUpstreamMetadataFromError(err)
}

func extractUpstreamHTTPStatus(message string) int {
	status := extractUpstreamInteger(message, upstreamHTTPStatusPattern)
	if status < 100 || status > 599 {
		return 0
	}
	return status
}

func extractUpstreamInteger(message string, pattern *regexp.Regexp) int {
	match := pattern.FindStringSubmatch(message)
	if len(match) != 2 {
		return 0
	}
	status, err := strconv.Atoi(match[1])
	if err != nil {
		return 0
	}
	return status
}

func extractUpstreamCFRay(message string) string {
	return extractTaggedValue(message, []string{"cf-ray", "cf_ray", "cf ray"})
}

func extractUpstreamHost(message string) string {
	value := extractTaggedValue(message, []string{"upstream_host", "upstream host"})
	if value == "" {
		return ""
	}
	return normalizeUpstreamHost(value)
}

func extractTaggedValue(message string, tags []string) string {
	lower := strings.ToLower(message)
	for _, tag := range tags {
		idx := strings.Index(lower, strings.ToLower(tag))
		if idx < 0 {
			continue
		}
		value := strings.TrimLeft(message[idx+len(tag):], " :=\t\"'")
		fields := strings.FieldsFunc(value, func(r rune) bool {
			return unicode.IsSpace(r) || r == ',' || r == ';' || r == '"' || r == '\'' || r == '}' || r == ']'
		})
		if len(fields) > 0 {
			return strings.TrimSpace(fields[0])
		}
	}
	return ""
}

func normalizeUpstreamHost(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err == nil {
		if host := parsed.Hostname(); host != "" {
			return strings.ToLower(host)
		}
	}
	if parsed, err := url.Parse("//" + value); err == nil && parsed.Hostname() != "" {
		return strings.ToLower(parsed.Hostname())
	}
	return strings.ToLower(strings.TrimSpace(strings.Split(value, "/")[0]))
}

func (t *ImageTask) applyObservabilityUpdates(updates map[string]any) {
	if t == nil || len(updates) == 0 {
		return
	}
	stage := strings.TrimSpace(util.Clean(updates["stage"]))
	if stage == "upstream_start" || stage == "upstream_attempt" || stage == "upstream_attempt_failed" {
		t.UpstreamHTTPStatus = 0
		t.upstreamHTTPStatusSet = false
		t.UpstreamRequestID = ""
		t.UpstreamCFRay = ""
	}
	if value := strings.TrimSpace(util.Clean(updates["effective_provider"])); value != "" {
		t.EffectiveProvider = value
	}
	if value := strings.TrimSpace(util.Clean(updates["effective_channel"])); value != "" {
		t.EffectiveChannel = value
	}
	if value := strings.TrimSpace(util.Clean(updates["provider_source"])); value != "" {
		t.ProviderSource = value
	}
	if value := strings.TrimSpace(util.Clean(updates["effective_model"])); value != "" {
		t.EffectiveModel = value
	}
	if value := strings.TrimSpace(util.Clean(updates["upstream_model"])); value != "" {
		t.EffectiveModel = value
	}
	if value := normalizeUpstreamHost(util.Clean(updates["upstream_host"])); value != "" {
		t.UpstreamHost = value
	}
	if status := util.ToInt(updates["upstream_http_status"], 0); status > 0 {
		t.UpstreamHTTPStatus = status
		t.upstreamHTTPStatusSet = true
	} else if status := util.ToInt(updates["http_status"], 0); status > 0 {
		t.UpstreamHTTPStatus = status
		t.upstreamHTTPStatusSet = true
	}
	if value := strings.TrimSpace(util.Clean(updates["upstream_request_id"])); value != "" {
		t.UpstreamRequestID = value
	} else if value := strings.TrimSpace(util.Clean(updates["request_id"])); value != "" {
		t.UpstreamRequestID = value
	}
	if value := strings.TrimSpace(util.Clean(updates["upstream_cf_ray"])); value != "" {
		t.UpstreamCFRay = value
	} else if value := strings.TrimSpace(util.Clean(updates["cf_ray"])); value != "" {
		t.UpstreamCFRay = value
	}
	if retry, ok := observationInt(updates, "retry_index", "retry"); ok && retry >= 0 {
		t.RetryIndex = retry
		t.retryIndexSet = true
	}
	if attempt, ok := observationInt(updates, "attempt_count", "attempt"); ok && attempt > 0 {
		t.AttemptCount = attempt
		t.attemptCountSet = true
	}
}

func observationInt(values map[string]any, keys ...string) (int, bool) {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			return util.ToInt(value, 0), true
		}
	}
	return 0, false
}

func applyImageTaskErrorMetadata(updates map[string]any, info ImageTaskErrorInfo) {
	if updates == nil {
		return
	}
	if info.UpstreamHost != "" {
		updates["upstream_host"] = info.UpstreamHost
	}
	if info.UpstreamHTTPStatus > 0 {
		updates["upstream_http_status"] = info.UpstreamHTTPStatus
	}
	if info.UpstreamCFRay != "" {
		updates["upstream_cf_ray"] = info.UpstreamCFRay
	}
	if info.UpstreamRequestID != "" {
		updates["upstream_request_id"] = info.UpstreamRequestID
	}
	// A zero retry index is meaningful when attempt_count proves that the
	// upstream metadata was present. Without evidence, leave the attempt event
	// untouched instead of overwriting it with the struct zero value.
	if info.RetryIndex > 0 || info.AttemptCount > 0 {
		updates["retry_index"] = info.RetryIndex
	}
	if info.AttemptCount > 0 {
		updates["attempt_count"] = info.AttemptCount
	}
}
