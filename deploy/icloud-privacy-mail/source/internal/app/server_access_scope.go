package app

import (
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) authorized(r *http.Request, mailbox Mailbox) bool {
	queryKey := strings.TrimSpace(r.URL.Query().Get("key"))
	if constantTimeEqual(queryKey, mailbox.APIToken) {
		return true
	}
	candidates := []string{
		strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "),
		r.Header.Get("X-API-Key"),
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if constantTimeEqual(candidate, mailbox.APIToken) {
			return true
		}
		if strings.TrimSpace(s.cfg.APIKey) != "" && constantTimeEqual(candidate, s.cfg.APIKey) {
			return true
		}
	}
	return false
}

func (s *Server) authorizedGlobalAPI(r *http.Request) bool {
	want := strings.TrimSpace(s.cfg.APIKey)
	if want == "" {
		return false
	}
	candidates := []string{
		strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "),
		r.Header.Get("X-API-Key"),
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if constantTimeEqual(candidate, want) {
			return true
		}
	}
	return false
}

func scopedOwnerID(r *http.Request, store *FileStore) string {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		session, user, ok := store.WebSessionByToken(cookie.Value)
		if ok && !session.IsAdmin && user.ID != "" {
			return user.ID
		}
	}
	return ""
}

func requestOwnerID(r *http.Request, store *FileStore) string {
	if isInternalICloudRequest(r) {
		if adminID := singleActiveAdminID(store.Users()); adminID != "" {
			return adminID
		}
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_, user, ok := store.WebSessionByToken(cookie.Value)
		if ok && user.ID != "" {
			return user.ID
		}
	}
	return ""
}

func (s *Server) scopedState(r *http.Request) State {
	if s.isAdminRequest(r) {
		return s.store.Snapshot()
	}
	if key := scopedOwnerID(r, s.store); key != "" {
		return s.store.SnapshotForOwner(key)
	}
	return s.store.Snapshot()
}

func (s *Server) scopedMailboxListState(r *http.Request) State {
	if s.isAdminRequest(r) {
		return s.store.MailboxListSnapshotForOwner("")
	}
	if ownerID := scopedOwnerID(r, s.store); ownerID != "" {
		return s.store.MailboxListSnapshotForOwner(ownerID)
	}
	return s.store.MailboxListSnapshotForOwner("")
}

func (s *Server) sessionForRequest(r *http.Request) (ICloudSession, bool) {
	session, _, ok := s.sessionForRequestWithOwner(r)
	return session, ok
}

func (s *Server) sessionForOwner(ownerID string) (ICloudSession, bool) {
	if ownerID = strings.TrimSpace(ownerID); ownerID != "" {
		return s.store.ICloudSessionForOwner(ownerID)
	}
	return s.store.ICloudSession()
}

func (s *Server) sessionForOwnerAccount(ownerID, accountID string) (ICloudSession, bool) {
	if ownerID = strings.TrimSpace(ownerID); ownerID != "" {
		if session, ok := s.store.ICloudSessionForOwnerAccount(ownerID, accountID); ok {
			return session, true
		}
		if user, ok := s.store.UserByID(ownerID); ok && user.IsAdmin {
			return s.store.ICloudSessionForOwnerAccount("", accountID)
		}
		return ICloudSession{}, false
	}
	return s.store.ICloudSessionForOwnerAccount("", accountID)
}

func (s *Server) sessionsForOwner(ownerID, accountID string) []ICloudSession {
	accountID = strings.TrimSpace(accountID)
	if accountID != "" {
		if session, ok := s.sessionForOwnerAccount(ownerID, accountID); ok {
			return []ICloudSession{session}
		}
		return nil
	}
	if ownerID = strings.TrimSpace(ownerID); ownerID != "" {
		sessions := s.store.ICloudSessionsForOwner(ownerID)
		if len(sessions) > 0 {
			return sessions
		}
		if user, ok := s.store.UserByID(ownerID); ok && user.IsAdmin {
			return s.store.ICloudSessionsForOwner("")
		}
		return nil
	}
	return s.store.ICloudSessionsForOwner("")
}

func (s *Server) sessionsForOwnerAccounts(ownerID string, accountIDs []string) []ICloudSession {
	accountIDs = normalizeAccountIDSelection("", accountIDs)
	if len(accountIDs) == 0 {
		return s.sessionsForOwner(ownerID, "")
	}
	sessions := make([]ICloudSession, 0, len(accountIDs))
	for _, accountID := range accountIDs {
		if session, ok := s.sessionForOwnerAccount(ownerID, accountID); ok {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

func (s *Server) sessionForMailbox(ownerID, accountID string) (ICloudSession, bool) {
	if session, ok := s.sessionForOwnerAccount(ownerID, accountID); ok {
		return session, true
	}
	sessions := s.sessionsForOwner(ownerID, "")
	if len(sessions) == 1 {
		return sessions[0], true
	}
	return ICloudSession{}, false
}

func (s *Server) imapSessionForMailbox(ownerID string, mailbox Mailbox) (ICloudSession, LoginState, bool) {
	if session, ok := s.sessionForOwnerAccount(ownerID, mailbox.AccountID); ok {
		if state, ok := iCloudIMAPLoginState(session); ok {
			return session, state, true
		}
	}
	type match struct {
		session ICloudSession
		state   LoginState
	}
	var found []match
	for _, session := range s.sessionsForOwner(ownerID, "") {
		if state, ok := iCloudIMAPLoginState(session); ok {
			found = append(found, match{session: session, state: state})
		}
	}
	if len(found) == 1 {
		return found[0].session, found[0].state, true
	}
	return ICloudSession{}, LoginState{}, false
}

func (s *Server) imapStateForMailbox(ownerID string, mailbox Mailbox) (LoginState, bool) {
	_, state, ok := s.imapSessionForMailbox(ownerID, mailbox)
	return state, ok
}

type imapSessionResolver struct {
	byAccount map[string]imapSessionMatch
	single    imapSessionMatch
	hasSingle bool
}

type imapSessionMatch struct {
	session ICloudSession
	state   LoginState
}

func (s *Server) imapSessionResolverForOwner(ownerID string) imapSessionResolver {
	sessions := s.sessionsForOwner(ownerID, "")
	resolver := imapSessionResolver{byAccount: make(map[string]imapSessionMatch, len(sessions))}
	matches := make([]imapSessionMatch, 0, len(sessions))
	for _, session := range sessions {
		state, ok := iCloudIMAPLoginState(session)
		if !ok {
			continue
		}
		match := imapSessionMatch{session: session, state: state}
		if accountID := strings.TrimSpace(session.AccountID); accountID != "" {
			resolver.byAccount[accountID] = match
		}
		matches = append(matches, match)
	}
	if len(matches) == 1 {
		resolver.single = matches[0]
		resolver.hasSingle = true
	}
	return resolver
}

func (r imapSessionResolver) sessionForMailbox(mailbox Mailbox) (ICloudSession, LoginState, bool) {
	if match, ok := r.byAccount[strings.TrimSpace(mailbox.AccountID)]; ok {
		return match.session, match.state, true
	}
	if r.hasSingle {
		return r.single.session, r.single.state, true
	}
	return ICloudSession{}, LoginState{}, false
}

func imapStateKey(state LoginState) string {
	return strings.ToLower(strings.TrimSpace(firstNonEmpty(state.IMAPEmail, state.IMAPUsername))) + "|" +
		strings.ToLower(strings.TrimSpace(firstNonEmpty(state.IMAPHost, defaultICloudIMAPHost))) + "|" +
		strconv.Itoa(state.IMAPPort)
}
