package storage

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (b *DatabaseBackend) ReserveStorageCapacity(userID, now string, sizeBytes int64, leaseSeconds int) (string, bool, bool, int64, int64, error) {
	userID, now = strings.TrimSpace(userID), strings.TrimSpace(now)
	if b == nil || b.db == nil || userID == "" || now == "" || sizeBytes <= 0 {
		return "", false, false, 0, 0, fmt.Errorf("storage capacity reservation fields are invalid")
	}
	if leaseSeconds < 1 {
		leaseSeconds = 900
	}
	tx, err := b.db.Begin()
	if err != nil {
		return "", false, false, 0, 0, err
	}
	rollback := func() { _ = tx.Rollback() }
	if err := ensureMediaCapacityLockRow(tx, b.driver, b.placeholder(1), userID); err != nil {
		rollback()
		return "", false, false, 0, 0, err
	}
	lockQuery := `SELECT user_id FROM media_capacity_keys WHERE user_id = ` + b.placeholder(1)
	if b.driver != "sqlite" {
		lockQuery += ` FOR UPDATE`
	}
	var lockedUser string
	if err := tx.QueryRow(lockQuery, userID).Scan(&lockedUser); err != nil {
		rollback()
		return "", false, false, 0, 0, err
	}
	var totalBytes int64
	if _, err := tx.Exec(`DELETE FROM media_capacity_reservations WHERE user_id = `+b.placeholder(1)+` AND (released <> 0 OR lease_until <= `+b.placeholder(2)+`)`, userID, now); err != nil {
		rollback()
		return "", false, false, 0, 0, err
	}
	if err := tx.QueryRow(`SELECT COALESCE(SUM(storage_bytes), 0) FROM user_storage_entitlements WHERE user_id = `+b.placeholder(1)+` AND expires_at > `+b.placeholder(2), userID, now).Scan(&totalBytes); err != nil {
		rollback()
		return "", false, false, 0, 0, err
	}
	if totalBytes <= 0 {
		rollback()
		return "", false, true, 0, 0, nil
	}
	var usedBytes, reservedBytes int64
	if err := tx.QueryRow(`SELECT COALESCE(SUM(size_bytes), 0) FROM media_assets WHERE owner_id = `+b.placeholder(1)+` AND media_type = 'image' AND status IN ('ready', 'pending') AND deleted_at = ''`, userID).Scan(&usedBytes); err != nil {
		rollback()
		return "", true, false, 0, totalBytes, err
	}
	if err := tx.QueryRow(`SELECT COALESCE(SUM(size_bytes), 0) FROM media_capacity_reservations WHERE user_id = `+b.placeholder(1)+` AND released = 0 AND lease_until > `+b.placeholder(2), userID, now).Scan(&reservedBytes); err != nil {
		rollback()
		return "", true, false, usedBytes, totalBytes, err
	}
	if usedBytes+reservedBytes > totalBytes-sizeBytes {
		rollback()
		return "", true, false, usedBytes + reservedBytes, totalBytes, nil
	}
	id := uuid.NewString()
	leaseUntil := storageCapacityLeaseUntil(now, leaseSeconds)
	query := `INSERT INTO media_capacity_reservations (id, user_id, size_bytes, lease_until, released) VALUES (` + b.placeholder(1) + `, ` + b.placeholder(2) + `, ` + b.placeholder(3) + `, ` + b.placeholder(4) + `, 0)`
	if _, err := tx.Exec(query, id, userID, sizeBytes, leaseUntil); err != nil {
		rollback()
		return "", true, false, usedBytes, totalBytes, err
	}
	if err := tx.Commit(); err != nil {
		return "", true, false, usedBytes, totalBytes, err
	}
	return id, true, true, usedBytes + reservedBytes, totalBytes, nil
}

func ensureMediaCapacityLockRow(tx *sql.Tx, driver, placeholder, userID string) error {
	query := `INSERT OR IGNORE INTO media_capacity_keys (user_id) VALUES (` + placeholder + `)`
	if driver == "postgres" {
		query = `INSERT INTO media_capacity_keys (user_id) VALUES (` + placeholder + `) ON CONFLICT (user_id) DO NOTHING`
	} else if driver == "mysql" {
		query = `INSERT IGNORE INTO media_capacity_keys (user_id) VALUES (` + placeholder + `)`
	}
	_, err := tx.Exec(query, userID)
	return err
}

func (b *DatabaseBackend) ReleaseStorageCapacity(reservationID string) error {
	if b == nil || b.db == nil {
		return fmt.Errorf("database backend is not ready")
	}
	reservationID = strings.TrimSpace(reservationID)
	if reservationID == "" {
		return nil
	}
	_, err := b.db.Exec(`UPDATE media_capacity_reservations SET released = 1 WHERE id = `+b.placeholder(1), reservationID)
	return err
}

func storageCapacityLeaseUntil(now string, seconds int) string {
	parsed, err := time.Parse(time.RFC3339Nano, now)
	if err != nil {
		return now
	}
	return parsed.Add(time.Duration(seconds) * time.Second).Format(time.RFC3339Nano)
}
