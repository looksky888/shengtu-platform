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
	if order.Status == PaymentOrderStatusFailed {
		return PaymentOrderRecord{}, false, ErrPaymentStateConflict
	}
	if order.ProductTypeSnapshot != "cloud_storage" || order.UserID != input.Entitlement.UserID ||
		order.StorageBytesSnapshot != input.Entitlement.StorageBytes || order.ProductID != input.Entitlement.ProductID {
		return PaymentOrderRecord{}, false, errors.New("payment storage snapshot mismatch")
	}
	creditedTime, err := time.Parse(time.RFC3339Nano, input.CreditedAt)
	if err != nil {
		return PaymentOrderRecord{}, false, errors.New("storage entitlement base expiry invalid")
	}
	vipGraceDays := DefaultVIPGraceDays
	var rawGraceDays sql.NullInt64
	if err := tx.QueryRow(`SELECT vip_grace_days FROM payment_settings WHERE id = 1`).Scan(&rawGraceDays); err == nil && rawGraceDays.Valid && rawGraceDays.Int64 > 0 {
		vipGraceDays = int(rawGraceDays.Int64)
	}
	creditedBound := normalizeUTCSortableISO(input.CreditedAt)
	creditedAtUTC := creditedTime.UTC().Format(time.RFC3339Nano)
	graceCutoffBound := formatUTCZeroNanoBound(creditedTime.AddDate(0, 0, -vipGraceDays))
	expiresExpr := b.utcSortableExpr("expires_at")
	existingRows, err := tx.Query(
		`SELECT storage_bytes, expires_at FROM user_storage_entitlements WHERE user_id = `+b.placeholder(1)+` AND `+expiresExpr+` > `+b.placeholder(2),
		order.UserID, graceCutoffBound,
	)
	if err != nil {
		return PaymentOrderRecord{}, false, err
	}
	base := creditedTime
	var (
		activeMaxBytes     int64
		graceMaxBytes      int64
		activeHasUnlimited bool
		graceHasUnlimited  bool
	)
	for existingRows.Next() {
		var rowBytes int64
		var rawExpires string
		if scanErr := existingRows.Scan(&rowBytes, &rawExpires); scanErr != nil {
			_ = existingRows.Close()
			return PaymentOrderRecord{}, false, scanErr
		}
		parsedExpires, parseErr := time.Parse(time.RFC3339Nano, strings.TrimSpace(rawExpires))
		if parseErr != nil {
			continue
		}
		if parsedExpires.After(base) {
			base = parsedExpires
		}
		if parsedExpires.After(creditedTime) {
			if rowBytes == 0 {
				activeHasUnlimited = true
			} else if rowBytes > activeMaxBytes {
				activeMaxBytes = rowBytes
			}
		} else {
			if rowBytes == 0 {
				graceHasUnlimited = true
			} else if rowBytes > graceMaxBytes {
				graceMaxBytes = rowBytes
			}
		}
	}
	if err := existingRows.Err(); err != nil {
		_ = existingRows.Close()
		return PaymentOrderRecord{}, false, err
	}
	_ = existingRows.Close()

	effectiveBytes := input.Entitlement.StorageBytes
	if effectiveBytes > 0 {
		if activeMaxBytes > effectiveBytes {
			effectiveBytes = activeMaxBytes
		}
	} else {
		if activeMaxBytes > 0 && !activeHasUnlimited {
			effectiveBytes = activeMaxBytes
		} else if activeMaxBytes == 0 && !activeHasUnlimited && graceMaxBytes > 0 && !graceHasUnlimited {
			effectiveBytes = graceMaxBytes
		}
	}

	expiresAt := base.AddDate(0, 0, order.StorageDaysSnapshot).UTC().Format(time.RFC3339Nano)
	// Mark previously active rows as superseded at creditedAtUTC while keeping every order's audit row intact.
	if _, err := tx.Exec(
		`UPDATE user_storage_entitlements SET expires_at = `+b.placeholder(1)+`, updated_at = `+b.placeholder(2)+` WHERE user_id = `+b.placeholder(3)+` AND `+expiresExpr+` > `+b.placeholder(4),
		creditedAtUTC, input.CreditedAt, order.UserID, creditedBound,
	); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	input.Entitlement.StorageBytes = effectiveBytes
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
	order.TransactionID, order.PaidAt, order.CreditedAt, order.ClosedAt, order.CodeURL = input.TransactionID, input.PaidAt, input.CreditedAt, "", ""
	order.LastErrorCode, order.LastErrorMessage = "", ""
	order.UpdatedAt = input.CreditedAt
	return order, true, nil
}

func (b *DatabaseBackend) loadStoragePolicySettings() PaymentSettingsRecord {
	settings, err := b.LoadPaymentSettings()
	if err != nil {
		return PaymentSettingsRecord{
			FreeRetentionDays:   DefaultFreeRetentionDays,
			VIPGraceDays:        DefaultVIPGraceDays,
			HistoricalGraceDays: DefaultHistoricalGraceDays,
		}
	}
	return settings
}

func (b *DatabaseBackend) LoadActiveStorageEntitlement(userID, now string) (PaymentStorageEntitlementSummary, error) {
	userID, now = strings.TrimSpace(userID), strings.TrimSpace(now)
	if userID == "" || now == "" {
		return PaymentStorageEntitlementSummary{}, errors.New("storage entitlement query fields are required")
	}
	nowTime, err := time.Parse(time.RFC3339Nano, now)
	if err != nil {
		return PaymentStorageEntitlementSummary{}, errors.New("storage entitlement time is invalid")
	}
	settings := b.loadStoragePolicySettings()
	item := PaymentStorageEntitlementSummary{
		UserID:              userID,
		CloudStorageEnabled: settings.CloudStorageEnabled,
		FreeRetentionDays:   settings.FreeRetentionDays,
		VIPGraceDays:        settings.VIPGraceDays,
		HistoricalGraceDays: settings.HistoricalGraceDays,
		Tier:                StorageTierFree,
	}
	if !settings.CloudStorageEnabled {
		item.Tier = StorageTierDisabled
	}
	if err := b.reader().QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM media_assets WHERE owner_id = `+b.placeholder(1)+` AND media_type = 'image' AND status IN ('ready', 'pending') AND deleted_at = ''`,
		userID,
	).Scan(&item.AssetCount, &item.UsedBytes); err != nil {
		return PaymentStorageEntitlementSummary{}, err
	}

	graceCutoffBound := formatUTCZeroNanoBound(nowTime.AddDate(0, 0, -settings.VIPGraceDays))
	expiresExpr := b.utcSortableExpr("expires_at")
	rows, err := b.reader().Query(
		`SELECT storage_bytes, expires_at FROM user_storage_entitlements WHERE user_id = `+b.placeholder(1)+` AND `+expiresExpr+` > `+b.placeholder(2),
		userID, graceCutoffBound,
	)
	if err != nil {
		return PaymentStorageEntitlementSummary{}, err
	}
	defer rows.Close()

	var (
		maxExpiresAt   string
		maxExpiresTime time.Time
		activeBytes    int64
		graceBytes     int64
		activeUnlim    bool
		graceUnlim     bool
	)
	for rows.Next() {
		var rowBytes int64
		var rowExpires string
		if scanErr := rows.Scan(&rowBytes, &rowExpires); scanErr != nil {
			return PaymentStorageEntitlementSummary{}, scanErr
		}
		rowExpires = strings.TrimSpace(rowExpires)
		parsedExpires, parseErr := time.Parse(time.RFC3339Nano, rowExpires)
		if parseErr != nil {
			continue
		}
		if maxExpiresTime.IsZero() || parsedExpires.After(maxExpiresTime) {
			maxExpiresTime = parsedExpires
			maxExpiresAt = rowExpires
			graceBytes = 0
			graceUnlim = false
		}
		if parsedExpires.Equal(maxExpiresTime) {
			if rowBytes == 0 {
				graceUnlim = true
			} else {
				graceBytes += rowBytes
			}
		}
		if parsedExpires.After(nowTime) {
			if rowBytes == 0 {
				activeUnlim = true
			} else {
				activeBytes += rowBytes
			}
		}
	}
	if err := rows.Err(); err != nil {
		return PaymentStorageEntitlementSummary{}, err
	}

	if !maxExpiresTime.IsZero() {
		item.ExpiresAt = maxExpiresAt
		item.GraceExpiresAt = maxExpiresTime.AddDate(0, 0, settings.VIPGraceDays).UTC().Format(time.RFC3339Nano)
		if maxExpiresTime.After(nowTime) {
			item.Unlimited = activeUnlim
			if !item.Unlimited {
				item.StorageBytes = activeBytes
			}
			if settings.CloudStorageEnabled {
				item.Tier = StorageTierActive
			}
		} else {
			item.Unlimited = graceUnlim
			if !item.Unlimited {
				item.StorageBytes = graceBytes
			}
			if settings.CloudStorageEnabled {
				item.Tier = StorageTierGrace
			}
		}
	}
	return item, nil
}

func (b *DatabaseBackend) ListActiveStorageEntitlements(now string) (map[string]PaymentStorageEntitlementSummary, error) {
	now = strings.TrimSpace(now)
	if now == "" {
		return nil, errors.New("storage entitlement time is required")
	}
	nowTime, err := time.Parse(time.RFC3339Nano, now)
	if err != nil {
		return nil, errors.New("storage entitlement time is invalid")
	}
	settings := b.loadStoragePolicySettings()
	graceCutoffBound := formatUTCZeroNanoBound(nowTime.AddDate(0, 0, -settings.VIPGraceDays))
	expiresExpr := b.utcSortableExpr("e.expires_at")

	rows, err := b.reader().Query(
		`SELECT e.user_id, e.storage_bytes, e.expires_at,
			COALESCE((SELECT COUNT(*) FROM media_assets m WHERE m.owner_id = e.user_id AND m.media_type = 'image' AND m.status IN ('ready', 'pending') AND m.deleted_at = ''), 0),
			COALESCE((SELECT SUM(m.size_bytes) FROM media_assets m WHERE m.owner_id = e.user_id AND m.media_type = 'image' AND m.status IN ('ready', 'pending') AND m.deleted_at = ''), 0)
		FROM user_storage_entitlements e WHERE `+expiresExpr+` > `+b.placeholder(1),
		graceCutoffBound,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type aggState struct {
		maxExpiresAt   string
		maxExpiresTime time.Time
		activeBytes    int64
		graceBytes     int64
		activeUnlim    bool
		graceUnlim     bool
		assetCount     int
		usedBytes      int64
	}
	byUser := make(map[string]*aggState)
	for rows.Next() {
		var userID, rowExpires string
		var rowBytes, usedBytes int64
		var assetCount int
		if scanErr := rows.Scan(&userID, &rowBytes, &rowExpires, &assetCount, &usedBytes); scanErr != nil {
			return nil, scanErr
		}
		userID = strings.TrimSpace(userID)
		rowExpires = strings.TrimSpace(rowExpires)
		parsedExpires, parseErr := time.Parse(time.RFC3339Nano, rowExpires)
		if parseErr != nil || userID == "" {
			continue
		}
		st, exists := byUser[userID]
		if !exists {
			st = &aggState{assetCount: assetCount, usedBytes: usedBytes}
			byUser[userID] = st
		}
		if st.maxExpiresTime.IsZero() || parsedExpires.After(st.maxExpiresTime) {
			st.maxExpiresTime = parsedExpires
			st.maxExpiresAt = rowExpires
			st.graceBytes = 0
			st.graceUnlim = false
		}
		if parsedExpires.Equal(st.maxExpiresTime) {
			if rowBytes == 0 {
				st.graceUnlim = true
			} else {
				st.graceBytes += rowBytes
			}
		}
		if parsedExpires.After(nowTime) {
			if rowBytes == 0 {
				st.activeUnlim = true
			} else {
				st.activeBytes += rowBytes
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make(map[string]PaymentStorageEntitlementSummary, len(byUser))
	for userID, st := range byUser {
		item := PaymentStorageEntitlementSummary{
			UserID:              userID,
			CloudStorageEnabled: settings.CloudStorageEnabled,
			FreeRetentionDays:   settings.FreeRetentionDays,
			VIPGraceDays:        settings.VIPGraceDays,
			HistoricalGraceDays: settings.HistoricalGraceDays,
			UsedBytes:           st.usedBytes,
			AssetCount:          st.assetCount,
			ExpiresAt:           st.maxExpiresAt,
			GraceExpiresAt:      st.maxExpiresTime.AddDate(0, 0, settings.VIPGraceDays).UTC().Format(time.RFC3339Nano),
		}
		if st.maxExpiresTime.After(nowTime) {
			item.Unlimited = st.activeUnlim
			if !item.Unlimited {
				item.StorageBytes = st.activeBytes
			}
			if settings.CloudStorageEnabled {
				item.Tier = StorageTierActive
			} else {
				item.Tier = StorageTierDisabled
			}
		} else {
			item.Unlimited = st.graceUnlim
			if !item.Unlimited {
				item.StorageBytes = st.graceBytes
			}
			if settings.CloudStorageEnabled {
				item.Tier = StorageTierGrace
			} else {
				item.Tier = StorageTierDisabled
			}
		}
		result[userID] = item
	}
	return result, nil
}

func (b *DatabaseBackend) markPaymentStorageOrderSucceededTx(tx *sql.Tx, input PaymentStorageCompletion) error {
	result, err := tx.Exec(`UPDATE payment_orders SET status = `+b.placeholder(1)+`, provider_trade_state = `+b.placeholder(2)+`, provider_trade_desc = `+b.placeholder(3)+`, transaction_id = `+b.placeholder(4)+`, paid_at = `+b.placeholder(5)+`, credited_at = `+b.placeholder(6)+`, closed_at = '', code_url = '', last_error_code = '', last_error_message = '', updated_at = `+b.placeholder(7)+` WHERE id = `+b.placeholder(8)+` AND status <> `+b.placeholder(9), PaymentOrderStatusSucceeded, input.TradeState, input.TradeStateDesc, input.TransactionID, input.PaidAt, input.CreditedAt, input.CreditedAt, input.OrderID, PaymentOrderStatusSucceeded)
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
	if e.ID == "" || e.UserID == "" || e.SourceOrderID != input.OrderID || e.ProductID == "" || e.StorageBytes < 0 || e.CreatedAt == "" || e.UpdatedAt == "" {
		return fmt.Errorf("payment storage entitlement 无效")
	}
	return nil
}
