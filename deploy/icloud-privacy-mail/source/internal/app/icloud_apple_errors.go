package app

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

func appleAccountAPIError(status int, data []byte, stage string) error {
	detail := appleAccountErrorDetail(status, data, stage)
	if isAppleTransientHTTPStatus(status) {
		return errCode("apple_account_http_transient", "Apple Account 服务暂时不可用；"+detail, true)
	}
	msg := strings.TrimSpace(appleDebugBody(data))
	if msg == "" {
		msg = "空响应"
	}
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "limit") || strings.Contains(lower, "too many") || strings.Contains(lower, "rate") {
		return errCode("apple_account_hme_limit", "Apple Account 已达到当前隐私邮箱创建上限，请稍后再试；"+detail, true)
	}
	if status == appleAccountHTTPStatusSessionTimeout || status == http.StatusUnauthorized || (status == http.StatusForbidden && appleAccountBodyLooksAuthExpired(lower)) {
		return errCode("apple_account_auth_failed", "Apple Account 管理态已失效，请重新协议登录；"+detail, true)
	}
	return errCode("apple_account_api_failed", "Apple Account 接口失败；"+detail, true)
}

func appleAccountBodyLooksAuthExpired(lower string) bool {
	lower = strings.ToLower(strings.TrimSpace(lower))
	if lower == "" {
		return false
	}
	authTokens := []string{
		"authentication_failed",
		"authentication failed",
		"auth_failed",
		"auth failed",
		"gsa_invalid_session",
		"invalid session",
		"scnt_expired",
		"session expired",
		"session has expired",
	}
	for _, token := range authTokens {
		if strings.Contains(lower, token) {
			return true
		}
	}
	return strings.Contains(lower, "authentication") && (strings.Contains(lower, "failed") || strings.Contains(lower, "expired"))
}

func appleAccountErrorDetail(status int, data []byte, stage string) string {
	stage = strings.TrimSpace(stage)
	if stage == "" {
		stage = "未知阶段"
	}
	body := strings.TrimSpace(appleDebugBody(data))
	if body == "" {
		body = "空响应"
	}
	return fmt.Sprintf("阶段：%s；HTTP %d；原始返回：%s", stage, status, body)
}

func appleAccountResponseDetail(stage string, data []byte) string {
	stage = strings.TrimSpace(stage)
	if stage == "" {
		stage = "未知阶段"
	}
	body := strings.TrimSpace(appleDebugBody(data))
	if body == "" {
		body = "空响应"
	}
	return fmt.Sprintf("阶段：%s；原始返回：%s", stage, body)
}

func appleAccountRawResponseDetail(stage string, raw appleAccountRawResponse) string {
	stage = strings.TrimSpace(stage)
	if stage == "" {
		stage = "未知阶段"
	}
	body := strings.TrimSpace(appleDebugBody(raw.Body))
	if body == "" {
		body = "空响应"
	}
	if raw.StatusCode > 0 {
		return fmt.Sprintf("阶段：%s；HTTP %d；原始返回：%s", stage, raw.StatusCode, body)
	}
	return fmt.Sprintf("阶段：%s；原始返回：%s", stage, body)
}

func appleAccountRequestStage(method, path string) string {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = strings.TrimSpace(path)
	switch {
	case path == "/account/manage/gs/ws/token":
		return "刷新管理 token"
	case path == "/account/manage":
		return "读取管理入口"
	case path == "/account/manage/section/privacy":
		return "打开隐私页面"
	case path == "/bootstrap/portal":
		return "预热门户"
	case method == http.MethodPost && path == "/v2/jslogs":
		return "新接口保活"
	case method == http.MethodGet && path == "/account/manage/forwardemail":
		return "读取转发邮箱"
	case method == http.MethodPost && path == "/account/manage/email/private/add":
		return "生成候选隐私邮箱"
	case method == http.MethodPut && path == "/account/manage/email/private/add/complete":
		return "确认创建隐私邮箱"
	case method == http.MethodGet && strings.HasPrefix(path, "/account/manage/email/private/") && strings.HasSuffix(path, ".em"):
		return "确认隐私邮箱详情"
	default:
		return strings.TrimSpace(method + " " + path)
	}
}

func isCodedError(err error, code string) bool {
	var coded codedError
	return errors.As(err, &coded) && coded.code == code
}
