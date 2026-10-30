package storage

import (
	"database/sql"
	"errors"
	"strings"
)

const paymentReconciliationRunSelect = `SELECT id, channel_id, channel_version_id,
	bill_date, status, archive_path, hash_type, hash_value, bill_rows, matched_orders,
	missing_local_orders, missing_bill_orders, amount_mismatches, status_mismatches,
	skipped_external, last_error, started_at, finished_at, created_at, updated_at
	FROM payment_reconciliation_runs WHERE `

func (b *DatabaseBackend) CreateOrLoadPaymentReconciliationRun(run PaymentReconciliationRunRecord) (PaymentReconciliationRunRecord, bool, error) {
	run = normalizePaymentReconciliationRun(run)
	if err := validatePaymentReconciliationRun(run); err != nil {
		return PaymentReconciliationRunRecord{}, false, err
	}
	_, err := b.db.Exec(`INSERT INTO payment_reconciliation_runs (
		id, channel_id, channel_version_id, bill_date, status, archive_path, hash_type,
		hash_value, bill_rows, matched_orders, missing_local_orders, missing_bill_orders,
		amount_mismatches, status_mismatches, skipped_external, last_error, started_at,
		finished_at, created_at, updated_at
	) VALUES (`+b.paymentPlaceholders(20)+`)`, paymentReconciliationArgs(run)...)
	if err == nil {
		return run, true, nil
	}
	if !b.isUniqueConflict(err) {
		return PaymentReconciliationRunRecord{}, false, err
	}
	existing, loadErr := b.loadPaymentReconciliationByChannelDate(run.ChannelID, run.BillDate)
	if loadErr != nil {
		return PaymentReconciliationRunRecord{}, false, loadErr
	}
	return existing, false, nil
}

func (b *DatabaseBackend) ClaimPaymentReconciliationRun(id, startedAt string) (bool, error) {
	id, startedAt = strings.TrimSpace(id), strings.TrimSpace(startedAt)
	if id == "" || startedAt == "" {
		return false, errors.New("对账任务领取字段无效")
	}
	result, err := b.db.Exec(`UPDATE payment_reconciliation_runs SET status = `+b.placeholder(1)+`, started_at = `+b.placeholder(2)+`, finished_at = '', updated_at = `+b.placeholder(3)+`, last_error = '' WHERE id = `+b.placeholder(4)+` AND status IN (`+b.placeholder(5)+`, `+b.placeholder(6)+`)`, PaymentReconciliationStatusRunning, startedAt, startedAt, id, PaymentReconciliationStatusPending, PaymentReconciliationStatusFailed)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows == 1, err
}

func (b *DatabaseBackend) ResetInterruptedPaymentReconciliations(updatedAt string) (int, error) {
	updatedAt = strings.TrimSpace(updatedAt)
	if updatedAt == "" {
		return 0, errors.New("对账恢复时间无效")
	}
	result, err := b.db.Exec(`UPDATE payment_reconciliation_runs SET status = `+b.placeholder(1)+`, last_error = `+b.placeholder(2)+`, finished_at = `+b.placeholder(3)+`, updated_at = `+b.placeholder(4)+` WHERE status = `+b.placeholder(5), PaymentReconciliationStatusFailed, "服务重启中断，等待重新执行", updatedAt, updatedAt, PaymentReconciliationStatusRunning)
	if err != nil {
		return 0, err
	}
	count, err := result.RowsAffected()
	return int(count), err
}

func (b *DatabaseBackend) CompletePaymentReconciliationRun(run PaymentReconciliationRunRecord, items []PaymentReconciliationItemRecord) error {
	run = normalizePaymentReconciliationRun(run)
	if run.ID == "" || run.Status != PaymentReconciliationStatusSucceeded {
		return errors.New("对账任务完成状态无效")
	}
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.Exec(`UPDATE payment_reconciliation_runs SET status = `+b.placeholder(1)+`, archive_path = `+b.placeholder(2)+`, hash_type = `+b.placeholder(3)+`, hash_value = `+b.placeholder(4)+`, bill_rows = `+b.placeholder(5)+`, matched_orders = `+b.placeholder(6)+`, missing_local_orders = `+b.placeholder(7)+`, missing_bill_orders = `+b.placeholder(8)+`, amount_mismatches = `+b.placeholder(9)+`, status_mismatches = `+b.placeholder(10)+`, skipped_external = `+b.placeholder(11)+`, last_error = '', finished_at = `+b.placeholder(12)+`, updated_at = `+b.placeholder(13)+` WHERE id = `+b.placeholder(14)+` AND status = `+b.placeholder(15), PaymentReconciliationStatusSucceeded, run.ArchivePath, run.HashType, run.HashValue, run.BillRows, run.MatchedOrders, run.MissingLocalOrders, run.MissingBillOrders, run.AmountMismatches, run.StatusMismatches, run.SkippedExternal, run.FinishedAt, run.UpdatedAt, run.ID, PaymentReconciliationStatusRunning)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil || affected != 1 {
		if err != nil {
			return err
		}
		return errors.New("对账任务不在 running 状态")
	}
	stmt, err := tx.Prepare(`INSERT INTO payment_reconciliation_items (
		id, run_id, category, out_trade_no, transaction_id, local_order_id,
		bill_amount_fen, local_amount_fen, detail, created_at
	) VALUES (` + b.paymentPlaceholders(10) + `)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, item := range items {
		if strings.TrimSpace(item.ID) == "" || strings.TrimSpace(item.RunID) != run.ID || strings.TrimSpace(item.Category) == "" {
			return errors.New("对账明细字段无效")
		}
		if _, err := stmt.Exec(item.ID, run.ID, strings.TrimSpace(item.Category), strings.TrimSpace(item.OutTradeNo), strings.TrimSpace(item.TransactionID), strings.TrimSpace(item.LocalOrderID), item.BillAmountFen, item.LocalAmountFen, strings.TrimSpace(item.Detail), strings.TrimSpace(item.CreatedAt)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (b *DatabaseBackend) FailPaymentReconciliationRun(id, lastError, finishedAt string) error {
	id, finishedAt = strings.TrimSpace(id), strings.TrimSpace(finishedAt)
	if id == "" || finishedAt == "" {
		return errors.New("对账任务失败字段无效")
	}
	result, err := b.db.Exec(`UPDATE payment_reconciliation_runs SET status = `+b.placeholder(1)+`, last_error = `+b.placeholder(2)+`, finished_at = `+b.placeholder(3)+`, updated_at = `+b.placeholder(4)+` WHERE id = `+b.placeholder(5)+` AND status = `+b.placeholder(6), PaymentReconciliationStatusFailed, strings.TrimSpace(lastError), finishedAt, finishedAt, id, PaymentReconciliationStatusRunning)
	if err != nil {
		return err
	}
	return b.requirePaymentRowUpdated(result, b.db, "payment_reconciliation_runs", `id = `+b.placeholder(1)+` AND status = `+b.placeholder(2), id, PaymentReconciliationStatusRunning)
}

func (b *DatabaseBackend) LoadPaymentReconciliationRun(id string) (PaymentReconciliationRunRecord, error) {
	row := b.db.QueryRow(paymentReconciliationRunSelect+`id = `+b.placeholder(1), strings.TrimSpace(id))
	item, err := scanPaymentReconciliationRun(row)
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentReconciliationRunRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) loadPaymentReconciliationByChannelDate(channelID, billDate string) (PaymentReconciliationRunRecord, error) {
	row := b.db.QueryRow(paymentReconciliationRunSelect+`channel_id = `+b.placeholder(1)+` AND bill_date = `+b.placeholder(2), channelID, billDate)
	item, err := scanPaymentReconciliationRun(row)
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentReconciliationRunRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) QueryPaymentReconciliationRuns(filter PaymentReconciliationFilter) ([]PaymentReconciliationRunRecord, int, error) {
	if filter.Page <= 0 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 25
	}
	if filter.PageSize > 100 {
		filter.PageSize = 100
	}
	where, args := "1 = 1", make([]any, 0, 3)
	if strings.TrimSpace(filter.ChannelID) != "" {
		args = append(args, strings.TrimSpace(filter.ChannelID))
		where += ` AND channel_id = ` + b.placeholder(len(args))
	}
	if strings.TrimSpace(filter.Status) != "" {
		args = append(args, strings.TrimSpace(filter.Status))
		where += ` AND status = ` + b.placeholder(len(args))
	}
	if strings.TrimSpace(filter.BillDate) != "" {
		args = append(args, strings.TrimSpace(filter.BillDate))
		where += ` AND bill_date = ` + b.placeholder(len(args))
	}
	var total int
	if err := b.db.QueryRow(`SELECT COUNT(*) FROM payment_reconciliation_runs WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	queryArgs := append(append([]any(nil), args...), filter.PageSize, (filter.Page-1)*filter.PageSize)
	rows, err := b.db.Query(paymentReconciliationRunSelect+where+` ORDER BY bill_date DESC, id DESC LIMIT `+b.placeholder(len(args)+1)+` OFFSET `+b.placeholder(len(args)+2), queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]PaymentReconciliationRunRecord, 0)
	for rows.Next() {
		item, err := scanPaymentReconciliationRun(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (b *DatabaseBackend) QueryPaymentReconciliationItems(runID string, filter PaymentReconciliationItemFilter) ([]PaymentReconciliationItemRecord, int, error) {
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return nil, 0, errors.New("对账任务 ID 无效")
	}
	if _, err := b.LoadPaymentReconciliationRun(runID); err != nil {
		return nil, 0, err
	}
	if filter.Page <= 0 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 25
	}
	if filter.PageSize > 100 {
		filter.PageSize = 100
	}
	where, args := `run_id = `+b.placeholder(1), []any{runID}
	if category := strings.TrimSpace(filter.Category); category != "" {
		args = append(args, category)
		where += ` AND category = ` + b.placeholder(len(args))
	}
	var total int
	if err := b.db.QueryRow(`SELECT COUNT(*) FROM payment_reconciliation_items WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	queryArgs := append(append([]any(nil), args...), filter.PageSize, (filter.Page-1)*filter.PageSize)
	rows, err := b.db.Query(`SELECT id, run_id, category, out_trade_no, transaction_id, local_order_id,
		bill_amount_fen, local_amount_fen, detail, created_at
		FROM payment_reconciliation_items WHERE `+where+` ORDER BY created_at ASC, id ASC LIMIT `+b.placeholder(len(args)+1)+` OFFSET `+b.placeholder(len(args)+2), queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]PaymentReconciliationItemRecord, 0)
	for rows.Next() {
		var item PaymentReconciliationItemRecord
		if err := rows.Scan(&item.ID, &item.RunID, &item.Category, &item.OutTradeNo, &item.TransactionID, &item.LocalOrderID, &item.BillAmountFen, &item.LocalAmountFen, &item.Detail, &item.CreatedAt); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (b *DatabaseBackend) ListSucceededPaymentOrdersForReconciliation(channelID, paidStart, paidEnd string) ([]PaymentOrderRecord, error) {
	rows, err := b.db.Query(paymentOrderSelect+`channel_id = `+b.placeholder(1)+` AND status = `+b.placeholder(2)+` AND paid_at >= `+b.placeholder(3)+` AND paid_at < `+b.placeholder(4)+` ORDER BY `+b.utcSortableExpr("paid_at")+` ASC, id ASC`, strings.TrimSpace(channelID), PaymentOrderStatusSucceeded, normalizeUTCZeroNanoBoundString(paidStart), normalizeUTCZeroNanoBoundString(paidEnd))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PaymentOrderRecord, 0)
	for rows.Next() {
		item, err := scanPaymentOrder(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (b *DatabaseBackend) LoadPaymentOrdersByOutTradeNos(outTradeNos []string) ([]PaymentOrderRecord, error) {
	unique := make([]string, 0, len(outTradeNos))
	seen := make(map[string]struct{}, len(outTradeNos))
	for _, value := range outTradeNos {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	items := make([]PaymentOrderRecord, 0, len(unique))
	const batchSize = 500
	for start := 0; start < len(unique); start += batchSize {
		end := start + batchSize
		if end > len(unique) {
			end = len(unique)
		}
		args := make([]any, 0, end-start)
		for _, value := range unique[start:end] {
			args = append(args, value)
		}
		rows, err := b.db.Query(paymentOrderSelect+`out_trade_no IN (`+b.boundPlaceholders(1, len(args))+`)`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			item, scanErr := scanPaymentOrder(rows)
			if scanErr != nil {
				_ = rows.Close()
				return nil, scanErr
			}
			items = append(items, item)
		}
		err = rows.Err()
		_ = rows.Close()
		if err != nil {
			return nil, err
		}
	}
	return items, nil
}

func normalizePaymentReconciliationRun(run PaymentReconciliationRunRecord) PaymentReconciliationRunRecord {
	run.ID, run.ChannelID, run.ChannelVersionID = strings.TrimSpace(run.ID), strings.TrimSpace(run.ChannelID), strings.TrimSpace(run.ChannelVersionID)
	run.BillDate, run.Status, run.ArchivePath = strings.TrimSpace(run.BillDate), strings.TrimSpace(run.Status), strings.TrimSpace(run.ArchivePath)
	run.HashType, run.HashValue, run.LastError = strings.TrimSpace(run.HashType), strings.TrimSpace(run.HashValue), strings.TrimSpace(run.LastError)
	return run
}

func validatePaymentReconciliationRun(run PaymentReconciliationRunRecord) error {
	if run.ID == "" || run.ChannelID == "" || run.ChannelVersionID == "" || run.BillDate == "" || run.Status == "" || run.CreatedAt == "" || run.UpdatedAt == "" {
		return errors.New("对账任务缺少必要字段")
	}
	return nil
}

func paymentReconciliationArgs(run PaymentReconciliationRunRecord) []any {
	return []any{run.ID, run.ChannelID, run.ChannelVersionID, run.BillDate, run.Status, run.ArchivePath, run.HashType, run.HashValue, run.BillRows, run.MatchedOrders, run.MissingLocalOrders, run.MissingBillOrders, run.AmountMismatches, run.StatusMismatches, run.SkippedExternal, run.LastError, run.StartedAt, run.FinishedAt, run.CreatedAt, run.UpdatedAt}
}

func scanPaymentReconciliationRun(row rowScanner) (PaymentReconciliationRunRecord, error) {
	var item PaymentReconciliationRunRecord
	err := row.Scan(&item.ID, &item.ChannelID, &item.ChannelVersionID, &item.BillDate, &item.Status, &item.ArchivePath, &item.HashType, &item.HashValue, &item.BillRows, &item.MatchedOrders, &item.MissingLocalOrders, &item.MissingBillOrders, &item.AmountMismatches, &item.StatusMismatches, &item.SkippedExternal, &item.LastError, &item.StartedAt, &item.FinishedAt, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
