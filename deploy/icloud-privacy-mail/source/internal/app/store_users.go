package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *FileStore) Users() []User {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]User(nil), s.state.Users...)
}

func (s *FileStore) CreateUser(username, password string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	username = normalizeUsername(username)
	if err := validateUsername(username); err != nil {
		return User{}, err
	}
	if err := validatePassword(password); err != nil {
		return User{}, err
	}
	for _, user := range s.state.Users {
		if strings.EqualFold(user.Username, username) {
			return User{}, errCode("user_exists", "账号已存在", false)
		}
	}
	passwordHash, err := hashPassword(password)
	if err != nil {
		return User{}, err
	}
	now := time.Now()
	user := User{
		ID:           s.nextIDLocked("usr"),
		Username:     username,
		PasswordHash: passwordHash,
		IsAdmin:      len(s.state.Users) == 0,
		Status:       StatusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.state.Users = append(s.state.Users, user)
	return user, s.saveLocked()
}

func (s *FileStore) AuthenticateUser(username, password string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	username = normalizeUsername(username)
	for i, user := range s.state.Users {
		if !strings.EqualFold(user.Username, username) {
			continue
		}
		if user.Status != StatusActive {
			return User{}, errCode("user_disabled", "账号已停用", false)
		}
		if !verifyPassword(password, user.PasswordHash) {
			return User{}, errCode("invalid_login", "账号或密码错误", false)
		}
		now := time.Now()
		s.state.Users[i].LastLoginAt = now
		s.state.Users[i].UpdatedAt = now
		return s.state.Users[i], s.saveLocked()
	}
	return User{}, errCode("invalid_login", "账号或密码错误", false)
}

func (s *FileStore) UserByID(id string) (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.userByIDLocked(id)
}

func (s *FileStore) DeleteUser(id string) (DeleteUserResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id = strings.TrimSpace(id)
	if id == "" {
		return DeleteUserResult{}, errCode("user_not_found", "账号不存在", false)
	}
	idx := -1
	var user User
	for i, candidate := range s.state.Users {
		if candidate.ID == id {
			idx = i
			user = candidate
			break
		}
	}
	if idx < 0 {
		return DeleteUserResult{}, errCode("user_not_found", "账号不存在", false)
	}
	if user.IsAdmin {
		return DeleteUserResult{}, errCode("cannot_delete_admin_user", "不能删除管理员账号", false)
	}

	result := DeleteUserResult{
		UserID:   user.ID,
		Username: user.Username,
	}
	s.state.Users = append(s.state.Users[:idx], s.state.Users[idx+1:]...)

	accounts := s.state.Accounts[:0]
	for _, account := range s.state.Accounts {
		if constantTimeEqual(id, account.OwnerID) {
			result.Accounts++
			continue
		}
		accounts = append(accounts, account)
	}
	s.state.Accounts = accounts

	deletedMailboxIDs := make(map[string]struct{})
	mailboxes := s.state.Mailboxes[:0]
	for _, mailbox := range s.state.Mailboxes {
		if constantTimeEqual(id, mailbox.OwnerID) {
			result.Mailboxes++
			deletedMailboxIDs[mailbox.ID] = struct{}{}
			continue
		}
		mailboxes = append(mailboxes, mailbox)
	}
	s.state.Mailboxes = mailboxes

	messages := s.state.Messages[:0]
	for _, msg := range s.state.Messages {
		_, mailboxDeleted := deletedMailboxIDs[msg.MailboxID]
		if mailboxDeleted || constantTimeEqual(id, msg.OwnerID) {
			result.Messages++
			continue
		}
		messages = append(messages, msg)
	}
	s.state.Messages = messages

	icloudSessions := s.state.ICloudSessions[:0]
	for _, session := range s.state.ICloudSessions {
		if constantTimeEqual(id, session.OwnerID) {
			result.ICloudSessions++
			continue
		}
		icloudSessions = append(icloudSessions, session)
	}
	s.state.ICloudSessions = icloudSessions

	webSessions := s.state.WebSessions[:0]
	for _, session := range s.state.WebSessions {
		if constantTimeEqual(id, session.UserID) {
			result.WebSessions++
			continue
		}
		webSessions = append(webSessions, session)
	}
	s.state.WebSessions = webSessions

	return result, s.saveLocked()
}

func (s *FileStore) CreateWebSession(userID string, isAdmin bool, ttl time.Duration) (string, WebSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID = strings.TrimSpace(userID)
	if _, ok := s.userByIDLocked(userID); !ok {
		return "", WebSession{}, errCode("user_not_found", "账号不存在", false)
	}
	token, err := randomToken(32)
	if err != nil {
		return "", WebSession{}, err
	}
	now := time.Now()
	session := WebSession{
		TokenHash:  sessionTokenHash(token),
		UserID:     userID,
		IsAdmin:    isAdmin,
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  now.Add(ttl),
	}
	s.state.WebSessions = append(s.state.WebSessions, session)
	return token, session, s.saveLocked()
}

func (s *FileStore) WebSessionByToken(token string) (WebSession, User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	tokenHash := sessionTokenHash(token)
	if strings.TrimSpace(token) == "" {
		return WebSession{}, User{}, false
	}
	now := time.Now()
	for _, session := range s.state.WebSessions {
		if !constantTimeEqual(tokenHash, session.TokenHash) || !session.ExpiresAt.After(now) {
			continue
		}
		user, ok := s.userByIDLocked(session.UserID)
		if !ok || user.Status != StatusActive {
			return WebSession{}, User{}, false
		}
		return session, user, true
	}
	return WebSession{}, User{}, false
}

func (s *FileStore) DeleteWebSession(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tokenHash := sessionTokenHash(token)
	filtered := s.state.WebSessions[:0]
	for _, session := range s.state.WebSessions {
		if constantTimeEqual(tokenHash, session.TokenHash) {
			continue
		}
		filtered = append(filtered, session)
	}
	s.state.WebSessions = filtered
	return s.saveLocked()
}

func (s *FileStore) Path() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.path
}

func (s *FileStore) SetPath(path string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		return State{}, errors.New("cannot change path of SQLite state store at runtime")
	}
	path = strings.TrimSpace(path)
	if path == "" {
		path = filepath.Join("data", "state.json")
	}
	if isSQLiteStatePath(path) {
		return State{}, errors.New("SetPath requires a JSON state path; configure SQLite path before startup")
	}
	if strings.EqualFold(filepath.Ext(path), ".json") {
		path = filepath.Clean(path)
	} else {
		path = filepath.Join(path, "state.json")
	}
	current := cloneState(s.state)
	data, err := os.ReadFile(path)
	switch {
	case err == nil && len(strings.TrimSpace(string(data))) > 0:
		var next State
		if err := json.Unmarshal(data, &next); err != nil {
			return State{}, err
		}
		if next.NextID <= 0 {
			next.NextID = 1
		}
		s.state = next
	case err == nil:
		s.state = current
	case errors.Is(err, os.ErrNotExist):
		s.state = current
	default:
		return State{}, err
	}
	s.path = path
	if err := s.saveLocked(); err != nil {
		return State{}, err
	}
	return cloneState(s.state), nil
}
