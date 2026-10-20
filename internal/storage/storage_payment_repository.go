package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrPaymentRecordNotFound = errors.New("payment record not found")

func (b *DatabaseBackend) LoadActiveRechargeProducts() ([]RechargeProductRecord, error) {
	rows, err := b.db.Query(`SELECT id, sku, name, description, amount_fen, credits, enabled,
		product_type, storage_days, storage_bytes, sort_order, created_by, updated_by, created_at, updated_at, archived_at
		FROM recharge_products WHERE enabled = ` + b.boolLiteral() + ` AND archived_at = '' ORDER BY sort_order ASC, created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]RechargeProductRecord, 0)
	for rows.Next() {
		item, err := scanRechargeProduct(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (b *DatabaseBackend) LoadActivePaymentChannels() ([]PaymentChannelRecord, error) {
	rows, err := b.db.Query(`SELECT id, code, name, provider, payment_method, enabled,
		is_default, active_version_id, notify_base_url, order_expire_minutes,
		created_by, updated_by, created_at, updated_at
		FROM payment_channels WHERE enabled = ` + b.boolLiteral() + ` AND active_version_id <> ''
		ORDER BY is_default DESC, created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PaymentChannelRecord, 0)
	for rows.Next() {
		item, err := scanPaymentChannel(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (b *DatabaseBackend) LoadPaymentChannelVersion(id string) (PaymentChannelVersionRecord, error) {
	row := b.db.QueryRow(`SELECT id, channel_id, version, app_id, merchant_id,
		merchant_cert_serial, merchant_private_key_cipher, api_v3_key_cipher, verify_mode,
		wechatpay_public_key_id, wechatpay_public_key_cipher, alipay_private_key_cipher,
		alipay_public_key_cipher, alipay_gateway, alipay_seller_id, config_fingerprint, status,
		created_by, created_at FROM payment_channel_versions WHERE id = `+b.placeholder(1), strings.TrimSpace(id))
	item, err := scanPaymentChannelVersion(row)
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentChannelVersionRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) CreatePaymentOrder(order PaymentOrderRecord) (PaymentOrderRecord, bool, error) {
	order = normalizePaymentOrder(order)
	if err := validatePaymentOrder(order); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	args := paymentOrderArgs(order)
	stmt := `INSERT INTO payment_orders (
		id, out_trade_no, user_id, idempotency_key, channel_id, channel_version_id,
		product_id, product_name_snapshot, amount_fen, credits_snapshot, product_type_snapshot,
		storage_days_snapshot, storage_bytes_snapshot, currency,
		expire_minutes_snapshot, expires_at, status, provider_trade_state,
		provider_trade_desc, transaction_id, code_url, provider_request_id,
		last_query_at, query_attempts, paid_at, credited_at, closed_at,
		last_error_code, last_error_message, created_at, updated_at
	) VALUES (` + b.paymentPlaceholders(31) + `)`
	result, err := b.db.Exec(stmt, args...)
	if err != nil {
		if !b.isUniqueConflict(err) {
			return PaymentOrderRecord{}, false, err
		}
		existing, loadErr := b.loadPaymentOrderByIdempotency(order.UserID, order.IdempotencyKey)
		if loadErr != nil {
			if errors.Is(loadErr, ErrPaymentRecordNotFound) {
				return PaymentOrderRecord{}, false, err
			}
			return PaymentOrderRecord{}, false, loadErr
		}
		return existing, false, nil
	}
	if affected, affectedErr := result.RowsAffected(); affectedErr == nil && affected == 0 {
		existing, loadErr := b.loadPaymentOrderByIdempotency(order.UserID, order.IdempotencyKey)
		return existing, false, loadErr
	}
	return order, true, nil
}

func (b *DatabaseBackend) LoadPaymentOrderByID(id string) (PaymentOrderRecord, error) {
	return b.loadPaymentOrder(`id = `+b.placeholder(1), strings.TrimSpace(id))
}

func (b *DatabaseBackend) LoadPaymentOrderByOutTradeNo(outTradeNo string) (PaymentOrderRecord, error) {
	return b.loadPaymentOrder(`out_trade_no = `+b.placeholder(1), strings.TrimSpace(outTradeNo))
}

func (b *DatabaseBackend) SavePaymentPrepay(orderID, codeURL, providerRequestID, updatedAt string) (PaymentOrderRecord, error) {
	orderID, codeURL, providerRequestID, updatedAt = strings.TrimSpace(orderID), strings.TrimSpace(codeURL), strings.TrimSpace(providerRequestID), strings.TrimSpace(updatedAt)
	if orderID == "" || codeURL == "" || updatedAt == "" {
		return PaymentOrderRecord{}, errors.New("支付预下单结果缺少必要字段")
	}
	result, err := b.db.Exec(`UPDATE payment_orders SET code_url = `+b.placeholder(1)+`, provider_request_id = `+b.placeholder(2)+`, status = `+b.placeholder(3)+`, updated_at = `+b.placeholder(4)+` WHERE id = `+b.placeholder(5)+` AND status IN (`+b.placeholder(6)+`, `+b.placeholder(7)+`)`, codeURL, providerRequestID, PaymentOrderStatusPending, updatedAt, orderID, PaymentOrderStatusCreated, PaymentOrderStatusPending)
	if err != nil {
		return PaymentOrderRecord{}, err
	}
	if err := b.requirePaymentRowUpdated(result, b.db, "payment_orders", `id = `+b.placeholder(1)+` AND status IN (`+b.placeholder(2)+`, `+b.placeholder(3)+`)`, orderID, PaymentOrderStatusCreated, PaymentOrderStatusPending); err != nil {
		return PaymentOrderRecord{}, err
	}
	return b.LoadPaymentOrderByID(orderID)
}

func (b *DatabaseBackend) InsertPaymentEvent(event PaymentEventRecord) (bool, error) {
	event = normalizePaymentEvent(event)
	if event.ID == "" || event.Provider == "" || event.ProviderEventID == "" || event.OutTradeNo == "" {
		return false, fmt.Errorf("payment event 缺少必要字段")
	}
	stmt := `INSERT INTO payment_events (
		id, provider, provider_event_id, channel_version_id, event_type, order_id,
		out_trade_no, transaction_id, app_id, merchant_id, trade_state, trade_state_desc,
		amount_fen, currency, success_time, resource_digest, status, attempts,
		last_error, last_attempt_at, received_at, processed_at
	) VALUES (` + b.paymentPlaceholders(22) + `)`
	_, err := b.db.Exec(stmt,
		event.ID, event.Provider, event.ProviderEventID, event.ChannelVersionID, event.EventType,
		event.OrderID, event.OutTradeNo, event.TransactionID, event.AppID, event.MerchantID,
		event.TradeState, event.TradeStateDesc, event.AmountFen, event.Currency, event.SuccessTime,
		event.ResourceDigest, event.Status, event.Attempts, event.LastError, event.LastAttemptAt,
		event.ReceivedAt, event.ProcessedAt,
	)
	if err != nil {
		if b.isUniqueConflict(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (b *DatabaseBackend) LoadPaymentEventByProviderEventID(providerEventID string) (PaymentEventRecord, error) {
	providerEventID = strings.TrimSpace(providerEventID)
	if providerEventID == "" {
		return PaymentEventRecord{}, errors.New("payment event provider event id 无效")
	}
	row := b.db.QueryRow(`SELECT id, provider, provider_event_id, channel_version_id, event_type, order_id,
		out_trade_no, transaction_id, app_id, merchant_id, trade_state, trade_state_desc,
		amount_fen, currency, success_time, resource_digest, status, attempts, last_error,
		last_attempt_at, received_at, processed_at FROM payment_events WHERE provider_event_id = `+b.placeholder(1), providerEventID)
	item, err := scanPaymentEvent(row)
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentEventRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) UpdatePaymentEventStatus(providerEventID, status, lastError, processedAt string) error {
	providerEventID, status = strings.TrimSpace(providerEventID), strings.TrimSpace(status)
	if providerEventID == "" || status == "" {
		return errors.New("payment event 状态更新字段无效")
	}
	result, err := b.db.Exec(`UPDATE payment_events SET status = `+b.placeholder(1)+`, attempts = attempts + 1, last_error = `+b.placeholder(2)+`, last_attempt_at = `+b.placeholder(3)+`, processed_at = `+b.placeholder(4)+` WHERE provider_event_id = `+b.placeholder(5), status, strings.TrimSpace(lastError), strings.TrimSpace(processedAt), strings.TrimSpace(processedAt), providerEventID)
	if err != nil {
		return err
	}
	return b.requirePaymentRowUpdated(result, b.db, "payment_events", `provider_event_id = `+b.placeholder(1), providerEventID)
}

const paymentOrderSelect = `SELECT id, out_trade_no, user_id, idempotency_key,
	channel_id, channel_version_id, product_id, product_name_snapshot, amount_fen,
	credits_snapshot, product_type_snapshot, storage_days_snapshot, storage_bytes_snapshot, currency, expire_minutes_snapshot, expires_at, status,
	provider_trade_state, provider_trade_desc, transaction_id, code_url,
	provider_request_id, last_query_at, query_attempts, paid_at, credited_at,
	closed_at, last_error_code, last_error_message, created_at, updated_at
	FROM payment_orders WHERE `

func (b *DatabaseBackend) loadPaymentOrderByIdempotency(userID, key string) (PaymentOrderRecord, error) {
	return b.loadPaymentOrder(`user_id = `+b.placeholder(1)+` AND idempotency_key = `+b.placeholder(2), userID, key)
}

func (b *DatabaseBackend) loadPaymentOrder(where string, args ...any) (PaymentOrderRecord, error) {
	row := b.db.QueryRow(paymentOrderSelect+where, args...)
	item, err := scanPaymentOrder(row)
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentOrderRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func normalizePaymentOrder(order PaymentOrderRecord) PaymentOrderRecord {
	order.ID = strings.TrimSpace(order.ID)
	order.OutTradeNo = strings.TrimSpace(order.OutTradeNo)
	order.UserID = strings.TrimSpace(order.UserID)
	order.IdempotencyKey = strings.TrimSpace(order.IdempotencyKey)
	order.ChannelID = strings.TrimSpace(order.ChannelID)
	order.ChannelVersionID = strings.TrimSpace(order.ChannelVersionID)
	order.ProductID = strings.TrimSpace(order.ProductID)
	order.ProductNameSnapshot = strings.TrimSpace(order.ProductNameSnapshot)
	order.Currency = strings.TrimSpace(order.Currency)
	if order.Currency == "" {
		order.Currency = "CNY"
	}
	order.Status = strings.TrimSpace(order.Status)
	order.ProductTypeSnapshot = strings.ToLower(strings.TrimSpace(order.ProductTypeSnapshot))
	if order.ProductTypeSnapshot == "" {
		order.ProductTypeSnapshot = "credits"
	}
	return order
}

func validatePaymentOrder(order PaymentOrderRecord) error {
	for field, value := range map[string]string{
		"id": order.ID, "out_trade_no": order.OutTradeNo, "user_id": order.UserID,
		"idempotency_key": order.IdempotencyKey, "channel_id": order.ChannelID,
		"channel_version_id": order.ChannelVersionID, "product_id": order.ProductID,
		"product_name_snapshot": order.ProductNameSnapshot, "expires_at": order.ExpiresAt,
		"status": order.Status, "created_at": order.CreatedAt, "updated_at": order.UpdatedAt,
	} {
		if value == "" {
			return fmt.Errorf("payment order 缺少 %s", field)
		}
	}
	if order.AmountFen <= 0 {
		return fmt.Errorf("payment order 金额必须为正数")
	}
	if order.ProductTypeSnapshot == "credits" && order.CreditsSnapshot <= 0 {
		return fmt.Errorf("payment order 积分必须为正数")
	}
	if order.ProductTypeSnapshot == "cloud_storage" && (order.StorageDaysSnapshot <= 0 || order.StorageBytesSnapshot <= 0) {
		return fmt.Errorf("payment order 云存储权益无效")
	}
	if order.ProductTypeSnapshot != "credits" && order.ProductTypeSnapshot != "cloud_storage" {
		return fmt.Errorf("payment order 商品类型无效")
	}
	if len(order.IdempotencyKey) > 160 {
		return fmt.Errorf("payment order 幂等键过长")
	}
	return nil
}

func normalizePaymentEvent(event PaymentEventRecord) PaymentEventRecord {
	event.ID = strings.TrimSpace(event.ID)
	event.Provider = strings.TrimSpace(event.Provider)
	event.ProviderEventID = strings.TrimSpace(event.ProviderEventID)
	event.ChannelVersionID = strings.TrimSpace(event.ChannelVersionID)
	event.EventType = strings.TrimSpace(event.EventType)
	event.OutTradeNo = strings.TrimSpace(event.OutTradeNo)
	event.TransactionID = strings.TrimSpace(event.TransactionID)
	event.AppID = strings.TrimSpace(event.AppID)
	event.MerchantID = strings.TrimSpace(event.MerchantID)
	event.TradeState = strings.TrimSpace(event.TradeState)
	event.TradeStateDesc = strings.TrimSpace(event.TradeStateDesc)
	event.Currency = strings.TrimSpace(event.Currency)
	if event.Currency == "" {
		event.Currency = "CNY"
	}
	event.Status = strings.TrimSpace(event.Status)
	return event
}

func paymentOrderArgs(order PaymentOrderRecord) []any {
	return []any{order.ID, order.OutTradeNo, order.UserID, order.IdempotencyKey, order.ChannelID,
		order.ChannelVersionID, order.ProductID, order.ProductNameSnapshot, order.AmountFen,
		order.CreditsSnapshot, order.ProductTypeSnapshot, order.StorageDaysSnapshot, order.StorageBytesSnapshot, order.Currency, order.ExpireMinutesSnapshot, order.ExpiresAt,
		order.Status, order.ProviderTradeState, order.ProviderTradeDesc, nullableString(order.TransactionID),
		order.CodeURL, order.ProviderRequestID, order.LastQueryAt, order.QueryAttempts, order.PaidAt,
		order.CreditedAt, order.ClosedAt, order.LastErrorCode, order.LastErrorMessage, order.CreatedAt, order.UpdatedAt}
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func (b *DatabaseBackend) paymentPlaceholders(count int) string {
	values := make([]string, count)
	for i := range values {
		values[i] = b.placeholder(i + 1)
	}
	return strings.Join(values, ", ")
}

func (b *DatabaseBackend) boolLiteral() string {
	// The PostgreSQL branch intentionally uses INTEGER flags, matching the
	// existing storage schema conventions, so both SQLite and PostgreSQL use 1.
	return "1"
}

func (b *DatabaseBackend) isUniqueConflict(err error) bool {
	return isUniqueViolation(err)
}

type rowScanner interface{ Scan(dest ...any) error }

func scanPaymentEvent(row rowScanner) (PaymentEventRecord, error) {
	var item PaymentEventRecord
	err := row.Scan(
		&item.ID, &item.Provider, &item.ProviderEventID, &item.ChannelVersionID, &item.EventType, &item.OrderID,
		&item.OutTradeNo, &item.TransactionID, &item.AppID, &item.MerchantID, &item.TradeState, &item.TradeStateDesc,
		&item.AmountFen, &item.Currency, &item.SuccessTime, &item.ResourceDigest, &item.Status, &item.Attempts,
		&item.LastError, &item.LastAttemptAt, &item.ReceivedAt, &item.ProcessedAt,
	)
	return item, err
}

func scanPaymentChannel(row rowScanner) (PaymentChannelRecord, error) {
	var item PaymentChannelRecord
	var enabled, isDefault int
	err := row.Scan(&item.ID, &item.Code, &item.Name, &item.Provider, &item.PaymentMethod, &enabled,
		&isDefault, &item.ActiveVersionID, &item.NotifyBaseURL, &item.OrderExpireMinutes,
		&item.CreatedBy, &item.UpdatedBy, &item.CreatedAt, &item.UpdatedAt)
	item.Enabled, item.IsDefault = enabled != 0, isDefault != 0
	return item, err
}

func scanPaymentChannelVersion(row rowScanner) (PaymentChannelVersionRecord, error) {
	var item PaymentChannelVersionRecord
	err := row.Scan(&item.ID, &item.ChannelID, &item.Version, &item.AppID, &item.MerchantID,
		&item.MerchantCertSerial, &item.MerchantPrivateKeyCipher, &item.APIv3KeyCipher,
		&item.VerifyMode, &item.WechatPayPublicKeyID, &item.WechatPayPublicKeyCipher,
		&item.AlipayPrivateKeyCipher, &item.AlipayPublicKeyCipher, &item.AlipayGateway, &item.AlipaySellerID,
		&item.ConfigFingerprint, &item.Status, &item.CreatedBy, &item.CreatedAt)
	return item, err
}

func scanRechargeProduct(row rowScanner) (RechargeProductRecord, error) {
	var item RechargeProductRecord
	var enabled int
	err := row.Scan(&item.ID, &item.SKU, &item.Name, &item.Description, &item.AmountFen, &item.Credits,
		&enabled, &item.ProductType, &item.StorageDays, &item.StorageBytes, &item.SortOrder, &item.CreatedBy, &item.UpdatedBy, &item.CreatedAt, &item.UpdatedAt, &item.ArchivedAt)
	item.Enabled = enabled != 0
	return item, err
}

func scanPaymentOrder(row rowScanner) (PaymentOrderRecord, error) {
	var item PaymentOrderRecord
	var transactionID, lastQueryAt, paidAt, creditedAt, closedAt sql.NullString
	err := row.Scan(&item.ID, &item.OutTradeNo, &item.UserID, &item.IdempotencyKey, &item.ChannelID,
		&item.ChannelVersionID, &item.ProductID, &item.ProductNameSnapshot, &item.AmountFen,
		&item.CreditsSnapshot, &item.ProductTypeSnapshot, &item.StorageDaysSnapshot, &item.StorageBytesSnapshot, &item.Currency, &item.ExpireMinutesSnapshot, &item.ExpiresAt,
		&item.Status, &item.ProviderTradeState, &item.ProviderTradeDesc, &transactionID,
		&item.CodeURL, &item.ProviderRequestID, &lastQueryAt, &item.QueryAttempts, &paidAt,
		&creditedAt, &closedAt, &item.LastErrorCode, &item.LastErrorMessage, &item.CreatedAt, &item.UpdatedAt)
	item.TransactionID = nullString(transactionID)
	item.LastQueryAt, item.PaidAt, item.CreditedAt, item.ClosedAt = nullString(lastQueryAt), nullString(paidAt), nullString(creditedAt), nullString(closedAt)
	return item, err
}

func nullString(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return strings.TrimSpace(value.String)
}
