package httpapi

import (
	"errors"
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

var passwordResetCodeDelivery = service.EmailCodeDelivery{
	Sent: true, RetryAfterSeconds: 60, ExpiresInSeconds: 600,
}

func (a *App) handlePasswordResetEmailCode(w http.ResponseWriter, r *http.Request) {
	if !allowPasswordResetEmailAttempt(r) {
		util.WriteError(w, http.StatusTooManyRequests, "找回密码请求过于频繁，请稍后再试")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if !readJSONOr400(w, r, &body) {
		return
	}
	email := util.Clean(body.Email)
	if err := service.ValidateRegistrationEmail(email); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	deviceID := a.ensureDeviceID(w, r)
	if a.email == nil || !a.email.Enabled() {
		util.WriteError(w, http.StatusServiceUnavailable, "平台尚未配置密码找回邮件，请联系管理员")
		return
	}
	if !a.auth.EmailExists(email) {
		util.WriteJSON(w, http.StatusOK, passwordResetCodeDelivery)
		return
	}
	result, err := a.email.SendPasswordResetCode(r.Context(), email, authClientIP(r), deviceID)
	if err == nil {
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	if a.logger != nil {
		a.logger.Warning("password reset email delivery failed", "error", err.Error())
	}
	// Keep the same public response for unknown accounts, per-email limits, and
	// delivery failures. Otherwise callers could enumerate registered emails.
	util.WriteJSON(w, http.StatusOK, passwordResetCodeDelivery)
}

func (a *App) handlePasswordReset(w http.ResponseWriter, r *http.Request) {
	if !allowPasswordResetAttempt(r) {
		util.WriteError(w, http.StatusTooManyRequests, "密码重置尝试过于频繁，请稍后再试")
		return
	}
	var body struct {
		Email       string `json:"email"`
		EmailCode   string `json:"email_code"`
		NewPassword string `json:"new_password"`
	}
	if !readJSONOr400(w, r, &body) {
		return
	}
	email := util.Clean(body.Email)
	if err := service.ValidateRegistrationEmail(email); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := service.ValidateAccountPassword(body.NewPassword); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if a.email == nil || !a.email.Enabled() {
		util.WriteError(w, http.StatusServiceUnavailable, "平台尚未配置密码找回邮件，请联系管理员")
		return
	}
	deviceID := a.ensureDeviceID(w, r)
	verificationID, err := a.email.VerifyPasswordResetCode(email, body.EmailCode, deviceID)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "邮箱或验证码无效、已过期，请重新获取")
		return
	}
	if err := a.email.MarkCodeUsed(verificationID); err != nil {
		util.WriteError(w, http.StatusBadRequest, "邮箱或验证码无效、已过期，请重新获取")
		return
	}
	if err := a.auth.ResetPasswordByEmail(email, body.NewPassword); err != nil {
		if errors.Is(err, service.ErrPasswordResetAccountUnavailable) {
			util.WriteError(w, http.StatusBadRequest, "邮箱或验证码无效、已过期，请重新获取")
			return
		}
		if a.logger != nil {
			a.logger.Error("password reset failed", "error", err.Error())
		}
		util.WriteError(w, http.StatusServiceUnavailable, "密码重置暂时失败，请重新获取验证码后再试")
		return
	}
	util.WriteJSON(w, http.StatusOK, okResponse{OK: true})
}
