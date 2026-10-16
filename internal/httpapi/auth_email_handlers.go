package httpapi

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleRegistrationEmailCode(w http.ResponseWriter, r *http.Request) {
	if !a.config.RegistrationEnabled() {
		util.WriteError(w, http.StatusForbidden, "当前未开放注册")
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	email := util.Clean(body["email"])
	if err := service.ValidateRegistrationEmail(email); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	deviceID := a.ensureDeviceID(w, r)
	if a.auth.EmailExists(email) {
		// Do not reveal whether an email is already registered.
		util.WriteJSON(w, http.StatusOK, service.EmailCodeDelivery{Sent: true, RetryAfterSeconds: 60, ExpiresInSeconds: 600})
		return
	}
	result, err := a.email.SendRegistrationCode(r.Context(), email, authClientIP(r), deviceID)
	if err == nil {
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	var limited *service.EmailRateLimitError
	if errors.As(err, &limited) {
		seconds := int(math.Ceil(limited.RetryAfter.Seconds()))
		if seconds < 1 {
			seconds = int(time.Minute.Seconds())
		}
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		util.WriteError(w, http.StatusTooManyRequests, limited.Error())
		return
	}
	if errors.Is(err, service.ErrRegistrationEmailUnavailable) {
		util.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if a.logger != nil {
		a.logger.Warning("registration email delivery failed", "error", err.Error())
	}
	util.WriteError(w, http.StatusBadGateway, "注册邮件发送失败，请稍后重试或联系管理员")
}
