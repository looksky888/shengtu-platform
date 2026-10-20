package storage

import (
	"database/sql"
	"fmt"
	"strings"
)

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
