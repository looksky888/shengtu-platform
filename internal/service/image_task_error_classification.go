package service

import (
	"errors"
	"strings"
)

func friendlyImageTaskError(err error) string {
	return classifyImageTaskError(err).Message
}

// FriendlyImageTaskErrorForHTTP maps internal generation errors to Chinese user-facing messages.
func FriendlyImageTaskErrorForHTTP(err error) string {
	return friendlyImageTaskError(err)
}

type ImageTaskErrorInfo struct {
	Code               string
	Message            string
	UpstreamRequestID  string
	UpstreamHost       string
	UpstreamHTTPStatus int
	UpstreamCFRay      string
	RetryIndex         int
	AttemptCount       int
	Troubleshooting    string
}

type imageTaskErrorCodeProvider interface {
	ImageTaskErrorCode() string
}

func classifyImageTaskError(err error) ImageTaskErrorInfo {
	if err == nil {
		return ImageTaskErrorInfo{
			Code:            "image_generation_failed",
			Message:         "图片生成失败",
			Troubleshooting: "请稍后重试；如果持续失败，请复制排错信息发给管理员。",
		}
	}
	message := err.Error()
	metadata := imageTaskUpstreamMetadataFromError(err)
	lower := strings.ToLower(message)
	info := ImageTaskErrorInfo{
		Code:               "image_generation_failed",
		Message:            message,
		UpstreamRequestID:  firstNonEmpty(metadata.RequestID, extractUpstreamRequestID(message)),
		UpstreamHost:       metadata.UpstreamHost,
		UpstreamHTTPStatus: metadata.HTTPStatus,
		UpstreamCFRay:      metadata.CFRay,
		RetryIndex:         metadata.RetryIndex,
		AttemptCount:       metadata.AttemptCount,
		Troubleshooting:    "请稍后重试；如果持续失败，请复制排错信息发给管理员。",
	}
	var coded imageTaskErrorCodeProvider
	if errors.As(err, &coded) {
		info.Code = strings.TrimSpace(coded.ImageTaskErrorCode())
	}

	ctx := imageErrorMatchCtx{message: message, lower: lower, code: info.Code}
	for _, rule := range imageTaskErrorRules {
		if rule.match == nil || !rule.match(ctx) {
			continue
		}
		info.Code = rule.code
		info.Troubleshooting = rule.troubleshooting
		if rule.messageFn != nil {
			info.Message = rule.messageFn(ctx)
		} else {
			info.Message = rule.message
		}
		return info
	}
	return info
}

// isUpstreamSafetyRejectedMessage detects content-policy / safety refusals from upstream copy.
func isUpstreamSafetyRejectedMessage(lower string) bool {
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "content policies") ||
		strings.Contains(lower, "content policy") ||
		strings.Contains(lower, "policy violation") ||
		(strings.Contains(lower, "policies") && strings.Contains(lower, "violate")) ||
		strings.Contains(lower, "prompt may violate") ||
		strings.Contains(lower, "we're so sorry") ||
		strings.Contains(lower, "we are so sorry") {
		return true
	}
	if strings.Contains(lower, "safety") ||
		strings.Contains(lower, "moderation") ||
		strings.Contains(lower, "refus") ||
		strings.Contains(lower, "blocked") ||
		strings.Contains(lower, "not allowed") {
		return true
	}
	// Require stronger combinations than bare "policy" / "blocked" to avoid false positives.
	if strings.Contains(lower, "policy") &&
		(strings.Contains(lower, "content") || strings.Contains(lower, "violat") || strings.Contains(lower, "safety")) {
		return true
	}
	// "safe" is broad; only with reject/block/system phrasing.
	if strings.Contains(lower, "safe") &&
		(strings.Contains(lower, "reject") || strings.Contains(lower, "system") || strings.Contains(lower, "block")) {
		return true
	}
	return false
}

func extractUpstreamRequestID(message string) string {
	patterns := []string{"request_id", "request id", "x-request-id", "cf-ray", "trace_id"}
	lower := strings.ToLower(message)
	for _, pattern := range patterns {
		idx := strings.Index(lower, pattern)
		if idx < 0 {
			continue
		}
		part := message[idx+len(pattern):]
		part = strings.TrimLeft(part, " :=\t\"'")
		// Stop at whitespace so "req-9 cf-ray=..." does not swallow the next field.
		fields := strings.FieldsFunc(part, func(r rune) bool {
			return r == ',' || r == ';' || r == ' ' || r == '\n' || r == '\r' || r == '\t' || r == '"' || r == '\'' || r == '}' || r == ']'
		})
		if len(fields) > 0 {
			id := strings.TrimSpace(fields[0])
			if id != "" {
				return id
			}
		}
	}
	return ""
}
