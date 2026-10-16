package app

import (
	"net/http"
	"strings"
)

func (s *Server) handleCreateMailbox(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID string `json:"account_id"`
		Label     string `json:"label"`
		Email     string `json:"email"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if !s.canAccessAccountID(r, payload.AccountID) {
		writeError(w, http.StatusNotFound, errCode("account_not_found", "账号不存在", false))
		return
	}
	mailbox, err := s.store.AddMailboxForOwner(requestOwnerID(r, s.store), payload.AccountID, payload.Label, payload.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"success": true, "mailbox": s.publicMailbox(r, mailbox)})
}

func (s *Server) handleVerifyMailbox(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canAccessMailboxID(r, id) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	active := true
	mailbox, err := s.store.SetMailboxStatus(id, &active, &active, StatusAvailable, "手动验证通过")
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "mailbox": s.publicMailbox(r, mailbox)})
}

func (s *Server) handleDisableMailbox(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canAccessMailboxID(r, id) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	inactive := false
	mailbox, err := s.store.SetMailboxStatus(id, &inactive, nil, StatusDisabled, "API 已停用")
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "mailbox": s.publicMailbox(r, mailbox)})
}

func (s *Server) handleSetMailboxStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canAccessMailboxID(r, id) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	var payload struct {
		Status       string `json:"status"`
		Note         string `json:"note"`
		APIActive    *bool  `json:"api_active"`
		ICloudActive *bool  `json:"icloud_active"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if status != "" && !validMailboxStatus(status) {
		writeError(w, http.StatusBadRequest, errCode("invalid_status", "状态只能是 available、used、failed、active、disabled", false))
		return
	}
	mailbox, err := s.store.SetMailboxStatus(id, payload.APIActive, payload.ICloudActive, status, payload.Note)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "mailbox": s.publicMailbox(r, mailbox)})
}

func (s *Server) handleSetMailboxTag(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canAccessMailboxID(r, id) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	var payload struct {
		Tag      string `json:"tag"`
		TagColor string `json:"tag_color"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	mailbox, err := s.store.SetMailboxTag(id, payload.Tag, payload.TagColor)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "mailbox": s.publicMailbox(r, mailbox)})
}

func (s *Server) handleSyncMailbox(w http.ResponseWriter, r *http.Request) {
	mailbox, ok := s.store.FindMailboxByID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	if !s.canAccessMailbox(r, mailbox) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	after, err := parseAfter(r.URL.Query().Get("after"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	count, err := s.syncMailbox(r.Context(), mailbox, after, strings.TrimSpace(r.URL.Query().Get("keyword")))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "synced": count})
}

func (s *Server) handleCleanRemoteMailbox(w http.ResponseWriter, r *http.Request) {
	mailbox, ok := s.store.FindMailboxByID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	if !s.canAccessMailbox(r, mailbox) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	var payload struct {
		MoveSynced bool `json:"move_synced"`
		EmptyTrash bool `json:"empty_trash"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if !payload.MoveSynced && !payload.EmptyTrash {
		payload.MoveSynced = true
	}
	session, ok := s.sessionForMailbox(mailbox.OwnerID, mailbox.AccountID)
	if !ok {
		writeError(w, http.StatusBadRequest, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先保存旧接口登录态", true))
		return
	}

	client := NewICloudClient()
	result := ICloudMailCleanupResult{}
	if payload.MoveSynced {
		remoteIDs := icloudRemoteIDsFromMessages(s.store.MessagesForMailbox(mailbox.ID))
		moved, err := client.MoveRemoteMessagesToTrash(r.Context(), session, remoteIDs)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		result.MovedToTrash += moved.MovedToTrash
		result.Skipped += moved.Skipped
	}
	if payload.EmptyTrash {
		destroyed, err := client.EmptyTrash(r.Context(), session)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		result.Destroyed = destroyed
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "cleanup": result})
}

func (s *Server) handleCleanRemoteMailboxes(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		AccountID  string `json:"account_id"`
		MoveSynced bool   `json:"move_synced"`
		EmptyTrash bool   `json:"empty_trash"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if !payload.MoveSynced && !payload.EmptyTrash {
		payload.MoveSynced = true
		payload.EmptyTrash = true
	}
	accountID := strings.TrimSpace(payload.AccountID)
	if accountID != "" && !s.canAccessAccountID(r, accountID) {
		writeError(w, http.StatusNotFound, errCode("account_not_found", "账号不存在", false))
		return
	}

	state := s.scopedState(r)
	client := NewICloudClient()
	result := ICloudMailCleanupResult{}
	cleanedSessions := map[string]bool{}
	handledMailboxes := 0
	failedMailboxes := 0
	for _, mailbox := range state.Mailboxes {
		if accountID != "" && !constantTimeEqual(accountID, strings.TrimSpace(mailbox.AccountID)) {
			continue
		}
		if !mailbox.ICloudActive || mailbox.Status == StatusDisabled {
			result.Skipped++
			continue
		}
		session, ok := s.sessionForMailbox(mailbox.OwnerID, mailbox.AccountID)
		if !ok {
			result.Skipped++
			continue
		}
		sessionKey := firstNonEmpty(session.OwnerID, mailbox.OwnerID, "__legacy__") + ":" + firstNonEmpty(session.AccountID, session.DSID, session.AppleID, mailbox.AccountID, "__session__")
		if payload.MoveSynced {
			remoteIDs := icloudRemoteIDsFromMessages(s.store.MessagesForMailbox(mailbox.ID))
			moved, err := client.MoveRemoteMessagesToTrash(r.Context(), session, remoteIDs)
			if err != nil {
				s.logger.Warn("remote mail cleanup move failed", "mailbox_id", mailbox.ID, "err", err)
				failedMailboxes++
				continue
			}
			result.MovedToTrash += moved.MovedToTrash
			result.Skipped += moved.Skipped
		}
		handledMailboxes++
		if payload.EmptyTrash && !cleanedSessions[sessionKey] {
			destroyed, err := client.EmptyTrash(r.Context(), session)
			if err != nil {
				s.logger.Warn("remote mail cleanup empty trash failed", "account_id", mailbox.AccountID, "err", err)
				failedMailboxes++
				continue
			}
			result.Destroyed += destroyed
			cleanedSessions[sessionKey] = true
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":          true,
		"cleanup":          result,
		"mailboxes":        handledMailboxes,
		"failed_mailboxes": failedMailboxes,
	})
}

func (s *Server) handleDeleteMailbox(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canAccessMailboxID(r, id) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	if err := s.store.DeleteMailbox(id); err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}
