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
	if ownerID == "" && s.state.ICloudSession != nil {
		s.absorbGlobalLegacyICloudSessionLocked()
	}
	if session.SavedAt.IsZero() {
		session.SavedAt = time.Now()
	}
	if strings.TrimSpace(session.AccountID) == "" {
		session.AccountID = s.ensureICloudAccountLocked(ownerID, session)
	} else {
		s.touchICloudAccountLocked(ownerID, session.AccountID, session)
	}
	for i, existing := range s.state.ICloudSessions {
		if sameOwnerID(ownerID, existing.OwnerID) && sameICloudSessionIdentity(existing, session) {
			merged := mergeICloudSession(existing, session)
			s.state.ICloudSessions[i] = merged
			if strings.TrimSpace(merged.AccountID) != "" {
				s.touchICloudAccountLocked(ownerID, merged.AccountID, merged)
			}
			idx := s.adoptMatchingIMAPOnlySessionLocked(ownerID, i)
			if idx >= 0 && idx < len(s.state.ICloudSessions) {
				s.pruneDuplicateIMAPOnlySessionsLocked(ownerID, s.state.ICloudSessions[idx], idx)
			}
			if ownerID == "" {
				s.migrateLegacyMailboxAccountIDsLocked()
			}
			return s.saveLocked()
		}
	}
	s.state.ICloudSessions = append(s.state.ICloudSessions, session)
	idx := len(s.state.ICloudSessions) - 1
	idx = s.adoptMatchingIMAPOnlySessionLocked(ownerID, idx)
	if idx >= 0 && idx < len(s.state.ICloudSessions) {
		s.pruneDuplicateIMAPOnlySessionsLocked(ownerID, s.state.ICloudSessions[idx], idx)
	}
	if ownerID == "" {
		s.migrateLegacyMailboxAccountIDsLocked()
	}
	return s.saveLocked()
}

func (s *FileStore) absorbGlobalLegacyICloudSessionLocked() {
	if s.state.ICloudSession == nil {
		return
	}
	legacy := cloneICloudSession(*s.state.ICloudSession)
	legacy.OwnerID = ""
	s.state.ICloudSession = nil
	if strings.TrimSpace(legacy.AccountID) == "" {
		legacy.AccountID = s.ensureICloudAccountLocked("", legacy)
	} else {
		s.touchICloudAccountLocked("", legacy.AccountID, legacy)
	}
	for i, existing := range s.state.ICloudSessions {
		if sameOwnerID("", existing.OwnerID) && sameICloudSessionIdentity(existing, legacy) {
			merged := mergeICloudSession(legacy, existing)
			s.state.ICloudSessions[i] = merged
			if strings.TrimSpace(merged.AccountID) != "" {
				s.touchICloudAccountLocked("", merged.AccountID, merged)
			}
			return
		}
	}
	s.state.ICloudSessions = append([]ICloudSession{legacy}, s.state.ICloudSessions...)
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
			if sameOwnerID(ownerID, session.OwnerID) {
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
		if sameOwnerID("", session.OwnerID) {
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
