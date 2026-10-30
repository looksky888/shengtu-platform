package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/terms"
	"chatgpt2api/internal/util"
	"chatgpt2api/internal/version"
	"errors"
	"net/http"
	"strings"
)

// CurrentTermsVersion re-exports the canonical terms version for tests/helpers.
const CurrentTermsVersion = terms.Version

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	if err := requireAcceptedTerms(body); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	accountName := util.Clean(body["username"])
	if !checkLoginAllowed(r, accountName) {
		util.WriteError(w, http.StatusTooManyRequests, "登录尝试过于频繁，请稍后再试")
		return
	}
	// Opt-in remember: default false when field omitted (safer shared-device default).
	rememberMe := util.ToBool(body["remember_me"])
	identity, token, err := a.auth.LoginPasswordWithRemember(accountName, util.Clean(body["password"]), rememberMe)
	if err != nil {
		recordLoginFailure(r, accountName)
		util.WriteError(w, http.StatusBadRequest, mapAuthUserError(err))
		return
	}
	setAuthSessionCookie(w, r, token, rememberMe)
	a.logTermsAccepted(*identity, "login", body)
	a.writeLoginResponse(w, *identity, token)
}

func (a *App) handleSession(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	// Only refresh browser cookies for actual session tokens (never leak API keys
	// into cookies, and preserve the session's original remember_me preference).
	if identity.Kind == service.AuthKindSession {
		if token := requestAuthToken(r); token != "" {
			setAuthSessionCookie(w, r, token, identity.RememberMe)
		}
	}
	a.writeLoginResponse(w, identity, "")
}

func (a *App) handleAccountRegister(w http.ResponseWriter, r *http.Request) {
	if !a.config.RegistrationEnabled() {
		util.WriteError(w, http.StatusForbidden, "当前未开放注册，请联系管理员在设置中开启「允许用户注册」")
		return
	}
	if !allowRegisterAttempt(r) {
		util.WriteError(w, http.StatusTooManyRequests, "注册尝试过于频繁，请稍后再试")
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	if err := requireAcceptedTerms(body); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	clientIP := authClientIP(r)
	email := util.Clean(body["email"])
	password := util.Clean(body["password"])
	if err := service.ValidateAccountPassword(password); err != nil {
		util.WriteError(w, http.StatusBadRequest, mapAuthUserError(err))
		return
	}
	deviceID := a.readDeviceID(r, util.Clean(body["device_id"]))
	if deviceID == "" {
		// Issue device binding even when quota check uses IP only.
		deviceID = a.ensureDeviceID(w, r)
	} else {
		// Soft rotation: re-sign cookie with current device secret if needed.
		a.refreshDeviceCookieIfStale(w, r, deviceID)
	}
	// Verify email OTP BEFORE reserving a registration risk slot so a user typo in
	// the verification code never triggers or burns IP/device risk reservations.
	verificationID, err := a.email.VerifyRegistrationCode(email, util.Clean(body["email_code"]), deviceID)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	var reserveID string
	if a.regQuota != nil {
		reserveID, err = a.regQuota.Reserve(service.RegistrationRiskInput{
			ClientIP: clientIP,
			DeviceID: deviceID,
			Email:    email,
		})
		if err != nil {
			a.writeRegistrationRiskError(w, err, clientIP)
			return
		}
	}
	inviteCode := firstNonEmpty(util.Clean(body["invite_code"]), util.Clean(r.URL.Query().Get("invite_code")))
	rememberMe := util.ToBool(body["remember_me"])
	identity, token, err := a.completeEmailRegistration(
		reserveID, verificationID, email, password, util.Clean(body["name"]), rememberMe,
	)
	if err != nil {
		var finalizeErr *emailRegistrationFinalizeError
		if !errors.As(err, &finalizeErr) {
			util.WriteError(w, http.StatusBadRequest, mapAuthUserError(err))
			return
		}
		if a.logger != nil {
			a.logger.Error("email registration transaction failed", "email", email, "error", err.Error())
		}
		util.WriteError(w, http.StatusServiceUnavailable, "注册未完成，请稍后重试；如邮箱已被占用请联系管理员")
		return
	}
	if _, _, _, err := a.credits.AddOnce(identity.ID, service.DefaultSignupCreditAmount, service.CreditReasonSignup, identity.ID); err != nil && a.logger != nil {
		a.logger.Warning("signup credit reward failed", "user_id", identity.ID, "error", err.Error())
	}
	// Valid invite codes reward the inviter once; invalid/empty codes are ignored.
	if inviterID := a.credits.ResolveInviteCode(inviteCode); inviterID != "" {
		if _, _, awarded, err := a.credits.RewardInvite(inviterID, identity.ID); err != nil {
			if a.logger != nil {
				a.logger.Warning("invite reward failed", "inviter_id", inviterID, "invitee_id", identity.ID, "error", err.Error())
			}
		} else if awarded && a.logger != nil {
			a.logger.Info("invite reward granted", "inviter_id", inviterID, "invitee_id", identity.ID, "code", inviteCode)
		}
	}
	setAuthSessionCookie(w, r, token, rememberMe)
	a.logTermsAccepted(*identity, "register", body)
	a.writeLoginResponse(w, *identity, token)
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	token := requestAuthToken(r)
	clearAuthSessionCookie(w, r)
	if _, err := a.auth.RevokeSession(token); err != nil {
		util.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, okResponse{OK: true})
}

func requireAcceptedTerms(body map[string]any) error {
	// Accept common boolean encodings from JSON clients.
	accepted := util.ToBool(body["accept_terms"]) || util.ToBool(body["accepted_terms"])
	if !accepted {
		return errAcceptedTermsRequired()
	}
	// Optional version pin: if client sends a version, it must match current.
	if ver := strings.TrimSpace(util.Clean(body["terms_version"])); ver != "" && ver != terms.Version {
		return errAcceptedTermsVersionMismatch()
	}
	return nil
}

func errAcceptedTermsRequired() error {
	return termsError("请先阅读并同意《" + terms.Title + "》")
}

func errAcceptedTermsVersionMismatch() error {
	return termsError("用户协议版本已更新，请重新阅读并勾选同意")
}

type termsError string

func (e termsError) Error() string { return string(e) }

func mapAuthUserError(err error) string {
	if err == nil {
		return "请求失败"
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	switch {
	case msg == "" || msg == "invalid credentials" || strings.Contains(lower, "invalid username") || strings.Contains(lower, "invalid password"):
		return "用户名或密码错误"
	case strings.Contains(lower, "already exists") || strings.Contains(msg, "已存在"):
		return "用户名已存在"
	case strings.Contains(msg, "邮箱已注册"):
		return "该邮箱已注册"
	case strings.Contains(msg, "已被禁用") || strings.Contains(lower, "disabled"):
		return "用户已被禁用"
	case strings.Contains(msg, "当前密码") || strings.Contains(lower, "current password"):
		if strings.Contains(msg, "错误") || strings.Contains(lower, "incorrect") || strings.Contains(lower, "wrong") {
			return "当前密码错误"
		}
		return "请输入当前密码"
	case strings.Contains(lower, "too short") || strings.Contains(msg, "at least") || strings.Contains(msg, "不能少于"):
		return "密码过短，请至少使用 8 位"
	case strings.Contains(msg, "不能超过"):
		return "密码过长，请不超过 128 位"
	case strings.Contains(lower, "username") && strings.Contains(lower, "required"):
		return "请输入用户名"
	case strings.Contains(lower, "password") && strings.Contains(lower, "required"):
		return "请输入密码"
	default:
		// Prefer Chinese messages already returned by service layer.
		return msg
	}
}

func (a *App) logTermsAccepted(identity service.Identity, action string, body map[string]any) {
	if a == nil || a.logger == nil {
		return
	}
	ver := strings.TrimSpace(util.Clean(body["terms_version"]))
	if ver == "" {
		ver = terms.Version
	}
	a.logger.Info("terms accepted",
		"action", action,
		"user_id", identity.ID,
		"username", identity.Name,
		"provider", identity.Provider,
		"terms_version", ver,
	)
}

func (a *App) writeLoginResponse(w http.ResponseWriter, identity service.Identity, token string) {
	permissions := a.identityPermissions(identity)
	util.WriteJSON(w, http.StatusOK, loginResponse{
		OK: true, Version: version.Get(), Token: token,
		Role: identity.Role, RoleID: identity.RoleID, RoleName: identity.RoleName,
		SubjectID: identity.ID, Name: identity.Name, Provider: identity.Provider,
		CredentialID: identity.CredentialID, CredentialName: identity.CredentialName,
		MenuPaths: permissions.MenuPaths, APIPermissions: permissions.APIPermissions,
		Menus: service.FilterMenuPermissions(permissions.MenuPaths),
	})
}
