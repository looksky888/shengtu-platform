package app

import (
	"net/http"
	"strings"
	"time"
)

func (s *Server) handleHome(w http.ResponseWriter, _ *http.Request) {
	s.writeTemplate(w, "templates/index.html")
}

func (s *Server) handleLoginPage(w http.ResponseWriter, _ *http.Request) {
	s.writeTemplate(w, "templates/login.html")
}

func (s *Server) handleManagePage(w http.ResponseWriter, _ *http.Request) {
	s.writeTemplate(w, "templates/manage.html")
}

func (s *Server) handleCreateSettings(w http.ResponseWriter, r *http.Request) {
	ownerID := requestOwnerID(r, s.store)
	if ownerID == "" {
		writeError(w, http.StatusUnauthorized, errCode("auth_required", "请先登录账号", false))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"settings": publicCreateSettings(s.store.CreateSettingsForOwner(ownerID)),
	})
}

func (s *Server) handleSaveCreateSettings(w http.ResponseWriter, r *http.Request) {
	ownerID := requestOwnerID(r, s.store)
	if ownerID == "" {
		writeError(w, http.StatusUnauthorized, errCode("auth_required", "请先登录账号", false))
		return
	}
	var payload struct {
		Label                         string   `json:"label"`
		Note                          string   `json:"note"`
		AccountIDs                    []string `json:"account_ids"`
		CreateChannel                 string   `json:"create_channel"`
		SchedulerCreateChannel        string   `json:"scheduler_create_channel"`
		AppleAccountTwoFactorMethod   string   `json:"apple_account_two_factor_method"`
		ICloudWebTwoFactorMethod      string   `json:"icloud_web_two_factor_method"`
		SchedulerIntervalMinutes      int      `json:"scheduler_interval_minutes"`
		SchedulerRoundIntervalSeconds int      `json:"scheduler_round_interval_seconds"`
		MailboxPageSize               int      `json:"mailbox_page_size"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	accountIDs := normalizeAccountIDSelection("", payload.AccountIDs)
	for _, accountID := range accountIDs {
		if !s.canAccessAccountIDForOwner(ownerID, accountID) {
			writeError(w, http.StatusNotFound, errCode("account_not_found", "账号不存在，配置未保存", false))
			return
		}
	}
	settings, err := s.store.SaveCreateSettingsForOwner(ownerID, CreateSettings{
		Label:                         payload.Label,
		Note:                          payload.Note,
		AccountIDs:                    accountIDs,
		CreateChannel:                 payload.CreateChannel,
		SchedulerCreateChannel:        payload.SchedulerCreateChannel,
		AppleAccountTwoFactorMethod:   payload.AppleAccountTwoFactorMethod,
		ICloudWebTwoFactorMethod:      payload.ICloudWebTwoFactorMethod,
		SchedulerIntervalMinutes:      payload.SchedulerIntervalMinutes,
		SchedulerRoundIntervalSeconds: payload.SchedulerRoundIntervalSeconds,
		MailboxPageSize:               payload.MailboxPageSize,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "创建配置已保存到服务器",
		"settings": publicCreateSettings(settings),
	})
}

func (s *Server) writeTemplate(w http.ResponseWriter, name string) {
	data, err := webFS.ReadFile(name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, errCode("template_missing", "面板模板缺失", false))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}

func (s *Server) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	user, err := s.store.CreateUser(payload.Username, payload.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	token, session, err := s.store.CreateWebSession(user.ID, user.IsAdmin, 30*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.setSessionCookie(w, r, token, session.ExpiresAt)
	writeJSON(w, http.StatusCreated, map[string]any{
		"success": true,
		"user":    publicUserFromUser(user),
		"message": firstNonEmpty(map[bool]string{true: "注册成功，当前账号是管理员", false: "注册成功"}[user.IsAdmin]),
	})
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	user, err := s.store.AuthenticateUser(payload.Username, payload.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	token, session, err := s.store.CreateWebSession(user.ID, user.IsAdmin, 30*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.setSessionCookie(w, r, token, session.ExpiresAt)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"user":    publicUserFromUser(user),
	})
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	if session, user, ok := s.currentWebSession(r); ok {
		out := publicUserFromUser(user)
		out.IsAdmin = session.IsAdmin || user.IsAdmin
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "authenticated": true, "user": out})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "authenticated": false})
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = s.store.DeleteWebSession(cookie.Value)
	}
	s.clearSessionCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (s *Server) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	session, currentUser, ok := s.currentWebSession(r)
	if !ok || (!session.IsAdmin && !currentUser.IsAdmin) {
		writeError(w, http.StatusForbidden, errCode("admin_required", "需要管理员权限", false))
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, errCode("user_id_missing", "缺少账号 ID", false))
		return
	}
	if constantTimeEqual(currentUser.ID, id) {
		writeError(w, http.StatusBadRequest, errCode("cannot_delete_self", "不能删除当前登录的管理员账号", false))
		return
	}
	user, ok := s.store.UserByID(id)
	if !ok {
		writeError(w, http.StatusNotFound, errCode("user_not_found", "账号不存在", false))
		return
	}
	if user.IsAdmin {
		writeError(w, http.StatusBadRequest, errCode("cannot_delete_admin_user", "不能删除管理员账号", false))
		return
	}
	result, err := s.store.DeleteUser(id)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": result})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	state := s.scopedState(r)
	currentUser := publicUser{}
	authenticated := false
	if session, user, ok := s.currentWebSession(r); ok {
		authenticated = true
		currentUser = publicUserFromUser(user)
		currentUser.IsAdmin = session.IsAdmin || user.IsAdmin
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":            true,
		"service":            "icloud-privacy-mail",
		"api_key_configured": strings.TrimSpace(s.cfg.APIKey) != "",
		"base_url":           requestBaseURL(r),
		"account_scoped":     scopedOwnerID(r, s.store) != "",
		"authenticated":      authenticated,
		"current_user":       currentUser,
		"accounts":           len(state.Accounts),
		"mailboxes":          len(state.Mailboxes),
		"messages":           len(state.Messages),
		"icloud_session":     s.publicSessionForRequest(r),
		"icloud_sessions":    s.publicSessionsForRequest(r),
		"version":            currentVersionInfo(),
	})
}

func (s *Server) handleManageData(w http.ResponseWriter, r *http.Request) {
	state := s.scopedState(r)
	users := state.Users
	if s.isAdminRequest(r) {
		users = s.store.Users()
	}
	publicUsers := make([]publicUser, 0, len(users))
	for _, user := range users {
		publicUsers = append(publicUsers, publicUserFromUser(user))
	}
	accounts := make([]publicAccount, 0, len(state.Accounts))
	for _, account := range state.Accounts {
		accounts = append(accounts, s.publicAccount(account))
	}
	mailboxes := make([]publicMailbox, 0, len(state.Mailboxes))
	for _, mailbox := range state.Mailboxes {
		mailboxes = append(mailboxes, s.publicMailbox(r, mailbox))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":         true,
		"is_admin":        s.isAdminRequest(r),
		"users":           publicUsers,
		"user_summaries":  s.publicUserSummaries(users, state),
		"accounts":        accounts,
		"mailboxes":       mailboxes,
		"messages":        len(state.Messages),
		"icloud_session":  s.publicSessionForRequest(r),
		"icloud_sessions": s.publicSessionsForRequest(r),
	})
}
