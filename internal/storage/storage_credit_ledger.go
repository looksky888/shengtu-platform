package storage

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *DatabaseBackend) LoadRecentCreditLedger(limit int) ([]CreditLedgerRow, error) {
	if limit <= 0 {
		return []CreditLedgerRow{}, nil
	}
	query := `SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
		FROM (
			SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
			FROM credit_ledger
			ORDER BY created_at DESC, id DESC
			LIMIT ` + b.placeholder(1) + `
		) AS recent_ledger
		ORDER BY created_at ASC, id ASC`
	rows, err := b.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCreditLedgerRows(rows)
}

func (b *DatabaseBackend) LatestCreditLedgerByUser() ([]CreditLedgerRow, error) {
	rows, err := b.db.Query(
		`SELECT l.id, l.user_id, l.delta, l.balance_after, l.reason, l.ref_id, l.created_at
		 FROM credit_ledger l
		 INNER JOIN (
			SELECT user_id, MAX(created_at) AS max_created
			FROM credit_ledger
			GROUP BY user_id
		 ) latest ON l.user_id = latest.user_id AND l.created_at = latest.max_created
		 ORDER BY l.created_at ASC, l.id ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCreditLedgerRows(rows)
}

func (b *DatabaseBackend) LoadCreditLedgerByReason(reason string) ([]CreditLedgerRow, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return []CreditLedgerRow{}, nil
	}
	query := `SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
		FROM credit_ledger
		WHERE reason = ` + b.placeholder(1) + `
		ORDER BY created_at ASC, id ASC`
	rows, err := b.db.Query(query, reason)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCreditLedgerRows(rows)
}

func (b *DatabaseBackend) LoadCreditLedgerByUser(userID string) ([]CreditLedgerRow, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return []CreditLedgerRow{}, nil
	}
	query := `SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
		FROM credit_ledger
		WHERE user_id = ` + b.placeholder(1) + `
		ORDER BY created_at ASC, id ASC`
	rows, err := b.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCreditLedgerRows(rows)
}

func (b *DatabaseBackend) FindCreditLedgerByRef(userID, reason, refID string) (CreditLedgerRow, bool, error) {
	userID = strings.TrimSpace(userID)
	reason = strings.TrimSpace(reason)
	refID = strings.TrimSpace(refID)
	if userID == "" || reason == "" || refID == "" {
		return CreditLedgerRow{}, false, nil
	}
	query := `SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
		FROM credit_ledger
		WHERE user_id = ` + b.placeholder(1) + ` AND reason = ` + b.placeholder(2) + ` AND ref_id = ` + b.placeholder(3) + `
		ORDER BY created_at DESC, id DESC
		LIMIT 1`
	var row CreditLedgerRow
	err := b.db.QueryRow(query, userID, reason, refID).Scan(
		&row.ID, &row.UserID, &row.Delta, &row.BalanceAfter, &row.Reason, &row.RefID, &row.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return CreditLedgerRow{}, false, nil
	}
	if err != nil {
		return CreditLedgerRow{}, false, err
	}
	return normalizeCreditLedgerRow(row), true, nil
}

func (b *DatabaseBackend) HasCreditLedgerRefPrefix(userID, reason, refPrefix string) (bool, error) {
	userID = strings.TrimSpace(userID)
	reason = strings.TrimSpace(reason)
	refPrefix = strings.TrimSpace(refPrefix)
	if userID == "" || reason == "" || refPrefix == "" {
		return false, nil
	}
	pattern := escapeLikePattern(refPrefix) + "%"
	query := `SELECT 1 FROM credit_ledger
		WHERE user_id = ` + b.placeholder(1) + ` AND reason = ` + b.placeholder(2) + ` AND ref_id LIKE ` + b.placeholder(3) + likeEscapeClause + `
		LIMIT 1`
	var marker int
	err := b.db.QueryRow(query, userID, reason, pattern).Scan(&marker)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (b *DatabaseBackend) DeleteCreditLedgerByIDs(ids []string) error {
	cleaned := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		cleaned = append(cleaned, id)
	}
	if len(cleaned) == 0 {
		return nil
	}
	const batchSize = 500
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for start := 0; start < len(cleaned); start += batchSize {
		end := start + batchSize
		if end > len(cleaned) {
			end = len(cleaned)
		}
		chunk := cleaned[start:end]
		args := make([]any, len(chunk))
		for i, id := range chunk {
			args[i] = id
		}
		stmt := `DELETE FROM credit_ledger WHERE id IN (` + b.boundPlaceholders(1, len(chunk)) + `)`
		if _, err := tx.Exec(stmt, args...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (b *DatabaseBackend) LoadCreditLedger() ([]CreditLedgerRow, error) {
	rows, err := b.db.Query(
		`SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
		 FROM credit_ledger
		 ORDER BY created_at ASC, id ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCreditLedgerRows(rows)
}

func (b *DatabaseBackend) AppendCreditLedger(entries []CreditLedgerRow) error {
	if len(entries) == 0 {
		return nil
	}
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(b.insertCreditLedgerSQL())
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, row := range entries {
		row = normalizeCreditLedgerRow(row)
		if row.ID == "" || row.UserID == "" {
			continue
		}
		if _, err := stmt.Exec(row.ID, row.UserID, row.Delta, row.BalanceAfter, row.Reason, row.RefID, row.CreatedAt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (b *DatabaseBackend) ReplaceCreditLedger(entries []CreditLedgerRow) error {
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`DELETE FROM credit_ledger`); err != nil {
		return err
	}
	if len(entries) == 0 {
		return tx.Commit()
	}

	stmt, err := tx.Prepare(b.insertCreditLedgerSQL())
	if err != nil {
		return err
	}
	defer stmt.Close()

	seen := map[string]struct{}{}
	for _, row := range entries {
		row = normalizeCreditLedgerRow(row)
		if row.ID == "" || row.UserID == "" {
			continue
		}
		if _, ok := seen[row.ID]; ok {
			continue
		}
		seen[row.ID] = struct{}{}
		if _, err := stmt.Exec(row.ID, row.UserID, row.Delta, row.BalanceAfter, row.Reason, row.RefID, row.CreatedAt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (b *DatabaseBackend) CountCreditLedger() (int, error) {
	var n int
	err := b.db.QueryRow(`SELECT COUNT(*) FROM credit_ledger`).Scan(&n)
	return n, err
}

func (b *DatabaseBackend) QueryCreditLedger(filter CreditLedgerFilter) ([]CreditLedgerRow, int, error) {
	page := filter.Page
	pageSize := filter.PageSize
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}

	where, args := b.buildCreditLedgerWhere(filter)
	countSQL := `SELECT COUNT(*) FROM credit_ledger` + where
	var total int
	if err := b.db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	listSQL := `SELECT id, user_id, delta, balance_after, reason, ref_id, created_at
		FROM credit_ledger` + where +
		` ORDER BY created_at DESC, id DESC LIMIT ` + b.placeholder(len(args)+1) +
		` OFFSET ` + b.placeholder(len(args)+2)
	listArgs := append(append([]any{}, args...), pageSize, offset)
	rows, err := b.db.Query(listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items, err := scanCreditLedgerRows(rows)
	if err != nil {
		return nil, 0, err
	}
	if items == nil {
		items = []CreditLedgerRow{}
	}
	return items, total, nil
}

func (b *DatabaseBackend) buildCreditLedgerWhere(filter CreditLedgerFilter) (string, []any) {
	var parts []string
	var args []any

	if userID := strings.TrimSpace(filter.UserID); userID != "" {
		args = append(args, userID)
		parts = append(parts, "user_id = "+b.placeholder(len(args)))
	}
	if reason := strings.TrimSpace(filter.Reason); reason != "" {
		args = append(args, reason)
		parts = append(parts, "reason = "+b.placeholder(len(args)))
	}
	if start := strings.TrimSpace(filter.StartAt); start != "" {
		args = append(args, start)
		// Date-only bounds compare the leading YYYY-MM-DD so ISO and local formats both match.
		if len(start) == 10 {
			parts = append(parts, "substr(created_at, 1, 10) >= "+b.placeholder(len(args)))
		} else {
			parts = append(parts, "created_at >= "+b.placeholder(len(args)))
		}
	}
	if end := strings.TrimSpace(filter.EndAt); end != "" {
		args = append(args, end)
		if len(end) == 10 {
			parts = append(parts, "substr(created_at, 1, 10) <= "+b.placeholder(len(args)))
		} else {
			parts = append(parts, "created_at <= "+b.placeholder(len(args)))
		}
	}
	if kw := strings.ToLower(strings.TrimSpace(filter.Keyword)); kw != "" {
		like := likeContainsPattern(kw)
		start := len(args) + 1
		for i := 0; i < 6; i++ {
			args = append(args, like)
		}
		cast := "TEXT"
		if b.driver == "mysql" {
			cast = "CHAR"
		}
		parts = append(parts, fmt.Sprintf(
			`(LOWER(id) LIKE %s ESCAPE '!' OR LOWER(user_id) LIKE %s ESCAPE '!' OR LOWER(reason) LIKE %s ESCAPE '!' OR LOWER(ref_id) LIKE %s ESCAPE '!' OR CAST(delta AS %s) LIKE %s ESCAPE '!' OR CAST(balance_after AS %s) LIKE %s ESCAPE '!')`,
			b.placeholder(start), b.placeholder(start+1), b.placeholder(start+2),
			b.placeholder(start+3), cast, b.placeholder(start+4), cast, b.placeholder(start+5),
		))
	}

	if len(parts) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(parts, " AND "), args
}

func (b *DatabaseBackend) insertCreditLedgerSQL() string {
	switch b.driver {
	case "postgres":
		return `INSERT INTO credit_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (id) DO NOTHING`
	case "mysql":
		return `INSERT IGNORE INTO credit_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`
	default: // sqlite
		return `INSERT OR IGNORE INTO credit_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`
	}
}

func scanCreditLedgerRows(rows *sql.Rows) ([]CreditLedgerRow, error) {
	out := make([]CreditLedgerRow, 0)
	for rows.Next() {
		var row CreditLedgerRow
		if err := rows.Scan(&row.ID, &row.UserID, &row.Delta, &row.BalanceAfter, &row.Reason, &row.RefID, &row.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, normalizeCreditLedgerRow(row))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func normalizeCreditLedgerRow(row CreditLedgerRow) CreditLedgerRow {
	row.ID = strings.TrimSpace(row.ID)
	row.UserID = strings.TrimSpace(row.UserID)
	row.Reason = strings.TrimSpace(row.Reason)
	row.RefID = strings.TrimSpace(row.RefID)
	row.CreatedAt = strings.TrimSpace(row.CreatedAt)
	return row
}
