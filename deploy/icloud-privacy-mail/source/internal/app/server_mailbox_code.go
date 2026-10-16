package app

import (
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mailbox, ok := s.store.FindMailboxByID(id)
	if !ok || !s.canAccessMailbox(r, mailbox) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	messages := s.store.MessagesForMailbox(id)
	out := make([]publicMessage, 0, len(messages))
	for _, msg := range messages {
		out = append(out, publicMessage{
			ID:         msg.ID,
			OwnerID:    msg.OwnerID,
			Owner:      s.ownerName(msg.OwnerID),
			MailboxID:  msg.MailboxID,
			Subject:    msg.Subject,
			From:       msg.From,
			Body:       msg.Body,
			ReceivedAt: formatTime(msg.ReceivedAt),
			CreatedAt:  formatTime(msg.CreatedAt),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "messages": out})
}

func (s *Server) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canAccessMailboxID(r, id) {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	var payload struct {
		Subject    string `json:"subject"`
		From       string `json:"from"`
		Body       string `json:"body"`
		ReceivedAt string `json:"received_at"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	receivedAt := time.Now()
	if strings.TrimSpace(payload.ReceivedAt) != "" {
		parsed, err := time.Parse(time.RFC3339, payload.ReceivedAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, errCode("invalid_received_at", "received_at 必须是 RFC3339 时间", false))
			return
		}
		receivedAt = parsed
	}
	msg, err := s.store.AddMessage(id, payload.Subject, payload.From, payload.Body, receivedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"success": true, "message": msg})
}

func (s *Server) handleMailboxCodeByID(w http.ResponseWriter, r *http.Request) {
	mailbox, ok := s.store.FindMailboxByID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	s.writeMailboxCode(w, r, mailbox)
}

func (s *Server) handleMailboxCodeByEmail(w http.ResponseWriter, r *http.Request) {
	email, err := url.PathUnescape(r.PathValue("email"))
	if err != nil {
		writeError(w, http.StatusBadRequest, errCode("invalid_email", "邮箱路径非法", false))
		return
	}
	mailbox, ok := s.store.FindMailboxByEmail(email)
	if !ok {
		writeError(w, http.StatusNotFound, errCode("mailbox_not_found", "邮箱不存在", false))
		return
	}
	s.writeMailboxCode(w, r, mailbox)
}

func (s *Server) writeMailboxCode(w http.ResponseWriter, r *http.Request, mailbox Mailbox) {
	// External API callers must present mailbox token / global API key.
	// Admin web session and authenticated main-app internal proxy may
	// fetch codes without the mailbox key — list/messages already work this way.
	if !s.authorized(r, mailbox) {
		switch {
		case isInternalICloudRequest(r):
			// main app already required admin auth before proxying
		case s.isAdminRequest(r):
			// sidecar admin panel session
		case s.authorizedUserSession(r) && s.canAccessMailbox(r, mailbox):
			// tenant user with ownership
		default:
			writeError(w, http.StatusUnauthorized, errCode("invalid_api_key", "API Key 错误", false))
			return
		}
	}
	if !mailbox.APIActive || mailbox.Status == StatusDisabled {
		writeError(w, http.StatusForbidden, errCode("api_disabled", "API 已停用", false))
		return
	}
	if !mailbox.ICloudActive {
		writeError(w, http.StatusForbidden, errCode("icloud_inactive", "邮箱已停用或 iCloud 状态不可用", false))
		return
	}
	s.markMailWatcherActive(mailbox.ID)
	after, err := parseAfter(r.URL.Query().Get("after"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	keyword := strings.TrimSpace(r.URL.Query().Get("keyword"))
	if keyword == "" {
		keyword = "OpenAI"
	}
	now := time.Now()
	codeAfter := mailboxCodeAfter(after, now)
	allowStale := truthy(r.URL.Query().Get("allow_stale"))
	cacheOnly := truthy(r.URL.Query().Get("cache"))
	peekOnly := truthy(r.URL.Query().Get("peek")) || truthy(r.URL.Query().Get("preview"))
	skipMessageID := strings.TrimSpace(mailbox.LastCodeMessageID)
	if peekOnly {
		skipMessageID = ""
	}
	messages := s.store.MessagesForMailbox(mailbox.ID)
	if cacheOnly {
		if msg, code, ok := latestMailboxCode(messages, codeAfter, keyword, now); ok {
			s.writeMailboxCodeSuccess(w, mailbox, msg, code, "", false)
			return
		}
		writeError(w, http.StatusOK, errCode("no_code", "暂未收到验证码", true))
		return
	}
	if msg, code, ok := latestMailboxCodeSkipping(messages, codeAfter, keyword, now, skipMessageID); ok {
		s.writeMailboxCodeSuccess(w, mailbox, msg, code, "", !peekOnly)
		return
	}

	result := s.waitMailboxCode(r.Context(), mailbox, codeAfter, keyword, true, skipMessageID, s.mailboxCodeWaitDuration(r))
	if result.syncErr != nil {
		s.logger.Warn("icloud sync failed", "mailbox_id", mailbox.ID, "err", result.syncErr)
	}
	if result.ok {
		s.writeMailboxCodeSuccess(w, mailbox, result.message, result.code, staleCacheMessage(result.syncErr), !peekOnly)
		return
	}
	if msg, code, ok := latestMailboxCodeSkipping(s.store.MessagesForMailbox(mailbox.ID), codeAfter, keyword, time.Now(), skipMessageID); ok {
		s.writeMailboxCodeSuccess(w, mailbox, msg, code, staleCacheMessage(result.syncErr), !peekOnly)
		return
	}
	if result.syncErr != nil && allowStale {
		if msg, code, ok := latestMailboxCodeSkipping(s.store.MessagesForMailbox(mailbox.ID), codeAfter, keyword, time.Now(), skipMessageID); ok {
			s.writeMailboxCodeSuccess(w, mailbox, msg, code, "取码同步失败，当前验证码来自本地缓存", !peekOnly)
			return
		}
	}
	if result.syncErr != nil && !allowStale {
		writeError(w, http.StatusBadGateway, errCode("mail_sync_failed", "同步验证码邮件失败，已拒绝返回本地旧验证码；请检查取码登录或稍后重试", true))
		return
	}
	writeError(w, http.StatusOK, errCode("no_code", "暂未收到验证码", true))
}

func (s *Server) writeMailboxCodeSuccess(w http.ResponseWriter, mailbox Mailbox, msg Message, code string, staleMessage string, markServed bool) {
	if markServed {
		if _, err := s.store.SetMailboxLastCode(mailbox.ID, msg.ID, time.Now()); err != nil {
			s.logger.Warn("remember mailbox code failed", "mailbox_id", mailbox.ID, "message_id", msg.ID, "err", err)
			writeError(w, http.StatusInternalServerError, errCode("remember_code_failed", "保存验证码发放记录失败，请稍后重试", true))
			return
		}
	}
	payload := map[string]any{
		"success":     true,
		"email":       mailbox.Email,
		"code":        code,
		"subject":     msg.Subject,
		"received_at": formatTime(msg.ReceivedAt),
		"message_id":  msg.ID,
	}
	if staleMessage != "" {
		payload["stale_cache"] = true
		payload["sync_error"] = staleMessage
	}
	writeJSON(w, http.StatusOK, payload)
}

func staleCacheMessage(err error) string {
	if err == nil {
		return ""
	}
	return "取码同步失败，当前验证码来自本地缓存"
}

func mailboxCodeAfter(after, now time.Time) time.Time {
	if now.IsZero() {
		now = time.Now()
	}
	cutoff := now.Add(-mailboxCodeFreshWindow)
	if after.After(cutoff) {
		return after
	}
	return cutoff
}

func latestMailboxCode(messages []Message, after time.Time, keyword string, now time.Time) (Message, string, bool) {
	return latestMailboxCodeSkipping(messages, after, keyword, now, "")
}

func latestMailboxCodeSkipping(messages []Message, after time.Time, keyword string, now time.Time, skipMessageID string) (Message, string, bool) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		keyword = "OpenAI"
	}
	skipMessageID = strings.TrimSpace(skipMessageID)
	after = mailboxCodeAfter(after, now)
	sort.SliceStable(messages, func(i, j int) bool {
		left := firstNonZeroTime(messages[i].ReceivedAt, messages[i].CreatedAt)
		right := firstNonZeroTime(messages[j].ReceivedAt, messages[j].CreatedAt)
		return left.After(right)
	})
	for _, msg := range messages {
		if skipMessageID != "" && msg.ID == skipMessageID {
			continue
		}
		msgTime := firstNonZeroTime(msg.ReceivedAt, msg.CreatedAt)
		if msgTime.IsZero() || msgTime.Before(after) {
			continue
		}
		if !mailboxMessageMatchesKeyword(msg, keyword) {
			continue
		}
		text := msg.Subject + "\n" + msg.Body
		code := extractOTP(text)
		if code == "" {
			continue
		}
		return msg, code, true
	}
	return Message{}, "", false
}

func mailboxMessageMatchesKeyword(msg Message, keyword string) bool {
	normalized := strings.ToLower(strings.TrimSpace(keyword))
	switch normalized {
	case "", "auto", "all", "*", "openai":
		// Keep the historical OpenAI behavior broad while giving the UI an
		// explicit automatic mode for all supported verification-code formats.
		return true
	}
	text := strings.ToLower(msg.Subject + "\n" + msg.From + "\n" + msg.Body)
	if provider, ok := strings.CutPrefix(normalized, "provider:"); ok {
		for _, alias := range mailboxProviderAliases(provider) {
			if strings.Contains(text, alias) {
				return true
			}
		}
		return false
	}
	return strings.Contains(text, normalized)
}

func mailboxProviderAliases(provider string) []string {
	switch strings.TrimSpace(provider) {
	case "openai":
		return []string{"openai", "chatgpt"}
	case "grok":
		return []string{"grok", "xai", "x.ai"}
	case "higgsfield":
		return []string{"higgsfield"}
	default:
		return nil
	}
}

func truthy(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}
