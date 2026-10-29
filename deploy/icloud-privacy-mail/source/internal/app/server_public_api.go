package app

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(s.cfg.APIKey) != "" && !s.authorizedGlobalAPI(r) {
		writeError(w, http.StatusUnauthorized, errCode("invalid_api_key", "API Key 错误", false))
		return
	}
	session, ok := s.store.ICloudSession()
	sessionReady := func(item ICloudSession) bool {
		return appleAccountManageReady(item) ||
			(item.IsICloudPlus && item.CanCreateHME && len(item.Cookies) > 0) ||
			iCloudIMAPLoginSaved(item)
	}
	icloudActive := ok && sessionReady(session)
	if !icloudActive {
		for _, scopedSession := range s.store.Snapshot().ICloudSessions {
			if sessionReady(scopedSession) {
				icloudActive = true
				break
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"service":       "icloud-privacy-mail",
		"api_active":    strings.TrimSpace(s.cfg.APIKey) != "",
		"icloud_active": icloudActive,
		"time":          formatTime(time.Now()),
	})
}

func (s *Server) handleClaimMailbox(w http.ResponseWriter, r *http.Request) {
	if !s.authorizedGlobalAPI(r) && !isInternalICloudRequest(r) {
		writeError(w, http.StatusUnauthorized, errCode("global_api_key_required", "自动取号需要配置并提交全局 API Key", false))
		return
	}
	var payload struct {
		Project string `json:"project"`
		Purpose string `json:"purpose"`
		Count   int    `json:"count"`
	}
	if r.ContentLength != 0 {
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	} else {
		_ = r.Body.Close()
	}
	// Soft-lock note only. Permanent "已注册" is written by claim-status after register success.
	note := strings.TrimSpace(payload.Project)
	if strings.TrimSpace(payload.Purpose) != "" {
		note = strings.TrimSpace(note + " " + payload.Purpose)
	}
	if note == "" {
		note = "外部 API 注册中"
	} else {
		note = "外部 API 注册中：" + note
	}
	mailbox, err := s.store.ClaimAvailableMailbox(payload.Project, note)
	if err != nil {
		writeError(w, http.StatusOK, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"mailbox": s.publicMailbox(r, mailbox),
	})
}

func (s *Server) handleClaimMailboxStatus(w http.ResponseWriter, r *http.Request) {
	if !s.authorizedGlobalAPI(r) && !isInternalICloudRequest(r) {
		writeError(w, http.StatusUnauthorized, errCode("global_api_key_required", "更新邮箱注册标签需要内部模块或全局 API Key", false))
		return
	}
	var payload struct {
		Project string   `json:"project"`
		Emails  []string `json:"emails"`
		Claimed *bool    `json:"claimed"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(payload.Emails) == 0 || len(payload.Emails) > 500 || payload.Claimed == nil {
		writeError(w, http.StatusBadRequest, errCode("invalid_claim_status", "邮箱数量必须是 1-500，且必须提供 claimed", false))
		return
	}
	updated, missing, err := s.store.SetMailboxClaimed(payload.Project, payload.Emails, *payload.Claimed)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "updated": updated, "missing": missing})
}

func (s *Server) handleLookupMailboxes(w http.ResponseWriter, r *http.Request) {
	if !s.authorizedGlobalAPI(r) && !isInternalICloudRequest(r) {
		writeError(w, http.StatusUnauthorized, errCode("global_api_key_required", "查询邮箱 API 需要配置并提交全局 API Key", false))
		return
	}
	var payload struct {
		Emails []string `json:"emails"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(payload.Emails) == 0 || len(payload.Emails) > 500 {
		writeError(w, http.StatusBadRequest, errCode("invalid_email_count", "邮箱数量必须是 1-500", false))
		return
	}

	seen := make(map[string]struct{}, len(payload.Emails))
	missing := make([]string, 0)
	mailboxes := make([]publicMailbox, 0, len(payload.Emails))
	for _, rawEmail := range payload.Emails {
		email := strings.ToLower(strings.TrimSpace(rawEmail))
		if email == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}
		mailbox, ok := s.store.FindMailboxByEmail(email)
		if !ok {
			missing = append(missing, email)
			continue
		}
		mailboxes = append(mailboxes, s.publicMailbox(r, mailbox))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":   true,
		"mailboxes": mailboxes,
		"missing":   missing,
	})
}

func (s *Server) handleExportRuntimeData(w http.ResponseWriter, r *http.Request) {
	ownerID := scopedOwnerID(r, s.store)
	state := s.scopedState(r)
	payload := struct {
		ExportedAt      string          `json:"exported_at"`
		Scope           string          `json:"scope"`
		Owner           string          `json:"owner,omitempty"`
		DataPath        string          `json:"data_path,omitempty"`
		NextID          int             `json:"next_id"`
		Accounts        []Account       `json:"accounts"`
		Mailboxes       []Mailbox       `json:"mailboxes"`
		ICloudSession   *ICloudSession  `json:"icloud_session,omitempty"`
		ICloudSessions  []ICloudSession `json:"icloud_sessions,omitempty"`
		MessageCount    int             `json:"message_count"`
		Messages        []Message       `json:"messages,omitempty"`
		IncludeMessages bool            `json:"include_messages"`
	}{
		ExportedAt:      formatTime(time.Now()),
		Scope:           "all",
		NextID:          state.NextID,
		Accounts:        state.Accounts,
		Mailboxes:       state.Mailboxes,
		ICloudSession:   state.ICloudSession,
		ICloudSessions:  state.ICloudSessions,
		MessageCount:    len(state.Messages),
		IncludeMessages: truthy(r.URL.Query().Get("include_messages")),
	}
	if ownerID != "" {
		payload.Scope = "user"
		payload.Owner = s.ownerName(ownerID)
	} else {
		payload.DataPath = s.store.Path()
	}
	if payload.IncludeMessages {
		payload.Messages = state.Messages
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	filename := "icloud-privacy-mail-state-" + time.Now().Format("20060102-150405") + ".json"
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(append(data, '\n'))
}

func (s *Server) handleExportMailboxAPIs(w http.ResponseWriter, r *http.Request) {
	s.writeMailboxTextExport(w, r, mailboxExportAPI)
}

func (s *Server) handleExportMailboxEmails(w http.ResponseWriter, r *http.Request) {
	s.writeMailboxTextExport(w, r, mailboxExportEmail)
}

type mailboxExportMode string

const (
	mailboxExportAPI   mailboxExportMode = "api"
	mailboxExportEmail mailboxExportMode = "email"
)

type mailboxExportFormat struct {
	ext         string
	contentType string
	separator   string
	csv         bool
	jsonl       bool
}

func (s *Server) writeMailboxTextExport(w http.ResponseWriter, r *http.Request, mode mailboxExportMode) {
	format, err := parseMailboxExportFormat(r.URL.Query().Get("format"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	state := s.mailboxExportState(r)
	accountID := normalizeExportAccountID(r.URL.Query().Get("account_id"))
	mailboxes := filterMailboxesForExport(state.Mailboxes, accountID)
	var out strings.Builder
	if format.jsonl {
		for _, mailbox := range mailboxes {
			record := s.mailboxExportRecord(r, mailbox, mode)
			if len(record) == 0 {
				continue
			}
			var line any
			if mode == mailboxExportEmail {
				line = map[string]string{"email": record[0]}
			} else {
				line = map[string]string{"email": record[0], "api": record[1]}
			}
			data, err := json.Marshal(line)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			out.Write(data)
			out.WriteByte('\n')
		}
	} else if format.csv {
		writer := csv.NewWriter(&out)
		if format.separator == "\t" {
			writer.Comma = '\t'
		}
		for _, mailbox := range mailboxes {
			record := s.mailboxExportRecord(r, mailbox, mode)
			if len(record) == 0 {
				continue
			}
			if err := writer.Write(record); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	} else {
		for _, mailbox := range mailboxes {
			record := s.mailboxExportRecord(r, mailbox, mode)
			if len(record) == 0 {
				continue
			}
			out.WriteString(strings.Join(record, format.separator))
			out.WriteByte('\n')
		}
	}

	prefix := "icloud-mailbox-apis"
	if mode == mailboxExportEmail {
		prefix = "icloud-mailbox-emails"
	}
	if accountID != "" {
		prefix += "-" + safeFilenamePart(accountID)
	}
	filename := prefix + "-" + time.Now().Format("20060102-150405") + "." + format.ext
	w.Header().Set("Content-Type", format.contentType)
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, out.String())
}

func (s *Server) mailboxExportState(r *http.Request) State {
	ownerID := strings.TrimSpace(r.URL.Query().Get("owner_id"))
	if s.isAdminRequest(r) && ownerID != "" && !strings.EqualFold(ownerID, "all") {
		return s.store.SnapshotForOwner(ownerID)
	}
	return s.scopedState(r)
}

func normalizeExportAccountID(value string) string {
	value = strings.TrimSpace(value)
	switch strings.ToLower(value) {
	case "", "all", "__all", "__current", "current":
		return ""
	default:
		return value
	}
}

func filterMailboxesForExport(mailboxes []Mailbox, accountID string) []Mailbox {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return mailboxes
	}
	out := make([]Mailbox, 0, len(mailboxes))
	for _, mailbox := range mailboxes {
		if constantTimeEqual(accountID, strings.TrimSpace(mailbox.AccountID)) {
			out = append(out, mailbox)
		}
	}
	return out
}

func safeFilenamePart(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func (s *Server) mailboxExportRecord(r *http.Request, mailbox Mailbox, mode mailboxExportMode) []string {
	email := strings.TrimSpace(mailbox.Email)
	if email == "" {
		return nil
	}
	if mode == mailboxExportEmail {
		return []string{email}
	}
	return []string{email, s.mailboxAPIURL(r, mailbox)}
}

func parseMailboxExportFormat(value string) (mailboxExportFormat, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "txt", "text", "list":
		return mailboxExportFormat{ext: "txt", contentType: "text/plain; charset=utf-8", separator: "----"}, nil
	case "csv":
		return mailboxExportFormat{ext: "csv", contentType: "text/csv; charset=utf-8", separator: ",", csv: true}, nil
	case "tsv", "tab":
		return mailboxExportFormat{ext: "tsv", contentType: "text/tab-separated-values; charset=utf-8", separator: "\t", csv: true}, nil
	case "jsonl", "ndjson":
		return mailboxExportFormat{ext: "jsonl", contentType: "application/x-ndjson; charset=utf-8", jsonl: true}, nil
	default:
		return mailboxExportFormat{}, errCode("invalid_export_format", "导出格式只支持 txt、csv、tsv、jsonl", false)
	}
}
