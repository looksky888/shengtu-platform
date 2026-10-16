package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrPaymentRecordConflict = errors.New("payment record conflict")

const paymentChannelSelect = `SELECT id, code, name, provider, payment_method, enabled,
	is_default, active_version_id, notify_base_url, order_expire_minutes,
	created_by, updated_by, created_at, updated_at FROM payment_channels`

const rechargeProductSelect = `SELECT id, sku, name, description, amount_fen, credits, enabled,
	product_type, storage_days, storage_bytes, sort_order, created_by, updated_by, created_at, updated_at, archived_at FROM recharge_products`

func (b *DatabaseBackend) ListPaymentChannels() ([]PaymentChannelRecord, error) {
	rows, err := b.db.Query(paymentChannelSelect + ` ORDER BY is_default DESC, created_at ASC`)
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

func (b *DatabaseBackend) LoadPaymentChannel(id string) (PaymentChannelRecord, error) {
	item, err := scanPaymentChannel(b.db.QueryRow(paymentChannelSelect+` WHERE id = `+b.placeholder(1), strings.TrimSpace(id)))
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentChannelRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) CreatePaymentChannel(channel PaymentChannelRecord, version PaymentChannelVersionRecord) (PaymentChannelRecord, PaymentChannelVersionRecord, error) {
	channel = normalizePaymentChannel(channel)
	version = normalizePaymentChannelVersion(version)
	if err := validatePaymentChannel(channel); err != nil {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, err
	}
	if version.ChannelID != channel.ID || version.Version != 1 {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, errors.New("payment channel 首个凭据版本无效")
	}
	if err := validatePaymentChannelVersion(version); err != nil {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, err
	}
	tx, err := b.db.Begin()
	if err != nil {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if channel.IsDefault {
		if _, err := tx.Exec(`UPDATE payment_channels SET is_default = 0 WHERE is_default <> 0`); err != nil {
			return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, err
		}
	}
	_, err = tx.Exec(`INSERT INTO payment_channels (
		id, code, name, provider, payment_method, enabled, is_default, active_version_id,
		notify_base_url, order_expire_minutes, created_by, updated_by, created_at, updated_at
	) VALUES (`+b.paymentPlaceholders(14)+`)`, channel.ID, channel.Code, channel.Name,
		channel.Provider, channel.PaymentMethod, boolInt(channel.Enabled), boolInt(channel.IsDefault),
		channel.ActiveVersionID, channel.NotifyBaseURL, channel.OrderExpireMinutes, channel.CreatedBy,
		channel.UpdatedBy, channel.CreatedAt, channel.UpdatedAt)
	if err != nil {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, b.paymentMutationError(err)
	}
	if err := b.insertPaymentChannelVersionTx(tx, version); err != nil {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentChannelRecord{}, PaymentChannelVersionRecord{}, err
	}
	return channel, version, nil
}

func (b *DatabaseBackend) UpdatePaymentChannel(channel PaymentChannelRecord) (PaymentChannelRecord, error) {
	channel = normalizePaymentChannel(channel)
	if err := validatePaymentChannel(channel); err != nil {
		return PaymentChannelRecord{}, err
	}
	tx, err := b.db.Begin()
	if err != nil {
		return PaymentChannelRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if channel.IsDefault {
		if _, err := tx.Exec(`UPDATE payment_channels SET is_default = 0 WHERE id <> `+b.placeholder(1), channel.ID); err != nil {
			return PaymentChannelRecord{}, err
		}
	}
	result, err := tx.Exec(`UPDATE payment_channels SET code = `+b.placeholder(1)+`, name = `+b.placeholder(2)+`,
		provider = `+b.placeholder(3)+`, payment_method = `+b.placeholder(4)+`, enabled = `+b.placeholder(5)+`,
		is_default = `+b.placeholder(6)+`, notify_base_url = `+b.placeholder(7)+`,
		order_expire_minutes = `+b.placeholder(8)+`, updated_by = `+b.placeholder(9)+`, updated_at = `+b.placeholder(10)+`
		WHERE id = `+b.placeholder(11), channel.Code, channel.Name, channel.Provider, channel.PaymentMethod,
		boolInt(channel.Enabled), boolInt(channel.IsDefault), channel.NotifyBaseURL, channel.OrderExpireMinutes,
		channel.UpdatedBy, channel.UpdatedAt, channel.ID)
	if err != nil {
		return PaymentChannelRecord{}, b.paymentMutationError(err)
	}
	if err := requireOnePaymentRow(result); err != nil {
		return PaymentChannelRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentChannelRecord{}, err
	}
	return channel, nil
}

func (b *DatabaseBackend) RotatePaymentChannelVersion(channelID string, version PaymentChannelVersionRecord) (PaymentChannelVersionRecord, error) {
	channelID = strings.TrimSpace(channelID)
	version = normalizePaymentChannelVersion(version)
	if channelID == "" || version.ChannelID != channelID {
		return PaymentChannelVersionRecord{}, errors.New("payment channel 凭据版本渠道无效")
	}
	tx, err := b.db.Begin()
	if err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	lockSuffix := ""
	if b.driver == "postgres" || b.driver == "mysql" {
		lockSuffix = " FOR UPDATE"
	}
	var activeVersionID string
	if err := tx.QueryRow(`SELECT active_version_id FROM payment_channels WHERE id = `+b.placeholder(1)+lockSuffix, channelID).Scan(&activeVersionID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return PaymentChannelVersionRecord{}, ErrPaymentRecordNotFound
		}
		return PaymentChannelVersionRecord{}, err
	}
	if err := tx.QueryRow(`SELECT COALESCE(MAX(version), 0) + 1 FROM payment_channel_versions WHERE channel_id = `+b.placeholder(1), channelID).Scan(&version.Version); err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	if err := validatePaymentChannelVersion(version); err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	if _, err := tx.Exec(`UPDATE payment_channel_versions SET status = 'archived' WHERE channel_id = `+b.placeholder(1)+` AND status = 'active'`, channelID); err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	if err := b.insertPaymentChannelVersionTx(tx, version); err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	result, err := tx.Exec(`UPDATE payment_channels SET active_version_id = `+b.placeholder(1)+`, updated_by = `+b.placeholder(2)+`, updated_at = `+b.placeholder(3)+` WHERE id = `+b.placeholder(4), version.ID, version.CreatedBy, version.CreatedAt, channelID)
	if err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	if err := requireOnePaymentRow(result); err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentChannelVersionRecord{}, err
	}
	return version, nil
}

func (b *DatabaseBackend) insertPaymentChannelVersionTx(tx *sql.Tx, version PaymentChannelVersionRecord) error {
	_, err := tx.Exec(`INSERT INTO payment_channel_versions (
		id, channel_id, version, app_id, merchant_id, merchant_cert_serial,
		merchant_private_key_cipher, api_v3_key_cipher, verify_mode,
		wechatpay_public_key_id, wechatpay_public_key_cipher, alipay_private_key_cipher,
		alipay_public_key_cipher, alipay_gateway, alipay_seller_id, config_fingerprint,
		status, created_by, created_at
	) VALUES (`+b.paymentPlaceholders(19)+`)`, version.ID, version.ChannelID, version.Version,
		version.AppID, version.MerchantID, version.MerchantCertSerial, version.MerchantPrivateKeyCipher,
		version.APIv3KeyCipher, version.VerifyMode, version.WechatPayPublicKeyID,
		version.WechatPayPublicKeyCipher, version.AlipayPrivateKeyCipher, version.AlipayPublicKeyCipher,
		version.AlipayGateway, version.AlipaySellerID, version.ConfigFingerprint, version.Status,
		version.CreatedBy, version.CreatedAt)
	return b.paymentMutationError(err)
}

func (b *DatabaseBackend) ListRechargeProducts() ([]RechargeProductRecord, error) {
	rows, err := b.db.Query(rechargeProductSelect + ` WHERE archived_at = '' ORDER BY sort_order ASC, created_at ASC`)
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

func (b *DatabaseBackend) LoadRechargeProduct(id string) (RechargeProductRecord, error) {
	item, err := scanRechargeProduct(b.db.QueryRow(rechargeProductSelect+` WHERE id = `+b.placeholder(1)+` AND archived_at = ''`, strings.TrimSpace(id)))
	if errors.Is(err, sql.ErrNoRows) {
		return RechargeProductRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) CreateRechargeProduct(product RechargeProductRecord) (RechargeProductRecord, error) {
	product = normalizeRechargeProduct(product)
	if err := validateRechargeProduct(product); err != nil {
		return RechargeProductRecord{}, err
	}
	_, err := b.db.Exec(`INSERT INTO recharge_products (
		id, sku, name, description, amount_fen, credits, enabled, product_type, storage_days, storage_bytes, sort_order,
		created_by, updated_by, created_at, updated_at, archived_at
	) VALUES (`+b.paymentPlaceholders(16)+`)`, product.ID, product.SKU, product.Name,
		product.Description, product.AmountFen, product.Credits, boolInt(product.Enabled), product.ProductType,
		product.StorageDays, product.StorageBytes, product.SortOrder,
		product.CreatedBy, product.UpdatedBy, product.CreatedAt, product.UpdatedAt, product.ArchivedAt)
	if err != nil {
		return RechargeProductRecord{}, b.paymentMutationError(err)
	}
	return product, nil
}

func (b *DatabaseBackend) ArchiveRechargeProduct(id, actor, archivedAt string) (bool, error) {
	id, actor, archivedAt = strings.TrimSpace(id), strings.TrimSpace(actor), strings.TrimSpace(archivedAt)
	if id == "" || actor == "" || archivedAt == "" {
		return false, errors.New("recharge product archive fields are required")
	}
	result, err := b.db.Exec(`UPDATE recharge_products SET enabled = 0, archived_at = `+b.placeholder(1)+`, updated_by = `+b.placeholder(2)+`, updated_at = `+b.placeholder(3)+` WHERE id = `+b.placeholder(4)+` AND archived_at = ''`, archivedAt, actor, archivedAt, id)
	if err != nil {
		return false, b.paymentMutationError(err)
	}
	affected, err := result.RowsAffected()
	return affected == 1, err
}

func (b *DatabaseBackend) UpdateRechargeProduct(product RechargeProductRecord) (RechargeProductRecord, error) {
	product = normalizeRechargeProduct(product)
	if err := validateRechargeProduct(product); err != nil {
		return RechargeProductRecord{}, err
	}
	result, err := b.db.Exec(`UPDATE recharge_products SET sku = `+b.placeholder(1)+`, name = `+b.placeholder(2)+`,
		description = `+b.placeholder(3)+`, amount_fen = `+b.placeholder(4)+`, credits = `+b.placeholder(5)+`,
		enabled = `+b.placeholder(6)+`, product_type = `+b.placeholder(7)+`, storage_days = `+b.placeholder(8)+`,
		storage_bytes = `+b.placeholder(9)+`, sort_order = `+b.placeholder(10)+`, updated_by = `+b.placeholder(11)+`,
		updated_at = `+b.placeholder(12)+` WHERE id = `+b.placeholder(13)+` AND archived_at = ''`, product.SKU, product.Name,
		product.Description, product.AmountFen, product.Credits, boolInt(product.Enabled), product.ProductType,
		product.StorageDays, product.StorageBytes, product.SortOrder, product.UpdatedBy, product.UpdatedAt, product.ID)
	if err != nil {
		return RechargeProductRecord{}, b.paymentMutationError(err)
	}
	if err := requireOnePaymentRow(result); err != nil {
		return RechargeProductRecord{}, err
	}
	return product, nil
}

func normalizePaymentChannel(channel PaymentChannelRecord) PaymentChannelRecord {
	channel.ID = strings.TrimSpace(channel.ID)
	channel.Code = strings.ToLower(strings.TrimSpace(channel.Code))
	channel.Name = strings.TrimSpace(channel.Name)
	channel.Provider = strings.ToLower(strings.TrimSpace(channel.Provider))
	channel.PaymentMethod = strings.ToLower(strings.TrimSpace(channel.PaymentMethod))
	channel.ActiveVersionID = strings.TrimSpace(channel.ActiveVersionID)
	channel.NotifyBaseURL = strings.TrimRight(strings.TrimSpace(channel.NotifyBaseURL), "/")
	return channel
}

func validatePaymentChannel(channel PaymentChannelRecord) error {
	if channel.ID == "" || channel.Code == "" || channel.Name == "" || channel.Provider == "" || channel.PaymentMethod == "" || channel.ActiveVersionID == "" || channel.NotifyBaseURL == "" || channel.CreatedAt == "" || channel.UpdatedAt == "" {
		return errors.New("payment channel 缺少必要字段")
	}
	if channel.OrderExpireMinutes < 5 || channel.OrderExpireMinutes > 120 {
		return errors.New("payment channel 订单有效期必须为 5 到 120 分钟")
	}
	return nil
}

func normalizePaymentChannelVersion(version PaymentChannelVersionRecord) PaymentChannelVersionRecord {
	version.ID = strings.TrimSpace(version.ID)
	version.ChannelID = strings.TrimSpace(version.ChannelID)
	version.AppID = strings.TrimSpace(version.AppID)
	version.MerchantID = strings.TrimSpace(version.MerchantID)
	version.MerchantCertSerial = strings.TrimSpace(version.MerchantCertSerial)
	version.VerifyMode = strings.ToLower(strings.TrimSpace(version.VerifyMode))
	version.WechatPayPublicKeyID = strings.TrimSpace(version.WechatPayPublicKeyID)
	version.AlipayGateway = strings.TrimRight(strings.TrimSpace(version.AlipayGateway), "/")
	version.AlipaySellerID = strings.TrimSpace(version.AlipaySellerID)
	version.ConfigFingerprint = strings.TrimSpace(version.ConfigFingerprint)
	version.Status = strings.ToLower(strings.TrimSpace(version.Status))
	return version
}

func validatePaymentChannelVersion(version PaymentChannelVersionRecord) error {
	if version.ID == "" || version.ChannelID == "" || version.Version <= 0 || version.AppID == "" || version.ConfigFingerprint == "" || version.Status == "" || version.CreatedAt == "" {
		return errors.New("payment channel 凭据版本缺少必要字段")
	}
	wechatComplete := version.MerchantID != "" && version.MerchantCertSerial != "" && version.MerchantPrivateKeyCipher != "" && version.APIv3KeyCipher != "" && version.WechatPayPublicKeyID != "" && version.WechatPayPublicKeyCipher != ""
	alipayComplete := version.AlipayPrivateKeyCipher != "" && version.AlipayPublicKeyCipher != ""
	if !wechatComplete && !alipayComplete {
		return errors.New("payment channel 凭据版本缺少微信或支付宝凭据")
	}
	return nil
}

func normalizeRechargeProduct(product RechargeProductRecord) RechargeProductRecord {
	product.ID = strings.TrimSpace(product.ID)
	product.SKU = strings.ToLower(strings.TrimSpace(product.SKU))
	product.Name = strings.TrimSpace(product.Name)
	product.Description = strings.TrimSpace(product.Description)
	product.ProductType = strings.ToLower(strings.TrimSpace(product.ProductType))
	if product.ProductType == "" {
		product.ProductType = "credits"
	}
	return product
}

func validateRechargeProduct(product RechargeProductRecord) error {
	if product.ID == "" || product.SKU == "" || product.Name == "" || product.CreatedAt == "" || product.UpdatedAt == "" {
		return errors.New("recharge product 缺少必要字段")
	}
	if product.AmountFen <= 0 {
		return errors.New("recharge product 金额必须为正数")
	}
	if product.SortOrder < 0 {
		return errors.New("recharge product 排序值不能为负数")
	}
	if product.ProductType != "credits" && product.ProductType != "cloud_storage" {
		return errors.New("recharge product 类型无效")
	}
	if product.ProductType == "credits" && product.Credits <= 0 {
		return errors.New("积分商品到账积分必须为正数")
	}
	if product.ProductType == "cloud_storage" && (product.StorageDays <= 0 || product.StorageBytes <= 0) {
		return errors.New("云存储商品容量和有效期必须为正数")
	}
	return nil
}

func (b *DatabaseBackend) paymentMutationError(err error) error {
	if err == nil {
		return nil
	}
	if b.isUniqueConflict(err) {
		return fmt.Errorf("%w: %v", ErrPaymentRecordConflict, err)
	}
	return err
}

func requireOnePaymentRow(result sql.Result) error {
	affected, err := result.RowsAffected()
	if err == nil && affected != 1 {
		return ErrPaymentRecordNotFound
	}
	return err
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
