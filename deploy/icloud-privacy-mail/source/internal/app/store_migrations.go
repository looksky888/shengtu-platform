package app

import (
	"strings"
	"time"
)

func (s *FileStore) migrateLegacyMailboxAccountIDsLocked() bool {
	accountsByOwner := make(map[string][]Account)
	for _, account := range s.state.Accounts {
		ownerID := strings.TrimSpace(account.OwnerID)
		accountsByOwner[ownerID] = append(accountsByOwner[ownerID], account)
	}

	changed := false
	now := time.Now()
	for i := range s.state.Mailboxes {
		if strings.TrimSpace(s.state.Mailboxes[i].AccountID) != "" {
			continue
		}
		ownerID := strings.TrimSpace(s.state.Mailboxes[i].OwnerID)
		accounts := accountsByOwner[ownerID]
		if len(accounts) != 1 {
			continue
		}
		s.state.Mailboxes[i].AccountID = accounts[0].ID
		if s.state.Mailboxes[i].UpdatedAt.IsZero() {
			s.state.Mailboxes[i].UpdatedAt = now
		}
		changed = true
	}
	return changed
}

func (s *FileStore) migrateLegacyICloudSessionAccountIDsLocked() bool {
	changed := false
	if s.state.ICloudSession != nil && strings.TrimSpace(s.state.ICloudSession.AccountID) == "" && shouldCreateICloudAccount(*s.state.ICloudSession) {
		s.state.ICloudSession.AccountID = s.ensureICloudAccountLocked("", *s.state.ICloudSession)
		changed = strings.TrimSpace(s.state.ICloudSession.AccountID) != ""
	}
	for i := range s.state.ICloudSessions {
		session := &s.state.ICloudSessions[i]
		if strings.TrimSpace(session.AccountID) != "" || !shouldCreateICloudAccount(*session) {
			continue
		}
		session.AccountID = s.ensureICloudAccountLocked(session.OwnerID, *session)
		if strings.TrimSpace(session.AccountID) != "" {
			changed = true
		}
	}
	return changed
}

func (s *FileStore) migrateLegacyICloudSessionToAdminLocked() bool {
	if s.state.ICloudSession == nil {
		return false
	}
	adminID := singleActiveAdminID(s.state.Users)
	if adminID == "" {
		return false
	}

	legacy := cloneICloudSession(*s.state.ICloudSession)
	legacyAccountID := strings.TrimSpace(legacy.AccountID)
	targetIndex := -1
	for i, session := range s.state.ICloudSessions {
		if constantTimeEqual(adminID, session.OwnerID) && sameICloudSessionIdentity(session, legacy) {
			targetIndex = i
			break
		}
	}

	targetAccountID := ""
	if targetIndex >= 0 {
		existing := s.state.ICloudSessions[targetIndex]
		targetAccountID = strings.TrimSpace(existing.AccountID)
		legacy.OwnerID = adminID
		legacy.AccountID = targetAccountID
		merged := mergeICloudSession(existing, legacy)
		merged.OwnerID = adminID
		merged.AccountID = targetAccountID
		s.state.ICloudSessions[targetIndex] = merged
		if targetAccountID != "" {
			s.touchICloudAccountLocked(adminID, targetAccountID, merged)
		}
	} else {
		legacy.OwnerID = adminID
		if legacyAccountID != "" && s.reassignAccountOwnerLocked(legacyAccountID, adminID) {
			targetAccountID = legacyAccountID
		} else {
			legacy.AccountID = ""
			targetAccountID = s.ensureICloudAccountLocked(adminID, legacy)
		}
		legacy.AccountID = targetAccountID
		s.state.ICloudSessions = append(s.state.ICloudSessions, legacy)
	}

	migratedMailboxIDs := make(map[string]struct{})
	for i := range s.state.Mailboxes {
		mailbox := &s.state.Mailboxes[i]
		if strings.TrimSpace(mailbox.OwnerID) != "" || legacyAccountID == "" || mailbox.AccountID != legacyAccountID {
			continue
		}
		mailbox.OwnerID = adminID
		if targetAccountID != "" {
			mailbox.AccountID = targetAccountID
		}
		migratedMailboxIDs[mailbox.ID] = struct{}{}
	}
	for i := range s.state.Messages {
		if _, ok := migratedMailboxIDs[s.state.Messages[i].MailboxID]; ok {
			s.state.Messages[i].OwnerID = adminID
		}
	}
	s.migrateLegacyCreateSettingsLocked(adminID, legacyAccountID, targetAccountID)
	if legacyAccountID != "" && legacyAccountID != targetAccountID {
		s.removeUnreferencedAccountLocked(legacyAccountID)
	}
	s.state.ICloudSession = nil
	return true
}

func singleActiveAdminID(users []User) string {
	adminID := ""
	for _, user := range users {
		if !user.IsAdmin || (user.Status != "" && user.Status != StatusActive) || strings.TrimSpace(user.ID) == "" {
			continue
		}
		if adminID != "" {
			return ""
		}
		adminID = strings.TrimSpace(user.ID)
	}
	return adminID
}

func (s *FileStore) reassignAccountOwnerLocked(accountID, ownerID string) bool {
	for i := range s.state.Accounts {
		if s.state.Accounts[i].ID == accountID {
			s.state.Accounts[i].OwnerID = ownerID
			s.state.Accounts[i].UpdatedAt = time.Now()
			return true
		}
	}
	return false
}

func (s *FileStore) migrateLegacyCreateSettingsLocked(ownerID, legacyAccountID, targetAccountID string) {
	hasOwnerSettings := false
	for _, settings := range s.state.CreateSettings {
		if constantTimeEqual(ownerID, settings.OwnerID) {
			hasOwnerSettings = true
			break
		}
	}
	next := s.state.CreateSettings[:0]
	for _, settings := range s.state.CreateSettings {
		if strings.TrimSpace(settings.OwnerID) != "" {
			next = append(next, settings)
			continue
		}
		if hasOwnerSettings {
			continue
		}
		settings.OwnerID = ownerID
		for i, accountID := range settings.AccountIDs {
			if accountID == legacyAccountID && targetAccountID != "" {
				settings.AccountIDs[i] = targetAccountID
			}
		}
		next = append(next, settings)
		hasOwnerSettings = true
	}
	s.state.CreateSettings = next
}

func (s *FileStore) removeUnreferencedAccountLocked(accountID string) {
	for _, session := range s.state.ICloudSessions {
		if session.AccountID == accountID {
			return
		}
	}
	for _, mailbox := range s.state.Mailboxes {
		if mailbox.AccountID == accountID {
			return
		}
	}
	next := s.state.Accounts[:0]
	for _, account := range s.state.Accounts {
		if account.ID != accountID {
			next = append(next, account)
		}
	}
	s.state.Accounts = next
}

func shouldCreateICloudAccount(session ICloudSession) bool {
	if strings.TrimSpace(session.AccountID) != "" {
		return false
	}
	if strings.TrimSpace(session.AppleID) == "" {
		return false
	}
	if strings.TrimSpace(session.DSID) != "" || len(session.Cookies) > 0 {
		return true
	}
	for _, state := range session.LoginStates {
		if state.Kind == LoginStateAppleAccount || state.Kind == LoginStateICloudWeb {
			return true
		}
	}
	return false
}

func (s *FileStore) migrateLegacyMailboxClaimsLocked() bool {
	changed := false
	for i := range s.state.Mailboxes {
		mailbox := &s.state.Mailboxes[i]
		if mailbox.Status != StatusUsed || mailbox.OpenAIClaimed || mailbox.GrokClaimed {
			continue
		}
		note := strings.ToLower(strings.TrimSpace(mailbox.Note))
		openAIClaimed := strings.Contains(note, "openai register") || strings.Contains(note, "chatgpt register")
		grokClaimed := strings.Contains(note, "grok register") || strings.Contains(note, "xai register")
		if !openAIClaimed && !grokClaimed {
			continue
		}
		mailbox.OpenAIClaimed = openAIClaimed
		mailbox.GrokClaimed = grokClaimed
		if mailbox.OpenAIClaimed != mailbox.GrokClaimed {
			mailbox.Status = StatusAvailable
		}
		changed = true
	}
	return changed
}
