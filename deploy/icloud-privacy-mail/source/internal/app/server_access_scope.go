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
	accountID = strings.TrimSpace(accountID)
	if accountID != "" {
		if session, ok := s.sessionForOwnerAccount(ownerID, accountID); ok {
			return session, true
		}
	}
	sessions := s.sessionsForOwner(ownerID, "")
	if accountID != "" {
		if account, ok := s.store.FindAccountByID(accountID); ok {
			if matched, ok := uniqueSessionMatchingAccountAppleID(sessions, account.AppleID); ok {
				return matched, true
			}
		}
	}
	if len(sessions) == 1 {
		return sessions[0], true
	}
	return ICloudSession{}, false
}

func (s *Server) imapSessionForMailbox(ownerID string, mailbox Mailbox) (ICloudSession, LoginState, bool) {
	resolver := s.imapSessionResolverForOwner(ownerID)
	return resolver.sessionForMailbox(mailbox)
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
	if len(matches) > 0 && s.store != nil {
		accounts := s.store.MailboxListSnapshotForOwner(ownerID).Accounts
		if len(accounts) == 0 && strings.TrimSpace(ownerID) != "" {
			if user, ok := s.store.UserByID(strings.TrimSpace(ownerID)); ok && user.IsAdmin {
				accounts = s.store.MailboxListSnapshotForOwner("").Accounts
			}
		}
		for _, account := range accounts {
			accountID := strings.TrimSpace(account.ID)
			if accountID == "" {
				continue
			}
			if _, exists := resolver.byAccount[accountID]; exists {
				continue
			}
			if match, ok := uniqueIMAPMatchForAppleID(matches, account.AppleID); ok {
				resolver.byAccount[accountID] = match
			}
		}
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

func uniqueSessionMatchingAccountAppleID(sessions []ICloudSession, appleID string) (ICloudSession, bool) {
	appleID = strings.TrimSpace(appleID)
	if appleID == "" {
		return ICloudSession{}, false
	}
	var matched ICloudSession
	found := false
	for _, session := range sessions {
		if !strings.EqualFold(strings.TrimSpace(session.AppleID), appleID) {
			continue
		}
		if found && !sameICloudSessionPublicIdentity(matched, session) {
			return ICloudSession{}, false
		}
		matched = session
		found = true
	}
	return matched, found
}

func uniqueIMAPMatchForAppleID(matches []imapSessionMatch, appleID string) (imapSessionMatch, bool) {
	appleID = strings.TrimSpace(appleID)
	if appleID == "" {
		return imapSessionMatch{}, false
	}
	var exact imapSessionMatch
	exactFound := false
	for _, item := range matches {
		if !strings.EqualFold(strings.TrimSpace(item.session.AppleID), appleID) &&
			!strings.EqualFold(strings.TrimSpace(item.state.IMAPEmail), appleID) {
			continue
		}
		if exactFound && imapStateKey(exact.state) != imapStateKey(item.state) {
			return imapSessionMatch{}, false
		}
		exact = item
		exactFound = true
	}
	if exactFound {
		return exact, true
	}

	accountLocal := emailLocalPart(appleID)
	if accountLocal == "" {
		return imapSessionMatch{}, false
	}
	for _, allowSecondaryPrefix := range []bool{false, true} {
		var candidate imapSessionMatch
		found := false
		ambiguous := false
		for _, item := range matches {
			sessionLocal := emailLocalPart(item.session.AppleID)
			imapLocal := emailLocalPart(item.state.IMAPEmail)
			if !emailLocalPartsMatch(accountLocal, sessionLocal, allowSecondaryPrefix) &&
				!emailLocalPartsMatch(accountLocal, imapLocal, allowSecondaryPrefix) {
				continue
			}
			if found && imapStateKey(candidate.state) != imapStateKey(item.state) {
				ambiguous = true
				break
			}
			candidate = item
			found = true
		}
		if found && !ambiguous {
			return candidate, true
		}
	}
	return imapSessionMatch{}, false
}

func imapStateKey(state LoginState) string {
	return strings.ToLower(strings.TrimSpace(firstNonEmpty(state.IMAPEmail, state.IMAPUsername))) + "|" +
		strings.ToLower(strings.TrimSpace(firstNonEmpty(state.IMAPHost, defaultICloudIMAPHost))) + "|" +
		strconv.Itoa(state.IMAPPort)
}
