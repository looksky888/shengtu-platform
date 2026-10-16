package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"time"
)

type sqliteICloudState struct {
	Legacy   *ICloudSession  `json:"legacy,omitempty"`
	Sessions []ICloudSession `json:"sessions,omitempty"`
}

func loadSQLiteStateRows(db *sql.DB) (State, error) {
	state := State{NextID: 1}
	var nextID string
	if err := db.QueryRow(`SELECT value FROM state_meta WHERE name = 'next_id'`).Scan(&nextID); err == nil {
		if parsed, parseErr := strconv.Atoi(nextID); parseErr == nil && parsed > 0 {
			state.NextID = parsed
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return State{}, err
	}
	var err error
	if state.Users, err = loadSQLiteJSONRows[User](db, "state_users"); err != nil {
		return State{}, err
	}
	if state.WebSessions, err = loadSQLiteJSONRows[WebSession](db, "state_web_sessions"); err != nil {
		return State{}, err
	}
	if state.Accounts, err = loadSQLiteJSONRows[Account](db, "state_accounts"); err != nil {
		return State{}, err
	}
	if state.Mailboxes, err = loadSQLiteJSONRows[Mailbox](db, "state_mailboxes"); err != nil {
		return State{}, err
	}
	if state.Messages, err = loadSQLiteJSONRows[Message](db, "state_messages"); err != nil {
		return State{}, err
	}
	if state.CreateSettings, err = loadSQLiteJSONRows[CreateSettings](db, "state_create_settings"); err != nil {
		return State{}, err
	}
	var icloudJSON string
	err = db.QueryRow(`SELECT data FROM state_icloud WHERE id = 'all'`).Scan(&icloudJSON)
	if err == nil {
		var icloud sqliteICloudState
		if err := json.Unmarshal([]byte(icloudJSON), &icloud); err != nil {
			return State{}, err
		}
		state.ICloudSession = icloud.Legacy
		state.ICloudSessions = icloud.Sessions
	} else if !errors.Is(err, sql.ErrNoRows) {
		return State{}, err
	}
	return state, nil
}

func loadSQLiteJSONRows[T any](db *sql.DB, table string) ([]T, error) {
	rows, err := db.Query("SELECT data FROM " + table + " ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []T
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		var item T
		if err := json.Unmarshal([]byte(data), &item); err != nil {
			return nil, fmt.Errorf("decode %s row: %w", table, err)
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *FileStore) saveSQLiteLocked() error {
	if err := validateSQLiteState(s.state); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	tx, err := s.db.Begin()
	if err != nil {
		return s.rollbackPersistedLocked(err)
	}
	defer func() { _ = tx.Rollback() }()
	previous := State{}
	if s.persistedReady {
		previous = s.persistedState
	}
	if err := saveSQLiteItemDiff(tx, "state_users", s.state.Users, previous.Users, func(v User) string { return v.ID }); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := saveSQLiteItemDiff(tx, "state_web_sessions", s.state.WebSessions, previous.WebSessions, func(v WebSession) string { return v.TokenHash }); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := saveSQLiteStructuredDiff(tx, "state_accounts", s.state.Accounts, previous.Accounts, func(v Account) string { return v.ID },
		"INSERT INTO state_accounts (id, owner_id, label, apple_id, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id, label = excluded.label, apple_id = excluded.apple_id, data = excluded.data",
		func(v Account, data string) []any { return []any{v.ID, v.OwnerID, v.Label, v.AppleID, data} }); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := saveSQLiteStructuredDiff(tx, "state_mailboxes", s.state.Mailboxes, previous.Mailboxes, func(v Mailbox) string { return v.ID },
		"INSERT INTO state_mailboxes (id, owner_id, account_id, email, label, status, tag, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id, account_id = excluded.account_id, email = excluded.email, label = excluded.label, status = excluded.status, tag = excluded.tag, updated_at = excluded.updated_at, data = excluded.data",
		func(v Mailbox, data string) []any {
			return []any{v.ID, v.OwnerID, v.AccountID, v.Email, v.Label, v.Status, v.Tag, sqliteTime(v.UpdatedAt), data}
		}); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := saveSQLiteStructuredDiff(tx, "state_messages", s.state.Messages, previous.Messages, func(v Message) string { return v.ID },
		"INSERT INTO state_messages (id, owner_id, mailbox_id, remote_id, received_at, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id, mailbox_id = excluded.mailbox_id, remote_id = excluded.remote_id, received_at = excluded.received_at, data = excluded.data",
		func(v Message, data string) []any {
			return []any{v.ID, v.OwnerID, v.MailboxID, v.RemoteID, sqliteTime(v.ReceivedAt), data}
		}); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := saveSQLiteItemDiff(tx, "state_create_settings", s.state.CreateSettings, previous.CreateSettings, func(v CreateSettings) string { return v.OwnerID }); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	if err := saveSQLiteICloudState(tx, s.state, previous); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	for name, value := range map[string]string{
		"schema_version": sqliteStateSchemaVersion,
		"next_id":        strconv.Itoa(s.state.NextID),
	} {
		if _, err := tx.Exec(`INSERT INTO state_meta (name, value) VALUES (?, ?)
			ON CONFLICT(name) DO UPDATE SET value = excluded.value`, name, value); err != nil {
			return s.rollbackPersistedLocked(err)
		}
	}
	if err := tx.Commit(); err != nil {
		return s.rollbackPersistedLocked(err)
	}
	s.rememberPersistedLocked()
	return nil
}

func saveSQLiteItemDiff[T any](tx *sql.Tx, table string, current, previous []T, key func(T) string) error {
	currentByID := sqliteItemsByID(current, key)
	previousByID := sqliteItemsByID(previous, key)
	upsert := "INSERT INTO " + table + " (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
	for id, item := range currentByID {
		if old, ok := previousByID[id]; ok && reflect.DeepEqual(old, item) {
			continue
		}
		data, err := json.Marshal(item)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(upsert, id, string(data)); err != nil {
			return err
		}
	}
	for id := range previousByID {
		if _, ok := currentByID[id]; ok {
			continue
		}
		if _, err := tx.Exec("DELETE FROM "+table+" WHERE id = ?", id); err != nil {
			return err
		}
	}
	return nil
}

func saveSQLiteStructuredDiff[T any](tx *sql.Tx, table string, current, previous []T, key func(T) string, upsert string, values func(T, string) []any) error {
	currentByID := sqliteItemsByID(current, key)
	previousByID := sqliteItemsByID(previous, key)
	for id, item := range currentByID {
		if old, ok := previousByID[id]; ok && reflect.DeepEqual(old, item) {
			continue
		}
		data, err := json.Marshal(item)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(upsert, values(item, string(data))...); err != nil {
			return err
		}
	}
	for id := range previousByID {
		if _, ok := currentByID[id]; ok {
			continue
		}
		if _, err := tx.Exec("DELETE FROM "+table+" WHERE id = ?", id); err != nil {
			return err
		}
	}
	return nil
}

func sqliteItemsByID[T any](items []T, key func(T) string) map[string]T {
	out := make(map[string]T, len(items))
	for index, item := range items {
		id := strings.TrimSpace(key(item))
		if id == "" {
			id = fmt.Sprintf("__index__:%09d", index)
		}
		out[id] = item
	}
	return out
}

func sqliteTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339Nano)
}

func validateSQLiteState(state State) error {
	if err := validateSQLiteKeys("users", state.Users, func(v User) string { return v.ID }); err != nil {
		return err
	}
	if err := validateSQLiteKeys("web sessions", state.WebSessions, func(v WebSession) string { return v.TokenHash }); err != nil {
		return err
	}
	if err := validateSQLiteKeys("accounts", state.Accounts, func(v Account) string { return v.ID }); err != nil {
		return err
	}
	if err := validateSQLiteKeys("mailboxes", state.Mailboxes, func(v Mailbox) string { return v.ID }); err != nil {
		return err
	}
	if err := validateSQLiteKeys("messages", state.Messages, func(v Message) string { return v.ID }); err != nil {
		return err
	}
	if err := validateSQLiteKeys("create settings", state.CreateSettings, func(v CreateSettings) string { return v.OwnerID }); err != nil {
		return err
	}
	mailboxesByEmail := make(map[string]string, len(state.Mailboxes))
	for _, mailbox := range state.Mailboxes {
		email := strings.ToLower(strings.TrimSpace(mailbox.Email))
		if email == "" {
			continue
		}
		if previousID, ok := mailboxesByEmail[email]; ok && previousID != mailbox.ID {
			return fmt.Errorf("sidecar SQLite state contains duplicate mailbox email %q", email)
		}
		mailboxesByEmail[email] = mailbox.ID
	}
	messagesByRemoteID := make(map[string]string, len(state.Messages))
	for _, message := range state.Messages {
		remoteID := strings.TrimSpace(message.RemoteID)
		mailboxID := strings.TrimSpace(message.MailboxID)
		if remoteID == "" || mailboxID == "" {
			continue
		}
		key := mailboxID + "\x00" + remoteID
		if previousID, ok := messagesByRemoteID[key]; ok && previousID != message.ID {
			return fmt.Errorf("sidecar SQLite state contains duplicate remote message %q for mailbox %q", remoteID, mailboxID)
		}
		messagesByRemoteID[key] = message.ID
	}
	return nil
}

func validateSQLiteKeys[T any](name string, items []T, key func(T) string) error {
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		value := strings.TrimSpace(key(item))
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			return fmt.Errorf("sidecar SQLite state contains duplicate %s key %q", name, value)
		}
		seen[value] = struct{}{}
	}
	return nil
}

func saveSQLiteICloudState(tx *sql.Tx, current, previous State) error {
	if reflect.DeepEqual(current.ICloudSession, previous.ICloudSession) && reflect.DeepEqual(current.ICloudSessions, previous.ICloudSessions) {
		return nil
	}
	next, err := json.Marshal(sqliteICloudState{Legacy: current.ICloudSession, Sessions: current.ICloudSessions})
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO state_icloud (id, data) VALUES ('all', ?)
		ON CONFLICT(id) DO UPDATE SET data = excluded.data`, string(next))
	return err
}
