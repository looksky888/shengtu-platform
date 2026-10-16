package app

import (
	"strings"
	"time"
)

func (s *FileStore) SaveICloudSession(session ICloudSession) error {
	return s.SaveICloudSessionForOwner("", session)
}

func (s *FileStore) SaveICloudSessionForOwner(ownerID string, session ICloudSession) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	ownerID = strings.TrimSpace(ownerID)
	session.OwnerID = ownerID
	if strings.TrimSpace(session.AccountID) == "" && shouldCreateICloudAccount(session) {
		session.AccountID = s.ensureICloudAccountLocked(ownerID, session)
	}
	if session.SavedAt.IsZero() {
		session.SavedAt = time.Now()
	}
	if ownerID != "" {
		if strings.TrimSpace(session.AccountID) == "" {
			session.AccountID = s.ensureICloudAccountLocked(ownerID, session)
		} else {
			s.touchICloudAccountLocked(ownerID, session.AccountID, session)
		}
		for i, existing := range s.state.ICloudSessions {
			if constantTimeEqual(ownerID, existing.OwnerID) && sameICloudSessionIdentity(existing, session) {
				merged := mergeICloudSession(existing, session)
				s.state.ICloudSessions[i] = merged
				if strings.TrimSpace(merged.AccountID) != "" {
					s.touchICloudAccountLocked(ownerID, merged.AccountID, merged)
				}
				s.pruneDuplicateIMAPOnlySessionsLocked(ownerID, merged, i)
				return s.saveLocked()
			}
		}
		s.state.ICloudSessions = append(s.state.ICloudSessions, session)
		s.pruneDuplicateIMAPOnlySessionsLocked(ownerID, session, len(s.state.ICloudSessions)-1)
		return s.saveLocked()
	}
	if s.state.ICloudSession != nil && sameICloudSessionIdentity(*s.state.ICloudSession, session) {
		session = mergeICloudSession(*s.state.ICloudSession, session)
	}
	s.state.ICloudSession = &session
	if strings.TrimSpace(session.AccountID) != "" {
		s.migrateLegacyMailboxAccountIDsLocked()
	}
	return s.saveLocked()
}

func (s *FileStore) ICloudSession() (ICloudSession, bool) {
	return s.ICloudSessionForOwner("")
}

func (s *FileStore) ICloudSessionForOwner(ownerID string) (ICloudSession, bool) {
	sessions := s.ICloudSessionsForOwner(ownerID)
	if len(sessions) == 0 {
		return ICloudSession{}, false
	}
	return sessions[0], true
}

func (s *FileStore) ICloudSessionsForOwner(ownerID string) []ICloudSession {
	s.mu.Lock()
	defer s.mu.Unlock()

	ownerID = strings.TrimSpace(ownerID)
	if ownerID != "" {
		out := make([]ICloudSession, 0, 2)
		for _, session := range s.state.ICloudSessions {
			if constantTimeEqual(ownerID, session.OwnerID) {
				out = append(out, cloneICloudSession(session))
			}
		}
		return out
	}
	out := make([]ICloudSession, 0, len(s.state.ICloudSessions)+1)
	if s.state.ICloudSession != nil {
		out = append(out, cloneICloudSession(*s.state.ICloudSession))
	}
	for _, session := range s.state.ICloudSessions {
		if strings.TrimSpace(session.OwnerID) == "" {
			out = append(out, cloneICloudSession(session))
		}
	}
	return out
}

func (s *FileStore) ICloudSessionForOwnerAccount(ownerID, accountID string) (ICloudSession, bool) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return s.ICloudSessionForOwner(ownerID)
	}
	for _, session := range s.ICloudSessionsForOwner(ownerID) {
		if constantTimeEqual(accountID, session.AccountID) {
			return session, true
		}
	}
	return ICloudSession{}, false
}

func (s *FileStore) FindAccountByID(id string) (Account, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id = strings.TrimSpace(id)
	for _, account := range s.state.Accounts {
		if account.ID == id {
			return account, true
		}
	}
	return Account{}, false
}
