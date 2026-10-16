package app

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"time"
)

func (s *Server) publicSessionForRequest(r *http.Request) publicICloudSession {
	session, ok := s.sessionForRequest(r)
	if !ok {
		return publicSession(nil)
	}
	return s.publicSession(&session)
}

func (s *Server) publicSessionsForRequest(r *http.Request) []publicICloudSession {
	return s.publicSessionsForOwner(requestOwnerID(r, s.store))
}

func publicCreateSettings(settings CreateSettings) map[string]any {
	settings = normalizeCreateSettings(settings.OwnerID, settings)
	createChannel := normalizeMailboxCreateChannel(mailboxCreateChannel(settings.CreateChannel))
	schedulerChannel := normalizeMailboxCreateChannel(mailboxCreateChannel(settings.SchedulerCreateChannel))
	return map[string]any{
		"label":                            settings.Label,
		"note":                             settings.Note,
		"account_ids":                      append([]string(nil), settings.AccountIDs...),
		"create_channel":                   string(createChannel),
		"create_channel_label":             mailboxCreateChannelLabel(createChannel),
		"scheduler_create_channel":         string(schedulerChannel),
		"scheduler_create_channel_label":   mailboxCreateChannelLabel(schedulerChannel),
		"apple_account_two_factor_method":  normalizeAppleTwoFactorMethod(settings.AppleAccountTwoFactorMethod),
		"icloud_web_two_factor_method":     normalizeAppleTwoFactorMethod(settings.ICloudWebTwoFactorMethod),
		"scheduler_interval_minutes":       settings.SchedulerIntervalMinutes,
		"scheduler_round_interval_seconds": settings.SchedulerRoundIntervalSeconds,
		"mailbox_page_size":                settings.MailboxPageSize,
		"updated_at":                       formatTime(settings.UpdatedAt),
	}
}

func (s *Server) publicSessionsForOwner(ownerID string) []publicICloudSession {
	sessions := s.sessionsForOwner(ownerID, "")
	out := make([]publicICloudSession, 0, len(sessions))
	for _, session := range sessions {
		out = append(out, s.publicSession(&session))
	}
	return out
}

func (s *Server) sessionForRequestWithOwner(r *http.Request) (ICloudSession, string, bool) {
	if ownerID := requestOwnerID(r, s.store); ownerID != "" {
		if session, ok := s.store.ICloudSessionForOwner(ownerID); ok {
			return session, ownerID, true
		}
	}
	if s.isAdminRequest(r) {
		session, ok := s.store.ICloudSession()
		return session, "", ok
	}
	ownerID := scopedOwnerID(r, s.store)
	session, ok := s.store.ICloudSessionForOwner(ownerID)
	return session, ownerID, ok
}

func (s *Server) currentWebSession(r *http.Request) (WebSession, User, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return WebSession{}, User{}, false
	}
	return s.store.WebSessionByToken(cookie.Value)
}

func (s *Server) authorizedUserSession(r *http.Request) bool {
	session, user, ok := s.currentWebSession(r)
	return ok && !session.IsAdmin && user.ID != ""
}

func (s *Server) authorizedAdminSession(r *http.Request) bool {
	session, user, ok := s.currentWebSession(r)
	return ok && (session.IsAdmin || user.IsAdmin)
}

func (s *Server) isAdminRequest(r *http.Request) bool {
	return s.authorizedAdminSession(r)
}

func (s *Server) allowsUserSession(r *http.Request) bool {
	if r.Method == http.MethodGet && r.URL.Path == "/api/status" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/update/status" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/create-settings" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/manage/data" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/runtime/export" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/runtime/export-mailbox-apis" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/runtime/export-mailbox-emails" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/icloud/session" {
		return true
	}
	if r.Method == http.MethodPost {
		switch r.URL.Path {
		case "/api/create-settings",
			"/api/icloud/protocol-login/start",
			"/api/icloud/protocol-login/2fa",
			"/api/apple-account/login/start",
			"/api/apple-account/login/2fa",
			"/api/icloud/session/check",
			"/api/icloud/imap-login/save",
			"/api/icloud/imap-login/check",
			"/api/icloud/mailboxes/create",
			"/api/icloud/mailboxes/sync",
			"/api/icloud/scheduler/start",
			"/api/icloud/scheduler/stop",
			"/api/icloud/scheduler/logs/clear":
			return true
		}
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/icloud/scheduler/status" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/accounts" {
		return true
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/accounts" {
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/mailboxes" {
		return true
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/mailboxes" {
		return true
	}
	if strings.HasPrefix(r.URL.Path, "/api/mailboxes/") {
		return true
	}
	return false
}

func (s *Server) canAccessMailboxID(r *http.Request, id string) bool {
	mailbox, ok := s.store.FindMailboxByID(id)
	return ok && s.canAccessMailbox(r, mailbox)
}

func (s *Server) canAccessMailbox(r *http.Request, mailbox Mailbox) bool {
	if s.isAdminRequest(r) {
		return true
	}
	ownerID := scopedOwnerID(r, s.store)
	if ownerID == "" {
		return true
	}
	return constantTimeEqual(ownerID, mailbox.OwnerID)
}

func (s *Server) canAccessAccountID(r *http.Request, id string) bool {
	id = strings.TrimSpace(id)
	if id == "" {
		return true
	}
	if s.isAdminRequest(r) {
		return true
	}
	ownerID := scopedOwnerID(r, s.store)
	if ownerID == "" {
		return true
	}
	state := s.store.SnapshotForOwner(ownerID)
	for _, account := range state.Accounts {
		if account.ID == id {
			return true
		}
	}
	return false
}

func (s *Server) canAccessAccountIDs(r *http.Request, ids []string) bool {
	for _, id := range normalizeAccountIDSelection("", ids) {
		if !s.canAccessAccountID(r, id) {
			return false
		}
	}
	return true
}

func (s *Server) canAccessAccountIDForOwner(ownerID, id string) bool {
	id = strings.TrimSpace(id)
	if id == "" {
		return true
	}
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return true
	}
	state := s.store.SnapshotForOwner(ownerID)
	for _, account := range state.Accounts {
		if account.ID == id {
			return true
		}
	}
	return false
}

func (s *Server) requiresAdmin(r *http.Request) bool {
	if r.URL.Path == "/" {
		return false
	}
	if strings.HasPrefix(r.URL.Path, "/api/auth/") {
		return false
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/v1/health" {
		return false
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/mailboxes/claim" {
		return false
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/mailboxes/claim-status" {
		return false
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/mailboxes/lookup" {
		return false
	}
	if r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/v1/mailboxes/") && strings.HasSuffix(r.URL.Path, "/code") {
		return false
	}
	if r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/mailboxes/") && strings.HasSuffix(r.URL.Path, "/code") {
		return false
	}
	return strings.HasPrefix(r.URL.Path, "/api/")
}

func constantTimeEqual(candidate, want string) bool {
	candidate = strings.TrimSpace(candidate)
	want = strings.TrimSpace(want)
	if candidate == "" || want == "" || len(candidate) != len(want) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(candidate), []byte(want)) == 1
}

func (s *Server) setSessionCookie(w http.ResponseWriter, r *http.Request, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   s.secureCookie(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   s.secureCookie(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) secureCookie(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		return true
	}
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(s.cfg.PublicBaseURL)), "https://")
}
