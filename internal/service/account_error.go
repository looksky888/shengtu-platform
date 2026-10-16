package service

import (
	"net/http"
	"strings"
)

func (s *AccountService) ApplyAccountError(accessToken, event string, err error) (string, bool) {
	if err == nil {
		return "", false
	}
	return s.ApplyAccountErrorMessage(accessToken, event, err.Error())
}

// ApplyAccountErrorMessage classifies failures and routes them through disposeAccount
// so acquire / stream / refresh share one policy (graded delete / cooldown / quarantine).
// The returned message is derived from the dispose *action*, not only the grade.
func (s *AccountService) ApplyAccountErrorMessage(accessToken, event, message string) (string, bool) {
	accessToken = strings.TrimSpace(accessToken)
	message = strings.TrimSpace(message)
	if accessToken == "" || message == "" {
		return message, false
	}
	grade := ClassifyAccountFailure(event, message)
	if grade == DisposalNone {
		return message, false
	}
	action := s.disposeAccount(accessToken, event, message, grade)
	return disposeActionMessage(action, message)
}

// disposeActionMessage maps dispose outcomes to user-facing copy and "handled" flags.
// handled=true means callers may treat the account as switched/disposed for this attempt.
func disposeActionMessage(action DisposeAction, original string) (string, bool) {
	switch action {
	case DisposeDeletedPermanent, DisposeMarkedInvalid, DisposeQuarantineWriteFail:
		// quarantine_write_failed: cabin write failed — account stays in pool as 异常; still surface as ban for this attempt.
		return "检测到封号", true
	case DisposeRefreshRecovered:
		// Token probed OK and stayed in pool — not a ban; do not force account switch messaging.
		return original, false
	case DisposeQuarantinedTemporary, DisposeCooledTemporary:
		return temporaryAccountFailureMessage(original), true
	case DisposeSoftFailUnknown:
		return temporaryAccountFailureMessage(original), true
	case DisposeNone:
		return original, false
	default:
		return original, true
	}
}

func temporaryAccountFailureMessage(original string) string {
	switch {
	case IsUpstreamRateLimitSignal(original):
		return "检测到上游速率限制"
	case IsCloudflareSignal(original):
		return "检测到上游挑战拦截"
	case IsUpstreamTimeoutSignal(original):
		return "上游响应超时"
	case IsUpstreamGatewaySignal(original):
		return "上游网关异常"
	case IsNetworkFlakySignal(original):
		return "上游网络波动"
	case IsUpstreamAccountQuotaSignal(original):
		return "账号生图额度已用尽"
	default:
		return original
	}
}

func IsAccountInvalidErrorMessage(message string) bool {
	text := signalText(message)
	if text == "" || isBootstrapErrorMessage(text) {
		return false
	}
	return IsDeadTokenSignal(text) || hasAccountHTTPStatus(text, http.StatusUnauthorized)
}

func isPermanentAccountInvalidForEvent(event, message string) bool {
	text := signalText(message)
	if text == "" || isBootstrapErrorMessage(text) {
		return false
	}
	if IsDeadTokenSignal(text) {
		return true
	}
	if !hasAccountHTTPStatus(text, http.StatusUnauthorized) {
		return false
	}
	// Image stream 401 can be transient session noise; only explicit invalid texts are permanent there.
	return strings.TrimSpace(event) != "image_stream"
}

func IsAccountRateLimitedErrorMessage(message string) bool {
	message = strings.TrimSpace(message)
	if message == "" || isBootstrapErrorMessage(message) {
		return false
	}
	// 429-style rate limit OR account quota / generation cap (both temporary for pool).
	return matchAnySignalKind(message, signalKindRateLimit, signalKindAccountQuota)
}
