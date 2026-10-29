package app

import (
	"fmt"
	"strings"
	"time"
)

func sameOwnerID(a, b string) bool {
	return strings.TrimSpace(a) == strings.TrimSpace(b)
}

func (s *FileStore) nextIDLocked(prefix string) string {
	id := fmt.Sprintf("%s_%06d", prefix, s.state.NextID)
	s.state.NextID++
	return id
}

func (s *FileStore) mailboxCountByAccountIDLocked() map[string]int {
	counts := make(map[string]int, len(s.state.Accounts))
	for _, mailbox := range s.state.Mailboxes {
		if accountID := strings.TrimSpace(mailbox.AccountID); accountID != "" {
			counts[accountID]++
		}
	}
	return counts
}

func (s *FileStore) ensureICloudAccountLocked(ownerID string, session ICloudSession) string {
	ownerID = strings.TrimSpace(ownerID)
	for _, existing := range s.state.ICloudSessions {
		if sameOwnerID(ownerID, existing.OwnerID) && sameICloudSessionIdentity(existing, session) && strings.TrimSpace(existing.AccountID) != "" {
			s.touchICloudAccountLocked(ownerID, existing.AccountID, session)
			return existing.AccountID
		}
	}

	appleID := strings.TrimSpace(session.AppleID)
	if appleID != "" {
		mailboxCounts := s.mailboxCountByAccountIDLocked()
		bestIndex := -1
		bestMailboxes := -1
		for i, account := range s.state.Accounts {
			if !sameOwnerID(ownerID, account.OwnerID) || !strings.EqualFold(strings.TrimSpace(account.AppleID), appleID) {
				continue
			}
			count := mailboxCounts[strings.TrimSpace(account.ID)]
			if bestIndex < 0 || count > bestMailboxes || count == bestMailboxes && i > bestIndex {
				bestIndex = i
				bestMailboxes = count
			}
		}
		if bestIndex >= 0 {
			s.updateICloudAccountFromSessionLocked(bestIndex, session)
			return s.state.Accounts[bestIndex].ID
		}
	}

	now := time.Now()
	label := appleID
	if label == "" && strings.TrimSpace(session.DSID) != "" {
		label = "iCloud " + maskSecret(session.DSID, 4)
	}
	if label == "" {
		label = "iCloud " + now.Format("0102-150405")
	}
	account := Account{
		ID:           s.nextIDLocked("acc"),
		OwnerID:      ownerID,
		Label:        label,
		AppleID:      appleID,
		Status:       StatusActive,
		ICloudStatus: iCloudStatusFromSession(session),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.state.Accounts = append(s.state.Accounts, account)
	return account.ID
}

func (s *FileStore) touchICloudAccountLocked(ownerID, accountID string, session ICloudSession) {
	ownerID = strings.TrimSpace(ownerID)
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return
	}
	for i, account := range s.state.Accounts {
		if account.ID == accountID && sameOwnerID(ownerID, account.OwnerID) {
			s.updateICloudAccountFromSessionLocked(i, session)
			return
		}
	}
}

func (s *FileStore) updateICloudAccountFromSessionLocked(index int, session ICloudSession) {
	if index < 0 || index >= len(s.state.Accounts) {
		return
	}
	account := &s.state.Accounts[index]
	if appleID := strings.TrimSpace(session.AppleID); appleID != "" {
		account.AppleID = appleID
		if strings.TrimSpace(account.Label) == "" || strings.HasPrefix(strings.TrimSpace(account.Label), "iCloud ") {
			account.Label = appleID
		}
	}
	account.Status = StatusActive
	account.ICloudStatus = iCloudStatusFromSession(session)
	account.UpdatedAt = time.Now()
}

func sameICloudSessionIdentity(a, b ICloudSession) bool {
	if strings.TrimSpace(a.AccountID) != "" && constantTimeEqual(a.AccountID, b.AccountID) {
		return true
	}
	if strings.TrimSpace(a.DSID) != "" && constantTimeEqual(a.DSID, b.DSID) {
		return true
	}
	if strings.TrimSpace(a.AppleID) != "" && strings.EqualFold(strings.TrimSpace(a.AppleID), strings.TrimSpace(b.AppleID)) {
		return true
	}
	return false
}

func (s *FileStore) adoptMatchingIMAPOnlySessionLocked(ownerID string, targetIndex int) int {
	ownerID = strings.TrimSpace(ownerID)
	if targetIndex < 0 || targetIndex >= len(s.state.ICloudSessions) {
		return targetIndex
	}
	target := s.state.ICloudSessions[targetIndex]
	if !hasCreateLoginState(target) || sessionIMAPEmail(target) != "" {
		return targetIndex
	}
	targetLocal := emailLocalPart(target.AppleID)
	if targetLocal == "" {
		return targetIndex
	}

	findUniqueCandidate := func(allowSecondaryPrefix bool) int {
		matchIndex := -1
		for i, session := range s.state.ICloudSessions {
			if i == targetIndex || !sameOwnerID(ownerID, session.OwnerID) || hasCreateLoginState(session) {
				continue
			}
			imapEmail := sessionIMAPEmail(session)
			if imapEmail == "" {
				continue
			}
			if !emailLocalPartsMatch(targetLocal, emailLocalPart(imapEmail), allowSecondaryPrefix) {
				continue
			}
			if matchIndex >= 0 {
				return -1
			}
			matchIndex = i
		}
		return matchIndex
	}

	matchIndex := findUniqueCandidate(false)
	if matchIndex < 0 {
		matchIndex = findUniqueCandidate(true)
	}
	if matchIndex < 0 {
		return targetIndex
	}

	candidate := s.state.ICloudSessions[matchIndex]
	target.LoginStates = mergeLoginStates(target.LoginStates, candidate.LoginStates)
	s.state.ICloudSessions[targetIndex] = target
	if strings.TrimSpace(target.AccountID) != "" {
		s.touchICloudAccountLocked(ownerID, target.AccountID, target)
	}

	removedAccountIDs := map[string]struct{}{}
	if candidateAccountID := strings.TrimSpace(candidate.AccountID); candidateAccountID != "" && candidateAccountID != strings.TrimSpace(target.AccountID) {
		removedAccountIDs[candidateAccountID] = struct{}{}
	}
	s.state.ICloudSessions = append(s.state.ICloudSessions[:matchIndex], s.state.ICloudSessions[matchIndex+1:]...)
	if matchIndex < targetIndex {
		targetIndex--
	}
	if len(removedAccountIDs) > 0 {
		s.removeAccountIDsFromCreateSettingsLocked(ownerID, removedAccountIDs)
		s.pruneRemovedIMAPOnlyAccountsLocked(ownerID, removedAccountIDs)
	}
	return targetIndex
}

func (s *FileStore) pruneDuplicateIMAPOnlySessionsLocked(ownerID string, target ICloudSession, targetIndex int) {
	ownerID = strings.TrimSpace(ownerID)
	targetIMAPEmail := sessionIMAPEmail(target)
	if targetIMAPEmail == "" {
		return
	}
	targetLocal := emailLocalPart(targetIMAPEmail)
	removedAccountIDs := map[string]struct{}{}
	next := s.state.ICloudSessions[:0]
	for i, session := range s.state.ICloudSessions {
		if i == targetIndex || !sameOwnerID(ownerID, session.OwnerID) {
			next = append(next, session)
			continue
		}
		if hasCreateLoginState(session) {
			next = append(next, session)
			continue
		}
		imapEmail := sessionIMAPEmail(session)
		sameIMAPEmail := targetIMAPEmail != "" && strings.EqualFold(imapEmail, targetIMAPEmail)
		sameLocalPart := targetLocal != "" && strings.EqualFold(emailLocalPart(imapEmail), targetLocal)
		if sameIMAPEmail || sameLocalPart {
			if accountID := strings.TrimSpace(session.AccountID); accountID != "" && accountID != strings.TrimSpace(target.AccountID) {
				removedAccountIDs[accountID] = struct{}{}
			}
			continue
		}
		next = append(next, session)
	}
	s.state.ICloudSessions = next
	if len(removedAccountIDs) > 0 {
		s.removeAccountIDsFromCreateSettingsLocked(ownerID, removedAccountIDs)
		s.pruneRemovedIMAPOnlyAccountsLocked(ownerID, removedAccountIDs)
	}
}

func (s *FileStore) removeAccountIDsFromCreateSettingsLocked(ownerID string, accountIDs map[string]struct{}) {
	for i, settings := range s.state.CreateSettings {
		if !sameOwnerID(ownerID, settings.OwnerID) {
			continue
		}
		next := settings.AccountIDs[:0]
		for _, accountID := range settings.AccountIDs {
			if _, remove := accountIDs[strings.TrimSpace(accountID)]; remove {
				continue
			}
			next = append(next, accountID)
		}
		s.state.CreateSettings[i].AccountIDs = normalizeAccountIDSelection("", next)
		s.state.CreateSettings[i].UpdatedAt = time.Now()
	}
}

func (s *FileStore) pruneRemovedIMAPOnlyAccountsLocked(ownerID string, accountIDs map[string]struct{}) {
	referenced := map[string]struct{}{}
	for _, session := range s.state.ICloudSessions {
		if sameOwnerID(ownerID, session.OwnerID) {
			if accountID := strings.TrimSpace(session.AccountID); accountID != "" {
				referenced[accountID] = struct{}{}
			}
		}
	}
	for _, mailbox := range s.state.Mailboxes {
		if sameOwnerID(ownerID, mailbox.OwnerID) {
			if accountID := strings.TrimSpace(mailbox.AccountID); accountID != "" {
				referenced[accountID] = struct{}{}
			}
		}
	}
	next := s.state.Accounts[:0]
	for _, account := range s.state.Accounts {
		accountID := strings.TrimSpace(account.ID)
		if sameOwnerID(ownerID, account.OwnerID) {
			if _, wasRemovedSessionAccount := accountIDs[accountID]; wasRemovedSessionAccount {
				if _, stillReferenced := referenced[accountID]; !stillReferenced {
					continue
				}
			}
		}
		next = append(next, account)
	}
	s.state.Accounts = next
}

func hasCreateLoginState(session ICloudSession) bool {
	if len(session.Cookies) > 0 {
		return true
	}
	for _, state := range session.LoginStates {
		if state.Kind == LoginStateICloudWeb && len(state.Cookies) > 0 {
			return true
		}
		if state.Kind == LoginStateAppleAccount && strings.TrimSpace(state.Scnt) != "" {
			return true
		}
	}
	return false
}

func sessionIMAPEmail(session ICloudSession) string {
	for _, state := range session.LoginStates {
		if state.Kind != LoginStateICloudIMAP {
			continue
		}
		email := normalizeICloudIMAPEmail(firstNonEmpty(state.IMAPEmail, state.IMAPUsername, session.AppleID))
		if email != "" && strings.TrimSpace(state.IMAPAppPassword) != "" {
			return email
		}
	}
	return ""
}

func iCloudStatusFromSession(session ICloudSession) string {
	if len(session.Cookies) > 0 {
		if !session.IsICloudPlus {
			return ICloudStatusNoICloudPlus
		}
		if !session.CanCreateHME {
			return ICloudStatusFailed
		}
		return ICloudStatusActive
	}
	if appleAccountManageReady(session) || appleAccountLoginSaved(session) || iCloudIMAPLoginSaved(session) {
		return ICloudStatusActive
	}
	return ICloudStatusNeedLogin
}
