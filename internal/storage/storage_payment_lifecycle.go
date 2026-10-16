package storage

import (
	"errors"
	"strings"
)

const maxPaymentLifecycleBatch = 500

func (b *DatabaseBackend) ListPaymentOrdersDue(now string, limit int) ([]PaymentOrderRecord, error) {
	now = strings.TrimSpace(now)
	if now == "" {
		return nil, errors.New("支付订单扫描时间为空")
	}
	if limit <= 0 || limit > maxPaymentLifecycleBatch {
		limit = maxPaymentLifecycleBatch
	}
	query := paymentOrderSelect + `(status IN (` + b.paymentPlaceholders(2) + `)
		AND expires_at <= ` + b.placeholder(3) + ` OR status = ` + b.placeholder(4) + `)
		ORDER BY last_query_at ASC, expires_at ASC LIMIT ` + b.placeholder(5)
	rows, err := b.db.Query(query, PaymentOrderStatusCreated, PaymentOrderStatusPending,
		now, PaymentOrderStatusClosing, limit)
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

func (b *DatabaseBackend) RecordPaymentOrderQuery(update PaymentOrderQueryUpdate) error {
	update.OrderID = strings.TrimSpace(update.OrderID)
	update.TradeState = strings.TrimSpace(update.TradeState)
	update.TradeStateDesc = strings.TrimSpace(update.TradeStateDesc)
	update.LastQueryAt = strings.TrimSpace(update.LastQueryAt)
	update.LastErrorCode = strings.TrimSpace(update.LastErrorCode)
	update.LastErrorMessage = strings.TrimSpace(update.LastErrorMessage)
	if update.OrderID == "" || update.LastQueryAt == "" {
		return errors.New("支付订单查单结果缺少必要字段")
	}
	result, err := b.db.Exec(`UPDATE payment_orders SET
		provider_trade_state = COALESCE(NULLIF(`+b.placeholder(1)+`, ''), provider_trade_state),
		provider_trade_desc = COALESCE(NULLIF(`+b.placeholder(2)+`, ''), provider_trade_desc),
		last_query_at = `+b.placeholder(3)+`, query_attempts = query_attempts + 1,
		last_error_code = `+b.placeholder(4)+`, last_error_message = `+b.placeholder(5)+`,
		updated_at = `+b.placeholder(6)+` WHERE id = `+b.placeholder(7)+`
		AND status IN (`+b.paymentPlaceholdersFrom(8, 3)+`)`, update.TradeState,
		update.TradeStateDesc, update.LastQueryAt, update.LastErrorCode,
		update.LastErrorMessage, update.LastQueryAt, update.OrderID,
		PaymentOrderStatusCreated, PaymentOrderStatusPending, PaymentOrderStatusClosing)
	if err != nil {
		return err
	}
	return b.allowTerminalPaymentOrder(result, update.OrderID)
}

func (b *DatabaseBackend) MarkPaymentOrderClosing(orderID, updatedAt, lastErrorCode, lastErrorMessage string) error {
	orderID, updatedAt = strings.TrimSpace(orderID), strings.TrimSpace(updatedAt)
	if orderID == "" || updatedAt == "" {
		return errors.New("支付订单关单状态字段无效")
	}
	result, err := b.db.Exec(`UPDATE payment_orders SET status = `+b.placeholder(1)+`,
		code_url = '', last_error_code = `+b.placeholder(2)+`, last_error_message = `+b.placeholder(3)+`,
		updated_at = `+b.placeholder(4)+` WHERE id = `+b.placeholder(5)+`
		AND status IN (`+b.paymentPlaceholdersFrom(6, 3)+`)`, PaymentOrderStatusClosing,
		strings.TrimSpace(lastErrorCode), strings.TrimSpace(lastErrorMessage), updatedAt, orderID,
		PaymentOrderStatusCreated, PaymentOrderStatusPending, PaymentOrderStatusClosing)
	if err != nil {
		return err
	}
	return b.allowTerminalPaymentOrder(result, orderID)
}

func (b *DatabaseBackend) MarkPaymentOrderClosed(orderID, closedAt, lastErrorCode, lastErrorMessage string) error {
	orderID, closedAt = strings.TrimSpace(orderID), strings.TrimSpace(closedAt)
	if orderID == "" || closedAt == "" {
		return errors.New("支付订单关闭字段无效")
	}
	result, err := b.db.Exec(`UPDATE payment_orders SET status = `+b.placeholder(1)+`,
		code_url = '', closed_at = `+b.placeholder(2)+`, last_error_code = `+b.placeholder(3)+`,
		last_error_message = `+b.placeholder(4)+`, updated_at = `+b.placeholder(5)+`
		WHERE id = `+b.placeholder(6)+` AND status IN (`+b.paymentPlaceholdersFrom(7, 3)+`)`,
		PaymentOrderStatusClosed, closedAt, strings.TrimSpace(lastErrorCode),
		strings.TrimSpace(lastErrorMessage), closedAt, orderID, PaymentOrderStatusCreated,
		PaymentOrderStatusPending, PaymentOrderStatusClosing)
	if err != nil {
		return err
	}
	return b.allowTerminalPaymentOrder(result, orderID)
}

func (b *DatabaseBackend) allowTerminalPaymentOrder(result interface{ RowsAffected() (int64, error) }, orderID string) error {
	affected, err := result.RowsAffected()
	if err != nil || affected == 1 {
		return err
	}
	item, loadErr := b.LoadPaymentOrderByID(orderID)
	if loadErr != nil {
		return loadErr
	}
	if item.Status == PaymentOrderStatusSucceeded || item.Status == PaymentOrderStatusClosed || item.Status == PaymentOrderStatusFailed {
		return nil
	}
	return ErrPaymentStateConflict
}

func (b *DatabaseBackend) paymentPlaceholdersFrom(start, count int) string {
	values := make([]string, count)
	for index := range values {
		values[index] = b.placeholder(start + index)
	}
	return strings.Join(values, ", ")
}
