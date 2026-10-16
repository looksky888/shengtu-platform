package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

func (b *DatabaseBackend) CompletePaymentStorage(input PaymentStorageCompletion) (PaymentOrderRecord, bool, error) {
	input = normalizePaymentStorageCompletion(input)
	if err := validatePaymentStorageCompletion(input); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	tx, err := b.db.Begin()
	if err != nil {
		return PaymentOrderRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()

	order, err := b.loadPaymentOrderTx(tx, input.OrderID)
	if err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if order.Status == PaymentOrderStatusSucceeded {
		if order.TransactionID != input.TransactionID {
			return PaymentOrderRecord{}, false, ErrPaymentTransactionConflict
		}
		if err := tx.Commit(); err != nil {
			return PaymentOrderRecord{}, false, err
		}
		return order, false, nil
	}
	if order.Status == PaymentOrderStatusClosed || order.Status == PaymentOrderStatusFailed {
		return PaymentOrderRecord{}, false, ErrPaymentStateConflict
	}
	if order.ProductTypeSnapshot != "cloud_storage" || order.UserID != input.Entitlement.UserID ||
		order.StorageBytesSnapshot != input.Entitlement.StorageBytes || order.ProductID != input.Entitlement.ProductID {
		return PaymentOrderRecord{}, false, errors.New("payment storage snapshot mismatch")
	}
	baseExpiry := input.CreditedAt
	var currentExpiry sql.NullString
	query := `SELECT MAX(expires_at) FROM user_storage_entitlements WHERE user_id = ` + b.placeholder(1) + ` AND expires_at > ` + b.placeholder(2)
	if err := tx.QueryRow(query, order.UserID, input.CreditedAt).Scan(&currentExpiry); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if currentExpiry.Valid && currentExpiry.String > baseExpiry {
		baseExpiry = currentExpiry.String
	}
	base, err := time.Parse(time.RFC3339Nano, baseExpiry)
	if err != nil {
		return PaymentOrderRecord{}, false, errors.New("storage entitlement base expiry invalid")
	}
	expiresAt := base.AddDate(0, 0, order.StorageDaysSnapshot).UTC().Format(time.RFC3339Nano)
	if _, err := tx.Exec(`UPDATE user_storage_entitlements SET expires_at = `+b.placeholder(1)+`, updated_at = `+b.placeholder(2)+` WHERE user_id = `+b.placeholder(3)+` AND expires_at > `+b.placeholder(4), expiresAt, input.CreditedAt, order.UserID, input.CreditedAt); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	input.Entitlement.ExpiresAt = expiresAt
	if _, err := tx.Exec(`INSERT INTO user_storage_entitlements (id, user_id, source_order_id, product_id, storage_bytes, expires_at, created_at, updated_at) VALUES (`+b.paymentPlaceholders(8)+`)`, input.Entitlement.ID, input.Entitlement.UserID, input.Entitlement.SourceOrderID, input.Entitlement.ProductID, input.Entitlement.StorageBytes, input.Entitlement.ExpiresAt, input.Entitlement.CreatedAt, input.Entitlement.UpdatedAt); err != nil {
		if b.isUniqueConflict(err) {
			return PaymentOrderRecord{}, false, ErrPaymentTransactionConflict
		}
		return PaymentOrderRecord{}, false, err
	}
	if err := b.markPaymentStorageOrderSucceededTx(tx, input); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	order.Status, order.ProviderTradeState, order.ProviderTradeDesc = PaymentOrderStatusSucceeded, input.TradeState, input.TradeStateDesc
	order.TransactionID, order.PaidAt, order.CreditedAt, order.CodeURL = input.TransactionID, input.PaidAt, input.CreditedAt, ""
	order.UpdatedAt = input.CreditedAt
	return order, true, nil
}

func (b *DatabaseBackend) LoadActiveStorageEntitlement(userID, now string) (PaymentStorageEntitlementSummary, error) {
	userID, now = strings.TrimSpace(userID), strings.TrimSpace(now)
	if userID == "" || now == "" {
		return PaymentStorageEntitlementSummary{}, errors.New("storage entitlement query fields are required")
	}
	item := PaymentStorageEntitlementSummary{UserID: userID}
	var expiresAt sql.NullString
	err := b.db.QueryRow(`SELECT COALESCE(SUM(storage_bytes), 0), MAX(expires_at), COALESCE((SELECT SUM(size_bytes) FROM media_assets WHERE owner_id = `+b.placeholder(1)+` AND media_type = 'image' AND status IN ('ready', 'pending') AND deleted_at = ''), 0) FROM user_storage_entitlements WHERE user_id = `+b.placeholder(2)+` AND expires_at > `+b.placeholder(3), userID, userID, now).Scan(&item.StorageBytes, &expiresAt, &item.UsedBytes)
	if err != nil {
		return PaymentStorageEntitlementSummary{}, err
	}
	if expiresAt.Valid {
		item.ExpiresAt = expiresAt.String
	}
	return item, nil
}

func (b *DatabaseBackend) ListActiveStorageEntitlements(now string) (map[string]PaymentStorageEntitlementSummary, error) {
	now = strings.TrimSpace(now)
	if now == "" {
		return nil, errors.New("storage entitlement time is required")
	}
	rows, err := b.db.Query(`SELECT e.user_id, SUM(e.storage_bytes), MAX(e.expires_at), COALESCE((SELECT SUM(m.size_bytes) FROM media_assets m WHERE m.owner_id = e.user_id AND m.media_type = 'image' AND m.status IN ('ready', 'pending') AND m.deleted_at = ''), 0) FROM user_storage_entitlements e WHERE e.expires_at > `+b.placeholder(1)+` GROUP BY e.user_id`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]PaymentStorageEntitlementSummary)
	for rows.Next() {
		var item PaymentStorageEntitlementSummary
		if err := rows.Scan(&item.UserID, &item.StorageBytes, &item.ExpiresAt, &item.UsedBytes); err != nil {
			return nil, err
		}
		result[item.UserID] = item
	}
	return result, rows.Err()
}

func (b *DatabaseBackend) markPaymentStorageOrderSucceededTx(tx *sql.Tx, input PaymentStorageCompletion) error {
	result, err := tx.Exec(`UPDATE payment_orders SET status = `+b.placeholder(1)+`, provider_trade_state = `+b.placeholder(2)+`, provider_trade_desc = `+b.placeholder(3)+`, transaction_id = `+b.placeholder(4)+`, paid_at = `+b.placeholder(5)+`, credited_at = `+b.placeholder(6)+`, code_url = '', last_error_code = '', last_error_message = '', updated_at = `+b.placeholder(7)+` WHERE id = `+b.placeholder(8)+` AND status <> `+b.placeholder(9), PaymentOrderStatusSucceeded, input.TradeState, input.TradeStateDesc, input.TransactionID, input.PaidAt, input.CreditedAt, input.CreditedAt, input.OrderID, PaymentOrderStatusSucceeded)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err == nil && affected != 1 {
		return ErrPaymentStateConflict
	}
	return err
}

func normalizePaymentStorageCompletion(input PaymentStorageCompletion) PaymentStorageCompletion {
	input.OrderID = strings.TrimSpace(input.OrderID)
	input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
	input.TransactionID = strings.TrimSpace(input.TransactionID)
	input.MerchantID = strings.TrimSpace(input.MerchantID)
	input.PaidAt = strings.TrimSpace(input.PaidAt)
	input.CreditedAt = strings.TrimSpace(input.CreditedAt)
	input.TradeState = strings.TrimSpace(input.TradeState)
	input.TradeStateDesc = strings.TrimSpace(input.TradeStateDesc)
	input.Entitlement.UserID = strings.TrimSpace(input.Entitlement.UserID)
	input.Entitlement.SourceOrderID = strings.TrimSpace(input.Entitlement.SourceOrderID)
	input.Entitlement.ProductID = strings.TrimSpace(input.Entitlement.ProductID)
	return input
}

func validatePaymentStorageCompletion(input PaymentStorageCompletion) error {
	if input.OrderID == "" || input.Provider == "" || input.TransactionID == "" || input.MerchantID == "" || input.PaidAt == "" || input.CreditedAt == "" {
		return errors.New("payment storage completion 缺少必要字段")
	}
	e := input.Entitlement
	if e.ID == "" || e.UserID == "" || e.SourceOrderID != input.OrderID || e.ProductID == "" || e.StorageBytes <= 0 || e.CreatedAt == "" || e.UpdatedAt == "" {
		return fmt.Errorf("payment storage entitlement 无效")
	}
	return nil
}
