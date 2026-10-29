package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type FileStore struct {
	mu                         sync.Mutex
	path                       string
	db                         *sql.DB
	closed                     bool
	state                      State
	persistedPath              string
	persistedState             State
	persistedReady             bool
	messageRetentionDays       int
	messageRetentionPerMailbox int
}

type DeleteUserResult struct {
	UserID         string `json:"user_id"`
	Username       string `json:"username"`
	Accounts       int    `json:"accounts"`
	Mailboxes      int    `json:"mailboxes"`
	Messages       int    `json:"messages"`
	ICloudSessions int    `json:"icloud_sessions"`
	WebSessions    int    `json:"web_sessions"`
}

func NewFileStore(path string) (*FileStore, error) {
	if path == "" {
		path = filepath.Join("data", "state.db")
	}
	if isSQLiteStatePath(path) {
		return newSQLiteFileStore(path)
	}
	s := &FileStore{
		path:                       path,
		state:                      State{NextID: 1},
		messageRetentionDays:       defaultMessageRetentionDays,
		messageRetentionPerMailbox: defaultMessageRetentionPerMailbox,
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *FileStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return s.saveLocked()
		}
		return err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return s.saveLocked()
	}
	if err := json.Unmarshal(data, &s.state); err != nil {
		return err
	}
	if s.state.NextID <= 0 {
		s.state.NextID = 1
	}
	s.rememberPersistedLocked()
	if s.migrateStateLocked() {
		return s.saveLocked()
	}
	return nil
}

func (s *FileStore) Snapshot() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneState(s.state)
}

func (s *FileStore) SnapshotForOwner(ownerID string) State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return filterStateByOwnerLocked(s.state, strings.TrimSpace(ownerID))
}

func (s *FileStore) CreateSettingsForOwner(ownerID string) CreateSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return createSettingsForOwnerLocked(s.state, strings.TrimSpace(ownerID))
}

func (s *FileStore) SaveCreateSettingsForOwner(ownerID string, settings CreateSettings) (CreateSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ownerID = strings.TrimSpace(ownerID)
	settings = normalizeCreateSettings(ownerID, settings)
	settings.UpdatedAt = time.Now()
	for i := range s.state.CreateSettings {
		if sameOwnerID(ownerID, s.state.CreateSettings[i].OwnerID) {
			s.state.CreateSettings[i] = settings
			return settings, s.saveLocked()
		}
	}
	s.state.CreateSettings = append(s.state.CreateSettings, settings)
	return settings, s.saveLocked()
}
