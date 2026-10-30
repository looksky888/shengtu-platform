package storage

import (
	"chatgpt2api/internal/util"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func (b *DatabaseBackend) LoadJSONDocument(name string) (any, error) {
	rel, err := cleanDocumentName(name)
	if err != nil {
		return nil, err
	}
	var text string
	err = b.reader().QueryRow("SELECT data FROM json_documents WHERE name = "+b.placeholder(1), rel).Scan(&text)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return decodeJSONString(text)
}

func (b *DatabaseBackend) SaveJSONDocument(name string, value any) error {
	rel, err := cleanDocumentName(name)
	if err != nil {
		return err
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	now := util.NowISO()
	var stmt string
	switch b.driver {
	case "postgres":
		stmt = "INSERT INTO json_documents (name, data, updated_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at"
	case "mysql":
		stmt = "REPLACE INTO json_documents (name, data, updated_at) VALUES (?, ?, ?)"
	default:
		stmt = "INSERT INTO json_documents (name, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
	}
	_, err = b.db.Exec(stmt, rel, string(data), now)
	return err
}

func (b *DatabaseBackend) DeleteJSONDocument(name string) error {
	rel, err := cleanDocumentName(name)
	if err != nil {
		return err
	}
	_, err = b.db.Exec("DELETE FROM json_documents WHERE name = "+b.placeholder(1), rel)
	return err
}

func (b *DatabaseBackend) ListJSONDocumentNamesByPrefix(prefix string) ([]string, error) {
	trimmed := strings.TrimSuffix(strings.TrimSpace(prefix), "/")
	rel, err := cleanDocumentName(trimmed)
	if err != nil {
		return nil, err
	}
	dirPrefix := rel + "/"
	// '/' is 0x2F and '0' is 0x30, giving an exact ASCII B-tree upper bound without LIKE '_' wildcard hazards.
	upperBound := rel + "0"
	query := "SELECT name FROM json_documents WHERE name >= " + b.placeholder(1) + " AND name < " + b.placeholder(2) + " ORDER BY name ASC"
	rows, err := b.reader().Query(query, dirPrefix, upperBound)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		if strings.HasPrefix(name, dirPrefix) {
			out = append(out, name)
		}
	}
	return out, rows.Err()
}

func (b *DatabaseBackend) DeleteJSONDocumentsBatch(names []string) (int, error) {
	if len(names) == 0 {
		return 0, nil
	}
	cleaned := make([]string, 0, len(names))
	for _, raw := range names {
		rel, err := cleanDocumentName(raw)
		if err != nil {
			continue
		}
		cleaned = append(cleaned, rel)
	}
	if len(cleaned) == 0 {
		return 0, nil
	}
	const chunkSize = 400
	removed := 0
	for start := 0; start < len(cleaned); start += chunkSize {
		end := start + chunkSize
		if end > len(cleaned) {
			end = len(cleaned)
		}
		chunk := cleaned[start:end]
		placeholders := make([]string, len(chunk))
		args := make([]any, len(chunk))
		for i, name := range chunk {
			placeholders[i] = b.placeholder(i + 1)
			args[i] = name
		}
		stmt := "DELETE FROM json_documents WHERE name IN (" + strings.Join(placeholders, ", ") + ")"
		res, err := b.db.Exec(stmt, args...)
		if err != nil {
			return removed, err
		}
		if n, affectedErr := res.RowsAffected(); affectedErr == nil {
			removed += int(n)
		}
	}
	return removed, nil
}

func (b *DatabaseBackend) AppendLog(item map[string]any) error {
	record, err := newDatabaseLogRecord(item)
	if err != nil {
		return err
	}
	_, err = b.db.Exec(
		"INSERT INTO logs (created_at, type, day, data) VALUES ("+b.placeholder(1)+", "+b.placeholder(2)+", "+b.placeholder(3)+", "+b.placeholder(4)+")",
		record.createdAt,
		record.logType,
		record.day,
		record.data,
	)
	return err
}

func (b *DatabaseBackend) LogSummary() (LogSummary, error) {
	row := b.reader().QueryRow("SELECT COUNT(*), COALESCE(MIN(created_at), ''), COALESCE(MAX(created_at), '') FROM logs")
	var summary LogSummary
	if err := row.Scan(&summary.Total, &summary.OldestTime, &summary.LatestTime); err != nil {
		return LogSummary{}, err
	}
	return summary, nil
}

func (b *DatabaseBackend) QueryLogs(startDate, endDate string, limit int) ([]map[string]any, error) {
	query := "SELECT data FROM logs"
	var filters []string
	var args []any
	if strings.TrimSpace(startDate) != "" {
		args = append(args, strings.TrimSpace(startDate))
		filters = append(filters, "day >= "+b.placeholder(len(args)))
	}
	if strings.TrimSpace(endDate) != "" {
		args = append(args, strings.TrimSpace(endDate))
		filters = append(filters, "day <= "+b.placeholder(len(args)))
	}
	if len(filters) > 0 {
		query += " WHERE " + strings.Join(filters, " AND ")
	}
	query += " ORDER BY id DESC"
	if limit > 0 {
		args = append(args, limit)
		query += " LIMIT " + b.placeholder(len(args))
	}
	rows, err := b.reader().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var text string
		if err := rows.Scan(&text); err != nil {
			continue
		}
		item, err := decodeJSONString(text)
		if err != nil {
			continue
		}
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out, rows.Err()
}

func (b *DatabaseBackend) QueryLogsBefore(startDate, endDate string, beforeID int64, limit int) ([]PagedLogRecord, error) {
	query := "SELECT id, data FROM logs"
	var filters []string
	var args []any
	if strings.TrimSpace(startDate) != "" {
		args = append(args, strings.TrimSpace(startDate))
		filters = append(filters, "day >= "+b.placeholder(len(args)))
	}
	if strings.TrimSpace(endDate) != "" {
		args = append(args, strings.TrimSpace(endDate))
		filters = append(filters, "day <= "+b.placeholder(len(args)))
	}
	if beforeID > 0 {
		args = append(args, beforeID)
		filters = append(filters, "id < "+b.placeholder(len(args)))
	}
	if len(filters) > 0 {
		query += " WHERE " + strings.Join(filters, " AND ")
	}
	query += " ORDER BY id DESC"
	if limit > 0 {
		args = append(args, limit)
		query += " LIMIT " + b.placeholder(len(args))
	}
	rows, err := b.reader().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]PagedLogRecord, 0, max(0, min(limit, 1024)))
	for rows.Next() {
		var rowID int64
		var text string
		if err := rows.Scan(&rowID, &text); err != nil {
			continue
		}
		item, err := decodeJSONString(text)
		if err != nil {
			continue
		}
		if m, ok := item.(map[string]any); ok {
			out = append(out, PagedLogRecord{ID: rowID, Item: m})
		}
	}
	return out, rows.Err()
}

func (b *DatabaseBackend) DeleteLogsBefore(day string) (int, error) {
	day = strings.TrimSpace(day)
	if day == "" {
		return 0, nil
	}
	result, err := b.db.Exec("DELETE FROM logs WHERE day < "+b.placeholder(1), day)
	if err != nil {
		return 0, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, nil
	}
	return int(rows), nil
}

func (b *DatabaseBackend) placeholder(index int) string {
	if b.driver == "postgres" {
		return fmt.Sprintf("$%d", index)
	}
	return "?"
}
