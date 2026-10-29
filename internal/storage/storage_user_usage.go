package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

const userUsageAggregateInitialized = "initialized"

type databaseLogRecord struct {
	createdAt string
	logType   string
	day       string
	data      string
}

func newDatabaseLogRecord(item map[string]any) (databaseLogRecord, error) {
	if item == nil {
		item = map[string]any{}
	}
	item["type"] = "event"
	data, err := json.Marshal(item)
	if err != nil {
		return databaseLogRecord{}, err
	}
	createdAt := strings.TrimSpace(fmt.Sprint(item["time"]))
	if createdAt == "" {
		createdAt = util.NowLocal()
	}
	day := logDay(createdAt)
	if day == "" {
		day = util.ChinaDate()
	}
	return databaseLogRecord{createdAt: createdAt, logType: "event", day: day, data: string(data)}, nil
}

func (b *DatabaseBackend) LoadUserUsageAggregate() ([]UserUsageAggregateRow, bool, error) {
	var marker string
	err := b.reader().QueryRow(
		"SELECT value FROM user_usage_aggregate_meta WHERE name = "+b.placeholder(1),
		userUsageAggregateInitialized,
	).Scan(&marker)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if marker != "1" {
		return nil, false, nil
	}
	rows, err := b.reader().Query(`SELECT user_id, day, calls, success, failure, quota_used
		FROM user_usage_aggregate ORDER BY user_id, day`)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := make([]UserUsageAggregateRow, 0)
	for rows.Next() {
		var row UserUsageAggregateRow
		if err := rows.Scan(&row.UserID, &row.Day, &row.Calls, &row.Success, &row.Failure, &row.QuotaUsed); err != nil {
			return nil, false, err
		}
		row = normalizeUserUsageAggregateRow(row)
		if err := validateUserUsageAggregateRow(row, false); err != nil {
			return nil, false, err
		}
		out = append(out, row)
	}
	return out, true, rows.Err()
}

func (b *DatabaseBackend) ReplaceUserUsageAggregate(rows []UserUsageAggregateRow) error {
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`DELETE FROM user_usage_aggregate`); err != nil {
		return err
	}
	if err := insertUserUsageAggregateRows(tx, b, rows); err != nil {
		return err
	}
	if err := setUserUsageAggregateInitialized(tx, b); err != nil {
		return err
	}
	return tx.Commit()
}

// AppendLogWithUserUsage makes raw event and its aggregate delta one transaction.
func (b *DatabaseBackend) AppendLogWithUserUsage(item map[string]any, delta UserUsageAggregateRow) error {
	delta = normalizeUserUsageAggregateRow(delta)
	if err := validateUserUsageAggregateRow(delta, true); err != nil {
		return err
	}
	record, err := newDatabaseLogRecord(item)
	if err != nil {
		return err
	}
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(
		"INSERT INTO logs (created_at, type, day, data) VALUES ("+b.placeholder(1)+", "+b.placeholder(2)+", "+b.placeholder(3)+", "+b.placeholder(4)+")",
		record.createdAt, record.logType, record.day, record.data,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(b.upsertUserUsageAggregateSQL(), delta.UserID, delta.Day, delta.Calls, delta.Success, delta.Failure, delta.QuotaUsed); err != nil {
		return err
	}
	return tx.Commit()
}

func (b *DatabaseBackend) DeleteUserUsageAggregateBefore(day string) error {
	day = strings.TrimSpace(day)
	if day == "" {
		return nil
	}
	_, err := b.db.Exec("DELETE FROM user_usage_aggregate WHERE day < "+b.placeholder(1), day)
	return err
}

func insertUserUsageAggregateRows(tx *sql.Tx, b *DatabaseBackend, rows []UserUsageAggregateRow) error {
	stmt, err := tx.Prepare(b.insertUserUsageAggregateSQL())
	if err != nil {
		return err
	}
	defer stmt.Close()
	seen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		row = normalizeUserUsageAggregateRow(row)
		if row.UserID == "" || row.Day == "" {
			continue
		}
		if err := validateUserUsageAggregateRow(row, false); err != nil {
			return err
		}
		key := row.UserID + "\x00" + row.Day
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		if _, err := stmt.Exec(row.UserID, row.Day, row.Calls, row.Success, row.Failure, row.QuotaUsed); err != nil {
			return err
		}
	}
	return nil
}

func setUserUsageAggregateInitialized(tx *sql.Tx, b *DatabaseBackend) error {
	var stmt string
	switch b.driver {
	case "postgres":
		stmt = `INSERT INTO user_usage_aggregate_meta (name, value) VALUES ($1, $2)
			ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`
	case "mysql":
		stmt = `INSERT INTO user_usage_aggregate_meta (name, value) VALUES (?, ?)
			ON DUPLICATE KEY UPDATE value = VALUES(value)`
	default:
		stmt = `INSERT INTO user_usage_aggregate_meta (name, value) VALUES (?, ?)
			ON CONFLICT (name) DO UPDATE SET value = excluded.value`
	}
	_, err := tx.Exec(stmt, userUsageAggregateInitialized, "1")
	return err
}

func (b *DatabaseBackend) insertUserUsageAggregateSQL() string {
	if b.driver == "postgres" {
		return `INSERT INTO user_usage_aggregate (user_id, day, calls, success, failure, quota_used)
			VALUES ($1, $2, $3, $4, $5, $6)`
	}
	return `INSERT INTO user_usage_aggregate (user_id, day, calls, success, failure, quota_used)
		VALUES (?, ?, ?, ?, ?, ?)`
}

func (b *DatabaseBackend) upsertUserUsageAggregateSQL() string {
	switch b.driver {
	case "postgres":
		return `INSERT INTO user_usage_aggregate (user_id, day, calls, success, failure, quota_used)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (user_id, day) DO UPDATE SET
			calls = user_usage_aggregate.calls + EXCLUDED.calls,
			success = user_usage_aggregate.success + EXCLUDED.success,
			failure = user_usage_aggregate.failure + EXCLUDED.failure,
			quota_used = user_usage_aggregate.quota_used + EXCLUDED.quota_used`
	case "mysql":
		return `INSERT INTO user_usage_aggregate (user_id, day, calls, success, failure, quota_used)
			VALUES (?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
			calls = calls + VALUES(calls), success = success + VALUES(success),
			failure = failure + VALUES(failure), quota_used = quota_used + VALUES(quota_used)`
	default:
		return `INSERT INTO user_usage_aggregate (user_id, day, calls, success, failure, quota_used)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (user_id, day) DO UPDATE SET
			calls = user_usage_aggregate.calls + excluded.calls,
			success = user_usage_aggregate.success + excluded.success,
			failure = user_usage_aggregate.failure + excluded.failure,
			quota_used = user_usage_aggregate.quota_used + excluded.quota_used`
	}
}

func normalizeUserUsageAggregateRow(row UserUsageAggregateRow) UserUsageAggregateRow {
	row.UserID = strings.TrimSpace(row.UserID)
	row.Day = strings.TrimSpace(row.Day)
	return row
}

func validateUserUsageAggregateRow(row UserUsageAggregateRow, requireDelta bool) error {
	if row.UserID == "" || row.Day == "" {
		return fmt.Errorf("invalid user usage aggregate identity")
	}
	if row.Calls < 0 || row.Success < 0 || row.Failure < 0 || row.QuotaUsed < 0 {
		return fmt.Errorf("invalid negative user usage aggregate")
	}
	if requireDelta && (row.Calls == 0 || row.Success+row.Failure > row.Calls) {
		return fmt.Errorf("invalid user usage aggregate delta")
	}
	return nil
}
