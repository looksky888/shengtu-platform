package storage

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ReserveAPIKeyLimit atomically checks and records one API-key request. The
// event row remains after release so daily/RPM accounting survives restarts;
// released rows are excluded from the in-flight count.
func (b *DatabaseBackend) ReserveAPIKeyLimit(key, now, day string, rpm, concurrency, daily, leaseSeconds int) (string, int, string, error) {
	if b == nil || b.db == nil {
		return "", 0, "", fmt.Errorf("database backend is not ready")
	}
	key, now, day = strings.TrimSpace(key), strings.TrimSpace(now), strings.TrimSpace(day)
	if key == "" || now == "" || day == "" {
		return "", 0, "", fmt.Errorf("api key limit reservation fields are required")
	}
	if leaseSeconds < 1 {
		leaseSeconds = 3600
	}
	tx, err := b.db.Begin()
	if err != nil {
		return "", 0, "", err
	}
	rollback := func() { _ = tx.Rollback() }
	if err := ensureAPIKeyLimitLockRow(tx, b.driver, b.placeholder(1), key); err != nil {
		rollback()
		return "", 0, "", err
	}
	lockQuery := `SELECT key_id FROM api_key_limit_keys WHERE key_id = ` + b.placeholder(1)
	if b.driver != "sqlite" {
		lockQuery += ` FOR UPDATE`
	}
	var lockedKey string
	if err := tx.QueryRow(lockQuery, key).Scan(&lockedKey); err != nil {
		rollback()
		return "", 0, "", err
	}
	// Keep at most two days of event history. This bounds table growth while
	// preserving the current-day counter and the previous minute window.
	if _, err := tx.Exec(`DELETE FROM api_key_limit_events WHERE key_id = `+b.placeholder(1)+` AND occurred_at < `+b.placeholder(2), key, limitHistoryCutoff(now)); err != nil {
		rollback()
		return "", 0, "", err
	}
	var count int
	minuteCutoff := minuteWindowCutoff(now)
	if err := tx.QueryRow(`SELECT COUNT(*) FROM api_key_limit_events WHERE key_id = `+b.placeholder(1)+` AND occurred_at > `+b.placeholder(2), key, minuteCutoff).Scan(&count); err != nil {
		rollback()
		return "", 0, "", err
	}
	if rpm > 0 && count >= rpm {
		rollback()
		return "", 60, "rpm", nil
	}
	if err := tx.QueryRow(`SELECT COUNT(*) FROM api_key_limit_events WHERE key_id = `+b.placeholder(1)+` AND released = 0 AND lease_until > `+b.placeholder(2), key, now).Scan(&count); err != nil {
		rollback()
		return "", 0, "", err
	}
	if concurrency > 0 && count >= concurrency {
		rollback()
		return "", 1, "concurrency", nil
	}
	if err := tx.QueryRow(`SELECT COUNT(*) FROM api_key_limit_events WHERE key_id = `+b.placeholder(1)+` AND day = `+b.placeholder(2), key, day).Scan(&count); err != nil {
		rollback()
		return "", 0, "", err
	}
	if daily > 0 && count >= daily {
		rollback()
		return "", 86400, "daily", nil
	}
	id := uuid.NewString()
	leaseUntil := addLeaseSeconds(now, leaseSeconds)
	insertQuery := `INSERT INTO api_key_limit_events (id, key_id, occurred_at, day, lease_until, released) VALUES (` + b.placeholder(1) + `, ` + b.placeholder(2) + `, ` + b.placeholder(3) + `, ` + b.placeholder(4) + `, ` + b.placeholder(5) + `, ` + b.placeholder(6) + `)`
	if _, err := tx.Exec(insertQuery, id, key, now, day, leaseUntil, 0); err != nil {
		rollback()
		return "", 0, "", err
	}
	if err := tx.Commit(); err != nil {
		return "", 0, "", err
	}
	return id, 0, "", nil
}

func ensureAPIKeyLimitLockRow(tx *sql.Tx, driver, placeholder, key string) error {
	var query string
	switch driver {
	case "postgres":
		query = `INSERT INTO api_key_limit_keys (key_id) VALUES (` + placeholder + `) ON CONFLICT (key_id) DO NOTHING`
	case "mysql":
		query = `INSERT IGNORE INTO api_key_limit_keys (key_id) VALUES (` + placeholder + `)`
	default:
		query = `INSERT OR IGNORE INTO api_key_limit_keys (key_id) VALUES (` + placeholder + `)`
	}
	_, err := tx.Exec(query, key)
	return err
}

func (b *DatabaseBackend) ReleaseAPIKeyLimit(reservationID string) error {
	if b == nil || b.db == nil {
		return fmt.Errorf("database backend is not ready")
	}
	reservationID = strings.TrimSpace(reservationID)
	if reservationID == "" {
		return nil
	}
	query := `UPDATE api_key_limit_events SET released = 1 WHERE id = ` + b.placeholder(1)
	_, err := b.db.Exec(query, reservationID)
	return err
}

func limitHistoryCutoff(now string) string {
	if parsed, err := parseLimitTime(now); err == nil {
		return parsed.AddDate(0, 0, -2).Format("2006-01-02T15:04:05.999999999Z07:00")
	}
	return now
}

func minuteWindowCutoff(now string) string {
	if parsed, err := parseLimitTime(now); err == nil {
		return parsed.Add(-time.Minute).Format(time.RFC3339Nano)
	}
	return now
}

func addLeaseSeconds(now string, seconds int) string {
	if parsed, err := parseLimitTime(now); err == nil {
		return parsed.Add(time.Duration(seconds) * time.Second).Format(time.RFC3339Nano)
	}
	return now
}

// Small wrappers keep the storage package independent from caller timezone
// helpers while accepting the RFC3339 timestamps emitted by util.NowISO.
func parseLimitTime(value string) (time.Time, error) { return time.Parse(time.RFC3339Nano, value) }
