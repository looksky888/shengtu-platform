package app

import (
	"strings"
	"time"
)

func (s *FileStore) AddMessage(mailboxID, subject, from, body string, receivedAt time.Time) (Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(mailboxID)
	if idx < 0 {
		return Message{}, errCode("mailbox_not_found", "邮箱不存在", false)
	}
	msg, _ := s.upsertMessageLocked(idx, syncedMessageInput{Subject: subject, From: from, Body: body, ReceivedAt: receivedAt}, map[string]int{}, time.Now())
	return msg, s.saveLocked()
}

func (s *FileStore) UpsertMessage(mailboxID, remoteID, source, subject, from, body string, receivedAt time.Time) (Message, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(mailboxID)
	if idx < 0 {
		return Message{}, false, errCode("mailbox_not_found", "邮箱不存在", false)
	}
	now := time.Now()
	msg, created := s.upsertMessageLocked(idx, syncedMessageInput{RemoteID: remoteID, Source: source, Subject: subject, From: from, Body: body, ReceivedAt: receivedAt}, s.remoteMessageIndexesLocked(), now)
	return msg, created, s.saveLocked()
}

func (s *FileStore) SetMailboxStatus(id string, apiActive *bool, icloudActive *bool, status, note string) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(id)
	if idx < 0 {
		return Mailbox{}, errCode("mailbox_not_found", "邮箱不存在", false)
	}
	if apiActive != nil {
		s.state.Mailboxes[idx].APIActive = *apiActive
	}
	if icloudActive != nil {
		s.state.Mailboxes[idx].ICloudActive = *icloudActive
	}
	if strings.TrimSpace(status) != "" {
		s.state.Mailboxes[idx].Status = strings.TrimSpace(status)
	}
	if strings.TrimSpace(note) != "" {
		s.state.Mailboxes[idx].Note = strings.TrimSpace(note)
	}
	s.state.Mailboxes[idx].UpdatedAt = time.Now()
	return s.state.Mailboxes[idx], s.saveLocked()
}

func (s *FileStore) SetMailboxSyncCursor(id string, syncedAt time.Time, lastUID string) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(id)
	if idx < 0 {
		return Mailbox{}, errCode("mailbox_not_found", "邮箱不存在", false)
	}
	if syncedAt.IsZero() {
		syncedAt = time.Now()
	}
	s.state.Mailboxes[idx].LastSyncAt = syncedAt
	if strings.TrimSpace(lastUID) != "" {
		s.state.Mailboxes[idx].LastSyncUID = strings.TrimSpace(lastUID)
	}
	s.state.Mailboxes[idx].UpdatedAt = time.Now()
	return s.state.Mailboxes[idx], s.saveLocked()
}

func (s *FileStore) SetICloudIMAPSyncCursor(ownerID, accountID, stateKey string, syncedAt time.Time, lastUID string) (ICloudSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if syncedAt.IsZero() {
		syncedAt = time.Now()
	}
	session, stateIndex := s.iCloudIMAPCursorTargetLocked(iCloudIMAPSyncCursorUpdate{
		OwnerID: ownerID, AccountID: accountID, StateKey: stateKey,
	})
	if session == nil {
		return ICloudSession{}, errCode("imap_session_missing", "未找到取码登录态，无法保存 IMAP 同步游标", true)
	}
	session.LoginStates[stateIndex].IMAPLastSyncAt = syncedAt
	if lastUID = strings.TrimSpace(lastUID); lastUID != "" {
		session.LoginStates[stateIndex].IMAPLastSyncUID = lastUID
	}
	updated := cloneICloudSession(*session)
	return updated, s.saveLocked()
}

func (s *FileStore) SetMailboxLastCode(id string, messageID string, servedAt time.Time) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(id)
	if idx < 0 {
		return Mailbox{}, errCode("mailbox_not_found", "邮箱不存在", false)
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return Mailbox{}, errCode("message_id_missing", "验证码邮件 ID 为空", false)
	}
	if servedAt.IsZero() {
		servedAt = time.Now()
	}
	s.state.Mailboxes[idx].LastCodeMessageID = messageID
	s.state.Mailboxes[idx].LastCodeAt = servedAt
	s.state.Mailboxes[idx].UpdatedAt = time.Now()
	return s.state.Mailboxes[idx], s.saveLocked()
}

func (s *FileStore) DeleteMailbox(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(id)
	if idx < 0 {
		return errCode("mailbox_not_found", "邮箱不存在", false)
	}
	s.state.Mailboxes = append(s.state.Mailboxes[:idx], s.state.Mailboxes[idx+1:]...)
	filtered := s.state.Messages[:0]
	for _, msg := range s.state.Messages {
		if msg.MailboxID != id {
			filtered = append(filtered, msg)
		}
	}
	s.state.Messages = filtered
	return s.saveLocked()
}

func (s *FileStore) FindMailboxByID(id string) (Mailbox, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.mailboxIndexLocked(id)
	if idx < 0 {
		return Mailbox{}, false
	}
	return s.state.Mailboxes[idx], true
}

func (s *FileStore) FindMailboxByEmail(email string) (Mailbox, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, mailbox := range s.state.Mailboxes {
		if strings.EqualFold(mailbox.Email, email) {
			return mailbox, true
		}
	}
	return Mailbox{}, false
}

func (s *FileStore) MessagesForMailbox(mailboxID string) []Message {
	s.mu.Lock()
	defer s.mu.Unlock()

	var out []Message
	for _, msg := range s.state.Messages {
		if msg.MailboxID == mailboxID {
			out = append(out, msg)
		}
	}
	return out
}
