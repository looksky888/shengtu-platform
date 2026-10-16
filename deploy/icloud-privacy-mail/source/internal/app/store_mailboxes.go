package app

import (
	"fmt"
	"strings"
	"time"
)

// MailboxListSnapshotForOwner copies only data required by account/mailbox lists.
// Messages and login sessions can be much larger and are intentionally excluded.
func (s *FileStore) MailboxListSnapshotForOwner(ownerID string) State {
	s.mu.Lock()
	defer s.mu.Unlock()

	ownerID = strings.TrimSpace(ownerID)
	out := State{NextID: s.state.NextID}
	if ownerID == "" {
		for _, user := range s.state.Users {
			out.Users = append(out.Users, User{ID: user.ID, Username: user.Username})
		}
		out.Accounts = append([]Account(nil), s.state.Accounts...)
		out.Mailboxes = append([]Mailbox(nil), s.state.Mailboxes...)
		return out
	}
	for _, user := range s.state.Users {
		if constantTimeEqual(ownerID, user.ID) {
			out.Users = append(out.Users, User{ID: user.ID, Username: user.Username})
		}
	}
	for _, account := range s.state.Accounts {
		if constantTimeEqual(ownerID, account.OwnerID) {
			out.Accounts = append(out.Accounts, account)
		}
	}
	for _, mailbox := range s.state.Mailboxes {
		if constantTimeEqual(ownerID, mailbox.OwnerID) {
			out.Mailboxes = append(out.Mailboxes, mailbox)
		}
	}
	return out
}

func (s *FileStore) AddAccount(label, appleID, note string) (Account, error) {
	return s.AddAccountForOwner("", label, appleID, note)
}

func (s *FileStore) AddAccountForOwner(ownerID, label, appleID, note string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	account := Account{
		ID:           s.nextIDLocked("acc"),
		OwnerID:      strings.TrimSpace(ownerID),
		Label:        strings.TrimSpace(label),
		AppleID:      strings.TrimSpace(appleID),
		Status:       StatusActive,
		ICloudStatus: ICloudStatusNeedLogin,
		Note:         strings.TrimSpace(note),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if account.Label == "" {
		account.Label = account.ID
	}
	s.state.Accounts = append(s.state.Accounts, account)
	return account, s.saveLocked()
}

func (s *FileStore) AddMailbox(accountID, label, email string) (Mailbox, error) {
	return s.AddMailboxForOwner("", accountID, label, email)
}

func (s *FileStore) AddMailboxForOwner(ownerID, accountID, label, email string) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return Mailbox{}, errCode("provider_not_configured", "当前 MVP 需要先手动填入已创建的隐私邮箱；自动创建接口留给后续 iCloud Provider 接入", false)
	}
	for _, mailbox := range s.state.Mailboxes {
		if strings.EqualFold(mailbox.Email, email) {
			return Mailbox{}, errCode("mailbox_exists", "邮箱已存在", false)
		}
	}

	now := time.Now()
	token, err := randomToken(24)
	if err != nil {
		return Mailbox{}, err
	}
	if strings.TrimSpace(label) == "" {
		label = fmt.Sprintf("UPI-%s", time.Now().Format("0102-150405"))
	}
	mailbox := Mailbox{
		ID:           s.nextIDLocked("mbx"),
		OwnerID:      strings.TrimSpace(ownerID),
		AccountID:    strings.TrimSpace(accountID),
		Label:        strings.TrimSpace(label),
		Email:        email,
		APIToken:     token,
		APIActive:    true,
		ICloudActive: true,
		Status:       StatusAvailable,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.state.Mailboxes = append(s.state.Mailboxes, mailbox)
	return mailbox, s.saveLocked()
}

func (s *FileStore) UpsertMailboxFromRemote(ownerID, accountID string, remote ICloudRemoteMailbox, defaultNote string) (Mailbox, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ownerID = strings.TrimSpace(ownerID)
	accountID = strings.TrimSpace(accountID)
	email := strings.ToLower(strings.TrimSpace(remote.Email))
	if email == "" {
		return Mailbox{}, false, errCode("mailbox_email_missing", "iCloud 返回的邮箱地址为空", false)
	}
	now := time.Now()
	for i, mailbox := range s.state.Mailboxes {
		if !strings.EqualFold(mailbox.Email, email) {
			continue
		}
		if strings.TrimSpace(mailbox.OwnerID) != ownerID {
			return Mailbox{}, false, errCode("mailbox_exists_other_owner", "邮箱已存在于其他登录账号的数据中，已跳过导入", false)
		}
		if strings.TrimSpace(remote.Label) != "" {
			s.state.Mailboxes[i].Label = strings.TrimSpace(remote.Label)
		}
		if accountID != "" && strings.TrimSpace(s.state.Mailboxes[i].AccountID) != accountID {
			s.state.Mailboxes[i].AccountID = accountID
		}
		s.state.Mailboxes[i].ICloudActive = remote.IsActive
		note := strings.TrimSpace(remote.Note)
		if note == "" {
			note = strings.TrimSpace(defaultNote)
		}
		if note != "" && strings.TrimSpace(s.state.Mailboxes[i].Note) == "" {
			s.state.Mailboxes[i].Note = note
		}
		s.state.Mailboxes[i].UpdatedAt = now
		return s.state.Mailboxes[i], false, s.saveLocked()
	}

	token, err := randomToken(24)
	if err != nil {
		return Mailbox{}, false, err
	}
	label := strings.TrimSpace(remote.Label)
	if label == "" {
		label = fmt.Sprintf("HME-%s", now.Format("0102-150405"))
	}
	note := strings.TrimSpace(remote.Note)
	if note == "" {
		note = strings.TrimSpace(defaultNote)
	}
	status := StatusAvailable
	if !remote.IsActive {
		status = StatusDisabled
	}
	mailbox := Mailbox{
		ID:           s.nextIDLocked("mbx"),
		OwnerID:      ownerID,
		AccountID:    accountID,
		Label:        label,
		Email:        email,
		APIToken:     token,
		APIActive:    true,
		ICloudActive: remote.IsActive,
		Status:       status,
		Note:         note,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.state.Mailboxes = append(s.state.Mailboxes, mailbox)
	return mailbox, true, s.saveLocked()
}
