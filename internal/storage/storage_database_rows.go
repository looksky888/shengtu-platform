package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

func (b *DatabaseBackend) LoadAccounts() ([]map[string]any, error) {
	return b.loadRows("accounts")
}

func (b *DatabaseBackend) SaveAccounts(accounts []map[string]any) error {
	return b.saveRows("accounts", "access_token", accounts)
}

func (b *DatabaseBackend) LoadAuthKeys() ([]map[string]any, error) {
	return b.loadRows("auth_keys")
}

func (b *DatabaseBackend) SaveAuthKeys(keys []map[string]any) error {
	return b.saveRows("auth_keys", "key_id", keys)
}

func (b *DatabaseBackend) loadRows(table string) ([]map[string]any, error) {
	rows, err := b.db.Query("SELECT data FROM " + table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	var corrupt int
	for rows.Next() {
		var text string
		if err := rows.Scan(&text); err != nil {
			return nil, fmt.Errorf("scan %s: %w", table, err)
		}
		var item map[string]any
		if err := json.Unmarshal([]byte(text), &item); err != nil || item == nil {
			corrupt++
			continue
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Any corrupt row must fail the load so callers never treat partial data as complete
	// (a subsequent full save would delete the unread rows).
	if corrupt > 0 {
		return nil, fmt.Errorf("%s: %d corrupt row(s); refusing partial load", table, corrupt)
	}
	return out, nil
}

func (b *DatabaseBackend) saveRows(table, keyColumn string, items []map[string]any) error {
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()
	sourceKey := "access_token"
	if table == "auth_keys" {
		sourceKey = "id"
	}
	upsertSQL := b.upsertRowSQL(table, keyColumn)
	stmt, err := tx.Prepare(upsertSQL)
	if err != nil {
		return err
	}
	defer stmt.Close()
	keep := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		key := strings.TrimSpace(fmt.Sprint(item[sourceKey]))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		data, err := json.Marshal(item)
		if err != nil {
			return fmt.Errorf("marshal %s key %s: %w", table, key, err)
		}
		if _, err := stmt.Exec(key, string(data)); err != nil {
			return err
		}
		keep = append(keep, key)
	}
	// Empty keep deletes the whole table. Allow only when the table is already empty
	// or when the caller intentionally persists an empty dataset (service layer must
	// refuse save after a failed load).
	if err := b.deleteRowsNotIn(tx, table, keyColumn, keep); err != nil {
		return err
	}
	return tx.Commit()
}

func (b *DatabaseBackend) upsertRowSQL(table, keyColumn string) string {
	switch b.driver {
	case "postgres":
		return "INSERT INTO " + table + " (" + keyColumn + ", data) VALUES ($1, $2) ON CONFLICT (" + keyColumn + ") DO UPDATE SET data = EXCLUDED.data"
	case "mysql":
		return "INSERT INTO " + table + " (" + keyColumn + ", data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)"
	default: // sqlite
		return "INSERT INTO " + table + " (" + keyColumn + ", data) VALUES (?, ?) ON CONFLICT (" + keyColumn + ") DO UPDATE SET data = excluded.data"
	}
}

// UpsertAuthKey updates a single auth_keys row without rewriting the whole table.
func (b *DatabaseBackend) UpsertAuthKey(keyID string, data map[string]any) error {
	keyID = strings.TrimSpace(keyID)
	if keyID == "" || data == nil {
		return fmt.Errorf("invalid auth key upsert")
	}
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = b.db.Exec(b.upsertRowSQL("auth_keys", "key_id"), keyID, string(payload))
	return err
}

// UpsertAccount updates a single accounts row without rewriting the whole table.
func (b *DatabaseBackend) UpsertAccount(accessToken string, data map[string]any) error {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" || data == nil {
		return fmt.Errorf("invalid account upsert")
	}
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = b.db.Exec(b.upsertRowSQL("accounts", "access_token"), accessToken, string(payload))
	return err
}

// UpsertAccountsBatch updates multiple account rows in one transaction.
func (b *DatabaseBackend) UpsertAccountsBatch(items []AccountMutation) error {
	if len(items) == 0 {
		return nil
	}
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	stmt, err := tx.Prepare(b.upsertRowSQL("accounts", "access_token"))
	if err != nil {
		return err
	}
	defer stmt.Close()
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		accessToken := strings.TrimSpace(item.AccessToken)
		if accessToken == "" || item.Data == nil {
			return fmt.Errorf("invalid account batch upsert")
		}
		if _, exists := seen[accessToken]; exists {
			continue
		}
		seen[accessToken] = struct{}{}
		payload, err := json.Marshal(item.Data)
		if err != nil {
			return fmt.Errorf("marshal account %s: %w", accessToken, err)
		}
		if _, err := stmt.Exec(accessToken, string(payload)); err != nil {
			return fmt.Errorf("upsert account %s: %w", accessToken, err)
		}
	}
	return tx.Commit()
}

// DeleteAccount removes a single accounts row without rewriting the whole table.
func (b *DatabaseBackend) DeleteAccount(accessToken string) error {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return fmt.Errorf("invalid account delete")
	}
	_, err := b.db.Exec("DELETE FROM accounts WHERE access_token = "+b.placeholder(1), accessToken)
	return err
}

// DeleteAccountsBatch removes multiple account rows in one transaction.
func (b *DatabaseBackend) DeleteAccountsBatch(accessTokens []string) error {
	if len(accessTokens) == 0 {
		return nil
	}
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	stmt, err := tx.Prepare("DELETE FROM accounts WHERE access_token = " + b.placeholder(1))
	if err != nil {
		return err
	}
	defer stmt.Close()
	seen := make(map[string]struct{}, len(accessTokens))
	for _, rawToken := range accessTokens {
		accessToken := strings.TrimSpace(rawToken)
		if accessToken == "" {
			return fmt.Errorf("invalid account batch delete")
		}
		if _, exists := seen[accessToken]; exists {
			continue
		}
		seen[accessToken] = struct{}{}
		if _, err := stmt.Exec(accessToken); err != nil {
			return fmt.Errorf("delete account %s: %w", accessToken, err)
		}
	}
	return tx.Commit()
}

func (b *DatabaseBackend) deleteRowsNotIn(tx *sql.Tx, table, keyColumn string, keep []string) error {
	if len(keep) == 0 {
		_, err := tx.Exec("DELETE FROM " + table)
		return err
	}
	// Build NOT IN placeholders. Keys are opaque tokens/ids from our own store (not user SQL).
	args := make([]any, len(keep))
	for i, key := range keep {
		args[i] = key
	}
	query := "DELETE FROM " + table + " WHERE " + keyColumn + " NOT IN (" + b.boundPlaceholders(1, len(keep)) + ")"
	_, err := tx.Exec(query, args...)
	return err
}

func (b *DatabaseBackend) count(ctx context.Context, table string) (int, error) {
	var count int
	if err := b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
		return 0, fmt.Errorf("count %s: %w", table, err)
	}
	return count, nil
}
