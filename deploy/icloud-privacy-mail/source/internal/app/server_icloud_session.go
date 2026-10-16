package app

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (s *Server) handleICloudSession(w http.ResponseWriter, r *http.Request) {
	sessions := s.publicSessionsForRequest(r)
	session := publicSession(nil)
	if len(sessions) > 0 {
		session = sessions[0]
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "session": session, "sessions": sessions})
}

func (s *Server) handleCheckICloudSession(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID string `json:"account_id"`
	}
	if r.ContentLength != 0 {
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	} else {
		_ = r.Body.Close()
	}
	ownerID := requestOwnerID(r, s.store)
	sessions := s.sessionsForOwner(ownerID, payload.AccountID)
	if len(sessions) == 0 {
		writeError(w, http.StatusBadRequest, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先保存旧接口登录态", true))
		return
	}

	checkedAt := time.Now()
	client := NewICloudClient()
	failed := 0
	var lastErr error
	for _, session := range sessions {
		checkedSession, ok, err := checkSavedLoginStatesWithIMAP(r.Context(), client, session, checkedAt, s.checkSavedIMAPLogin)
		if !ok {
			failed++
			lastErr = err
		}
		if saveErr := s.store.SaveICloudSessionForOwner(ownerID, checkedSession); saveErr != nil {
			writeError(w, http.StatusInternalServerError, saveErr)
			return
		}
		if !ok {
			s.logger.Warn("login state check failed", "account_id", session.AccountID, "err", err)
		}
	}
	publicSessions := s.publicSessionsForOwner(ownerID)
	first := publicSession(nil)
	if len(publicSessions) > 0 {
		first = publicSessions[0]
	}
	if failed == len(sessions) {
		message := "全部登录态检测失败"
		if lastErr != nil {
			message += "：" + lastErr.Error()
		}
		s.logger.Warn("login state check failed", "err", lastErr)
		writeError(w, http.StatusBadGateway, errCode("icloud_session_check_failed", message, true))
		return
	}
	message := "登录态检测正常"
	if failed > 0 {
		message = fmt.Sprintf("登录态部分检测成功：成功 %d，失败 %d", len(sessions)-failed, failed)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"checked_at":    formatTime(checkedAt),
		"message":       message,
		"session":       first,
		"sessions":      publicSessions,
		"checked_count": len(sessions),
		"failed_count":  failed,
	})
}

func (s *Server) handleSaveICloudIMAPLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID   string `json:"account_id"`
		Email       string `json:"email"`
		AppPassword string `json:"app_password"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	ownerID := requestOwnerID(r, s.store)
	accountID := strings.TrimSpace(payload.AccountID)
	email := normalizeICloudIMAPEmail(payload.Email)
	// Keep password close to reference (TrimSpace). Successful login may use a
	// cleaned candidate inside CheckICloudIMAPLogin; persist the cleaned compact
	// form after a successful check so later re-checks stay stable.
	appPassword := strings.TrimSpace(payload.AppPassword)
	if cleaned := normalizeICloudAppPassword(appPassword); cleaned != "" {
		if compact := strings.ReplaceAll(cleaned, "-", ""); len(compact) == 16 {
			appPassword = strings.ToLower(compact)
		} else {
			appPassword = cleaned
		}
	}
	if email == "" {
		writeError(w, http.StatusBadRequest, errCode("imap_email_missing", "请输入 iCloud 邮箱账号", false))
		return
	}
	if appPassword == "" {
		writeError(w, http.StatusBadRequest, errCode("imap_app_password_missing", "请输入 App 专用密码", false))
		return
	}
	if accountID != "" && !s.canAccessAccountID(r, accountID) {
		writeError(w, http.StatusForbidden, errCode("account_forbidden", "无权操作该 Apple 账号", false))
		return
	}

	if err := s.checkSavedIMAPLogin(r.Context(), email, appPassword); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	now := time.Now()
	session, err := s.sessionForIMAPSave(ownerID, accountID, email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if session.SavedAt.IsZero() {
		session.SavedAt = now
	}
	session.OwnerID = ownerID
	session.AppleID = firstNonEmpty(strings.TrimSpace(session.AppleID), email)
	session = withICloudIMAPLoginState(session, LoginState{
		Kind:              LoginStateICloudIMAP,
		Host:              defaultICloudIMAPHost,
		Origin:            "imaps://" + defaultICloudIMAPHost,
		SavedAt:           now,
		IMAPEmail:         email,
		IMAPUsername:      email,
		IMAPHost:          defaultICloudIMAPHost,
		IMAPPort:          defaultICloudIMAPPort,
		IMAPAppPassword:   appPassword,
		LastCheckedAt:     now,
		LastCheckOK:       true,
		LastStatusMessage: "取码登录正常",
	})
	session.LastCheckedAt = now
	session.LastCheckOK = true
	session.LastStatusMessage = "取码登录正常"
	if err := s.store.SaveICloudSessionForOwner(ownerID, session); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sessions := s.publicSessionsForOwner(ownerID)
	publicSession := publicSessionForAccountID(sessions, session.AccountID)
	if strings.TrimSpace(session.AccountID) == "" {
		publicSession = publicSessionForAppleID(sessions, session.AppleID)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "取码登录已保存并检测正常",
		"session":  publicSession,
		"sessions": sessions,
	})
}

func (s *Server) handleCheckICloudIMAPLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID string `json:"account_id"`
	}
	if r.ContentLength != 0 {
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	} else {
		_ = r.Body.Close()
	}
	ownerID := requestOwnerID(r, s.store)
	sessions := s.sessionsForOwner(ownerID, payload.AccountID)
	if len(sessions) == 0 {
		writeError(w, http.StatusBadRequest, errCode("imap_session_missing", "未保存取码登录，请先保存 iCloud 邮箱账号和 App 专用密码", true))
		return
	}

	checkedAt := time.Now()
	checks := 0
	failed := 0
	var lastErr error
	for _, session := range sessions {
		state, ok := iCloudIMAPLoginState(session)
		if !ok {
			continue
		}
		checks++
		if err := s.checkSavedIMAPLogin(r.Context(), state.IMAPEmail, state.IMAPAppPassword); err != nil {
			failed++
			lastErr = err
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = false
			state.LastStatusMessage = "取码登录异常：" + err.Error()
		} else {
			state.LastCheckedAt = checkedAt
			state.LastCheckOK = true
			state.LastStatusMessage = "取码登录正常"
		}
		session = withICloudIMAPLoginState(session, state)
		if err := s.store.SaveICloudSessionForOwner(ownerID, session); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	if checks == 0 {
		writeError(w, http.StatusBadRequest, errCode("imap_session_missing", "未保存取码登录，请先保存 iCloud 邮箱账号和 App 专用密码", true))
		return
	}
	publicSessions := s.publicSessionsForOwner(ownerID)
	if failed == checks {
		message := "取码登录检测失败"
		if lastErr != nil {
			message += "：" + lastErr.Error()
		}
		writeError(w, http.StatusBadGateway, errCode("imap_session_check_failed", message, true))
		return
	}
	message := "取码登录检测正常"
	if failed > 0 {
		message = fmt.Sprintf("取码登录部分检测成功：成功 %d，失败 %d", checks-failed, failed)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"message":       message,
		"checked_at":    formatTime(checkedAt),
		"sessions":      publicSessions,
		"checked_count": checks,
		"failed_count":  failed,
	})
}

func (s *Server) checkSavedIMAPLogin(ctx context.Context, email, appPassword string) error {
	if s.checkIMAPLogin != nil {
		return s.checkIMAPLogin(ctx, email, appPassword)
	}
	return CheckICloudIMAPLogin(ctx, email, appPassword)
}

func (s *Server) sessionForIMAPSave(ownerID, accountID, email string) (ICloudSession, error) {
	accountID = strings.TrimSpace(accountID)
	email = normalizeICloudIMAPEmail(email)
	if accountID != "" {
		accountAppleID := ""
		if account, ok := s.store.FindAccountByID(accountID); ok {
			accountAppleID = strings.TrimSpace(account.AppleID)
		}
		if session, ok := s.sessionForOwnerAccount(ownerID, accountID); ok {
			session.AppleID = firstNonEmpty(strings.TrimSpace(session.AppleID), accountAppleID, email)
			return session, nil
		}
		return ICloudSession{OwnerID: ownerID, AccountID: accountID, AppleID: firstNonEmpty(accountAppleID, email)}, nil
	}
	if session, ok := s.sessionForOwnerCreateEmailLocalPart(ownerID, email); ok {
		return session, nil
	}
	if session, ok := s.sessionForOwnerIMAPEmail(ownerID, email); ok {
		return session, nil
	}
	return ICloudSession{OwnerID: ownerID, AppleID: email}, nil
}

func (s *Server) sessionForOwnerCreateEmailLocalPart(ownerID, email string) (ICloudSession, bool) {
	local := emailLocalPart(email)
	if local == "" {
		return ICloudSession{}, false
	}
	if match, ok := s.sessionForOwnerCreateEmailLocalPartMatch(ownerID, local, false); ok {
		return match, true
	}
	return s.sessionForOwnerCreateEmailLocalPartMatch(ownerID, local, true)
}

func (s *Server) sessionForOwnerCreateEmailLocalPartMatch(ownerID, local string, allowAppleSecondaryPrefix bool) (ICloudSession, bool) {
	var match ICloudSession
	found := false
	for _, session := range s.sessionsForOwner(ownerID, "") {
		if !appleAccountLoginSaved(session) && !iCloudWebLoginSaved(session) {
			continue
		}
		if !emailLocalPartsMatch(emailLocalPart(session.AppleID), local, allowAppleSecondaryPrefix) {
			continue
		}
		if found && !sameICloudSessionPublicIdentity(match, session) {
			return ICloudSession{}, false
		}
		match = session
		found = true
	}
	return match, found
}

func emailLocalPartsMatch(accountLocal, imapLocal string, allowAppleSecondaryPrefix bool) bool {
	accountLocal = strings.ToLower(strings.TrimSpace(accountLocal))
	imapLocal = strings.ToLower(strings.TrimSpace(imapLocal))
	if accountLocal == "" || imapLocal == "" {
		return false
	}
	if accountLocal == imapLocal {
		return true
	}
	if !allowAppleSecondaryPrefix {
		return false
	}
	return "q"+accountLocal == imapLocal
}

func (s *Server) sessionForOwnerIMAPEmail(ownerID, email string) (ICloudSession, bool) {
	email = normalizeICloudIMAPEmail(email)
	for _, session := range s.sessionsForOwner(ownerID, "") {
		if email != "" && strings.EqualFold(normalizeICloudIMAPEmail(session.AppleID), email) {
			return session, true
		}
		if state, ok := iCloudIMAPLoginState(session); ok && strings.EqualFold(normalizeICloudIMAPEmail(state.IMAPEmail), email) {
			return session, true
		}
	}
	return ICloudSession{}, false
}

func emailLocalPart(value string) string {
	value = normalizeICloudIMAPEmail(value)
	if value == "" {
		return ""
	}
	if at := strings.Index(value, "@"); at > 0 {
		return value[:at]
	}
	return ""
}

func sameICloudSessionPublicIdentity(a, b ICloudSession) bool {
	if strings.TrimSpace(a.AccountID) != "" && strings.TrimSpace(b.AccountID) != "" {
		return constantTimeEqual(a.AccountID, b.AccountID)
	}
	if strings.TrimSpace(a.AppleID) != "" && strings.TrimSpace(b.AppleID) != "" {
		return strings.EqualFold(strings.TrimSpace(a.AppleID), strings.TrimSpace(b.AppleID))
	}
	return false
}
