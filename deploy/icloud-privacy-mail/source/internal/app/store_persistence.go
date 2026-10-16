package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func (s *FileStore) mailboxIndexLocked(id string) int {
	for i, mailbox := range s.state.Mailboxes {
		if mailbox.ID == id {
			return i
		}
	}
	return -1
}

func (s *FileStore) userByIDLocked(id string) (User, bool) {
	id = strings.TrimSpace(id)
	for _, user := range s.state.Users {
		if user.ID == id {
			return user, true
		}
	}
	return User{}, false
}

func (s *FileStore) saveLocked() error {
	if s.closed {
		return errors.New("state store is closed")
	}
	if s.db != nil {
		return s.saveSQLiteLocked()
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return s.rollbackPersistedLocked(err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return s.rollbackPersistedLocked(err)
	}
	s.rememberPersistedLocked()
	return nil
}

func (s *FileStore) rememberPersistedLocked() {
	s.persistedPath = s.path
	s.persistedState = cloneState(s.state)
	s.persistedReady = true
}

func (s *FileStore) rollbackPersistedLocked(err error) error {
	if s.persistedReady {
		s.path = s.persistedPath
		s.state = cloneState(s.persistedState)
	}
	return err
}
