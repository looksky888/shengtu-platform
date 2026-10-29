package app

import (
	"sort"
	"strings"
	"time"
)

const (
	defaultMessageRetentionDays       = 30
	defaultMessageRetentionPerMailbox = 200
)

type syncedMessageInput struct {
	RemoteID   string
	Source     string
	Subject    string
	From       string
	Body       string
	ReceivedAt time.Time
}

type mailboxMessageSync struct {
	MailboxID    string
	Messages     []syncedMessageInput
	UpdateCursor bool
	SyncedAt     time.Time
	LastUID      string
}

type iCloudIMAPSyncCursorUpdate struct {
	OwnerID   string
	AccountID string
	StateKey  string
	SyncedAt  time.Time
	LastUID   string
}

func (s *FileStore) configureMessageRetention(days, perMailbox int) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if days > 0 {
		s.messageRetentionDays = days
	}
	if perMailbox > 0 {
		s.messageRetentionPerMailbox = perMailbox
	}
}

// applyMessageSync commits one upstream account's messages and cursors with one
// state-file write. Any persistence failure restores the previous memory state.
func (s *FileStore) applyMessageSync(updates []mailboxMessageSync, sessionCursor *iCloudIMAPSyncCursorUpdate) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(updates) == 0 && sessionCursor == nil {
		return 0, nil
	}

	mailboxIndexes := make(map[string]int, len(s.state.Mailboxes))
	for i, mailbox := range s.state.Mailboxes {
		if _, exists := mailboxIndexes[mailbox.ID]; !exists {
			mailboxIndexes[mailbox.ID] = i
		}
	}
	for _, update := range updates {
		if _, ok := mailboxIndexes[update.MailboxID]; !ok {
			return 0, errCode("mailbox_not_found", "邮箱不存在", false)
		}
	}
	var cursorSession *ICloudSession
	var cursorStateIndex int
	if sessionCursor != nil {
		cursorSession, cursorStateIndex = s.iCloudIMAPCursorTargetLocked(*sessionCursor)
		if cursorSession == nil {
			return 0, errCode("imap_session_missing", "未找到取码登录态，无法保存 IMAP 同步游标", true)
		}
	}

	now := time.Now()
	remoteIndexes := s.remoteMessageIndexesLocked()
	affectedMailboxes := make(map[string]struct{}, len(updates))
	created := 0
	for _, update := range updates {
		mailboxIndex := mailboxIndexes[update.MailboxID]
		affectedMailboxes[update.MailboxID] = struct{}{}
		for _, input := range update.Messages {
			_, wasCreated := s.upsertMessageLocked(mailboxIndex, input, remoteIndexes, now)
			if wasCreated {
				created++
			}
		}
		if update.UpdateCursor {
			syncedAt := update.SyncedAt
			if syncedAt.IsZero() {
				syncedAt = now
			}
			s.state.Mailboxes[mailboxIndex].LastSyncAt = syncedAt
			if lastUID := strings.TrimSpace(update.LastUID); lastUID != "" {
				s.state.Mailboxes[mailboxIndex].LastSyncUID = lastUID
			}
			s.state.Mailboxes[mailboxIndex].UpdatedAt = now
		}
	}
	if sessionCursor != nil {
		syncedAt := sessionCursor.SyncedAt
		if syncedAt.IsZero() {
			syncedAt = now
		}
		cursorSession.LoginStates[cursorStateIndex].IMAPLastSyncAt = syncedAt
		if lastUID := strings.TrimSpace(sessionCursor.LastUID); lastUID != "" {
			cursorSession.LoginStates[cursorStateIndex].IMAPLastSyncUID = lastUID
		}
	}
	s.pruneMessagesLocked(now, affectedMailboxes)
	if err := s.saveLocked(); err != nil {
		return 0, err
	}
	return created, nil
}

func (s *FileStore) remoteMessageIndexesLocked() map[string]int {
	indexes := make(map[string]int, len(s.state.Messages))
	for i, message := range s.state.Messages {
		if remoteID := strings.TrimSpace(message.RemoteID); remoteID != "" {
			key := messageRemoteKey(message.MailboxID, remoteID)
			if _, exists := indexes[key]; !exists {
				indexes[key] = i
			}
		}
	}
	return indexes
}

func (s *FileStore) upsertMessageLocked(mailboxIndex int, input syncedMessageInput, remoteIndexes map[string]int, now time.Time) (Message, bool) {
	mailbox := &s.state.Mailboxes[mailboxIndex]
	remoteID := strings.TrimSpace(input.RemoteID)
	if remoteID != "" {
		if messageIndex, ok := remoteIndexes[messageRemoteKey(mailbox.ID, remoteID)]; ok {
			message := &s.state.Messages[messageIndex]
			message.OwnerID = mailbox.OwnerID
			message.Source = strings.TrimSpace(input.Source)
			message.Subject = strings.TrimSpace(input.Subject)
			message.From = strings.TrimSpace(input.From)
			message.Body = input.Body
			if !input.ReceivedAt.IsZero() {
				message.ReceivedAt = input.ReceivedAt
			}
			message.CreatedAt = firstNonZeroTime(message.CreatedAt, now)
			mailbox.UpdatedAt = now
			return *message, false
		}
	}
	receivedAt := input.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = now
	}
	message := Message{
		ID:         s.nextIDLocked("msg"),
		OwnerID:    mailbox.OwnerID,
		MailboxID:  mailbox.ID,
		RemoteID:   remoteID,
		Source:     strings.TrimSpace(input.Source),
		Subject:    strings.TrimSpace(input.Subject),
		From:       strings.TrimSpace(input.From),
		Body:       input.Body,
		ReceivedAt: receivedAt,
		CreatedAt:  now,
	}
	s.state.Messages = append(s.state.Messages, message)
	if remoteID != "" {
		remoteIndexes[messageRemoteKey(mailbox.ID, remoteID)] = len(s.state.Messages) - 1
	}
	mailbox.ReceiveCount++
	mailbox.UpdatedAt = now
	return message, true
}

func messageRemoteKey(mailboxID, remoteID string) string {
	return mailboxID + "\x00" + remoteID
}

func (s *FileStore) iCloudIMAPCursorTargetLocked(update iCloudIMAPSyncCursorUpdate) (*ICloudSession, int) {
	ownerID := strings.TrimSpace(update.OwnerID)
	accountID := strings.TrimSpace(update.AccountID)
	stateKey := strings.TrimSpace(update.StateKey)
	findState := func(session *ICloudSession) (*ICloudSession, int) {
		if session == nil || !sameOwnerID(ownerID, session.OwnerID) || accountID != "" && !constantTimeEqual(accountID, session.AccountID) {
			return nil, -1
		}
		for i, state := range session.LoginStates {
			if state.Kind == LoginStateICloudIMAP && (accountID != "" || stateKey == "" || imapStateKey(state) == stateKey) {
				return session, i
			}
		}
		return nil, -1
	}
	if ownerID == "" {
		if session, index := findState(s.state.ICloudSession); session != nil {
			return session, index
		}
	}
	for i := range s.state.ICloudSessions {
		if session, index := findState(&s.state.ICloudSessions[i]); session != nil {
			return session, index
		}
	}
	return nil, -1
}

func (s *FileStore) pruneMessagesLocked(now time.Time, mailboxIDs map[string]struct{}) int {
	if len(mailboxIDs) == 0 || s.messageRetentionDays <= 0 && s.messageRetentionPerMailbox <= 0 {
		return 0
	}
	keep := make([]bool, len(s.state.Messages))
	byMailbox := make(map[string][]int, len(mailboxIDs))
	cutoff := now.Add(-time.Duration(s.messageRetentionDays) * 24 * time.Hour)
	for i, message := range s.state.Messages {
		if _, affected := mailboxIDs[message.MailboxID]; !affected {
			keep[i] = true
			continue
		}
		if s.messageRetentionDays > 0 && messageRetentionTime(message, now).Before(cutoff) {
			continue
		}
		byMailbox[message.MailboxID] = append(byMailbox[message.MailboxID], i)
	}
	for _, indexes := range byMailbox {
		sort.SliceStable(indexes, func(i, j int) bool {
			return messageRetentionTime(s.state.Messages[indexes[i]], now).After(messageRetentionTime(s.state.Messages[indexes[j]], now))
		})
		limit := len(indexes)
		if s.messageRetentionPerMailbox > 0 && limit > s.messageRetentionPerMailbox {
			limit = s.messageRetentionPerMailbox
		}
		for _, index := range indexes[:limit] {
			keep[index] = true
		}
	}
	filtered := make([]Message, 0, len(s.state.Messages))
	for i, message := range s.state.Messages {
		if keep[i] {
			filtered = append(filtered, message)
		}
	}
	removed := len(s.state.Messages) - len(filtered)
	s.state.Messages = filtered
	return removed
}

func messageRetentionTime(message Message, fallback time.Time) time.Time {
	if !message.ReceivedAt.IsZero() {
		return message.ReceivedAt
	}
	if !message.CreatedAt.IsZero() {
		return message.CreatedAt
	}
	return fallback
}
