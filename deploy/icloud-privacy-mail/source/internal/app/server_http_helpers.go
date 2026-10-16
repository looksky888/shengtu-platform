package app

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

func firstMap(rows []map[string]any) map[string]any {
	if len(rows) == 0 {
		return map[string]any{}
	}
	return rows[0]
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	limited := io.LimitReader(r.Body, 1<<20)
	decoder := json.NewDecoder(limited)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errCode("bad_json", "JSON 请求体非法："+err.Error(), false)
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	var coded codedError
	if errors.As(err, &coded) {
		writeJSON(w, status, apiError{
			Success:   false,
			Code:      coded.code,
			Message:   coded.message,
			Retryable: coded.retryable,
		})
		return
	}
	writeJSON(w, status, apiError{
		Success: false,
		Code:    "internal_error",
		Message: err.Error(),
	})
}

func requestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func parseAfter(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, errCode("invalid_after", "after 必须是 RFC3339 时间", false)
	}
	return parsed, nil
}

var (
	xaiOTPRegex     = regexp.MustCompile(`(?i)\b([a-z0-9]{3}-[a-z0-9]{3})\b`)
	contextOTPRegex = regexp.MustCompile(`(?i)(?:openai|chatgpt|otp|code|verification|验证码|验证|代码)[^\d]{0,80}(\d{6})`)
	plainOTPRegex   = regexp.MustCompile(`\b(\d{6})\b`)
)

func extractOTP(text string) string {
	if matches := xaiOTPRegex.FindStringSubmatch(text); len(matches) == 2 && validOTP(matches[1]) {
		return strings.ToUpper(matches[1])
	}
	if matches := contextOTPRegex.FindStringSubmatch(text); len(matches) == 2 && validOTP(matches[1]) {
		return matches[1]
	}
	for _, matches := range plainOTPRegex.FindAllStringSubmatch(text, -1) {
		if len(matches) == 2 && validOTP(matches[1]) {
			return matches[1]
		}
	}
	return ""
}

func validOTP(code string) bool {
	if len(code) == 7 && code[3] == '-' {
		for index := range code {
			if index == 3 {
				continue
			}
			char := code[index]
			if !((char >= '0' && char <= '9') || (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')) {
				return false
			}
		}
		return !strings.EqualFold(code, "000-000")
	}
	return len(code) == 6 && code != "000000"
}

func validMailboxStatus(status string) bool {
	switch status {
	case StatusActive, StatusAvailable, StatusUsed, StatusFailed, StatusDisabled:
		return true
	default:
		return false
	}
}

func maskAppleID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	at := strings.Index(value, "@")
	if at <= 1 {
		return maskSecret(value, 4)
	}
	return value[:1] + "***" + value[at:]
}
