package storage

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

func TestPaymentSchemaInitializesAndIsIdempotentOnSQLite(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "payment-schema.db")
	databaseURL := "sqlite:///" + filepath.ToSlash(dbPath)
	backend, err := NewDatabaseBackend(databaseURL)
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	if err := backend.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	backend, err = NewDatabaseBackend(databaseURL)
	if err != nil {
		t.Fatalf("second NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()

	for _, table := range []string{
		"payment_channels",
		"payment_channel_versions",
		"recharge_products",
		"payment_settings",
		"payment_orders",
		"payment_events",
		"payment_credit_receipts",
		"payment_reconciliation_runs",
		"payment_reconciliation_items",
	} {
		if !sqliteObjectExists(t, backend.db, "table", table) {
			t.Fatalf("missing payment table %q", table)
		}
	}
	for _, index := range []string{
		"idx_payment_orders_user_created",
		"idx_payment_orders_status_expires",
		"idx_payment_events_status_received",
		"idx_payment_reconciliation_runs_status_date",
		"idx_payment_reconciliation_items_run_category",
	} {
		if !sqliteObjectExists(t, backend.db, "index", index) {
			t.Fatalf("missing payment index %q", index)
		}
	}
	var archivedColumn int
	if err := backend.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('recharge_products') WHERE name = 'archived_at'`).Scan(&archivedColumn); err != nil {
		t.Fatalf("query archived_at column: %v", err)
	}
	if archivedColumn != 1 {
		t.Fatal("recharge_products.archived_at column missing")
	}
}

func TestPaymentOrderSchemaRejectsDuplicateIdempotencyAndTransaction(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	insertPaymentOrder := func(id, outTradeNo, idempotencyKey string, transactionID any) error {
		_, err := backend.db.Exec(`INSERT INTO payment_orders (
			id, out_trade_no, user_id, idempotency_key, channel_id, channel_version_id,
			product_id, product_name_snapshot, amount_fen, credits_snapshot,
			expire_minutes_snapshot, expires_at, status, transaction_id, created_at, updated_at
		) VALUES (?, ?, 'user-1', ?, 'channel-1', 'version-1', 'product-1', '测试套餐',
			100, 10, 15, '2026-08-30T12:00:00+08:00', 'pending', ?,
			'2026-08-30T11:45:00+08:00', '2026-08-30T11:45:00+08:00')`,
			id, outTradeNo, idempotencyKey, transactionID,
		)
		return err
	}
	if err := insertPaymentOrder("order-1", "trade-1", "idem-1", nil); err != nil {
		t.Fatalf("insert first order: %v", err)
	}
	if err := insertPaymentOrder("order-2", "trade-2", "idem-1", nil); err == nil {
		t.Fatal("duplicate user idempotency key succeeded")
	}
	if err := insertPaymentOrder("order-3", "trade-3", "idem-3", "wx-1"); err != nil {
		t.Fatalf("insert transaction order: %v", err)
	}
	if err := insertPaymentOrder("order-4", "trade-4", "idem-4", "wx-1"); err == nil {
		t.Fatal("duplicate transaction id succeeded")
	}
}

func TestPaymentSchemaRejectsInvalidProductAmounts(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	for _, values := range [][2]int64{{0, 10}, {100, 0}} {
		_, err := backend.db.Exec(`INSERT INTO recharge_products (
			id, sku, name, amount_fen, credits, created_at, updated_at
		) VALUES (?, ?, 'invalid', ?, ?, 'now', 'now')`,
			fmt.Sprintf("id-%d-%d", values[0], values[1]),
			fmt.Sprintf("sku-%d-%d", values[0], values[1]), values[0], values[1],
		)
		if err == nil {
			t.Fatalf("invalid product amount/credits succeeded: %v", values)
		}
	}
}

func TestMySQLPaymentSchemaUsesBoundedUniqueColumns(t *testing.T) {
	text := strings.Join(mysqlPaymentSchemaStatements(), "\n")
	for _, want := range []string{
		"out_trade_no VARCHAR(64)",
		"idempotency_key VARCHAR(160)",
		"provider_event_id VARCHAR(128)",
		"transaction_id VARCHAR(128)",
		"UNIQUE KEY uk_payment_user_idempotency",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("MySQL payment schema missing %q", want)
		}
	}
	for _, forbidden := range []string{
		"out_trade_no TEXT UNIQUE",
		"idempotency_key TEXT",
		"transaction_id TEXT UNIQUE",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("MySQL payment schema contains non-indexable declaration %q", forbidden)
		}
	}
}

func openPaymentSchemaTestBackend(t *testing.T) *DatabaseBackend {
	t.Helper()
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "payment.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	return backend
}

func seedPaymentSchemaParents(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO payment_channels (
		id, code, name, provider, payment_method, created_at, updated_at
	) VALUES ('channel-1', 'wechat-main', '微信支付', 'wechatpay', 'native', 'now', 'now')`); err != nil {
		t.Fatalf("seed channel: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO payment_channel_versions (
		id, channel_id, version, app_id, merchant_id, merchant_cert_serial,
		merchant_private_key_cipher, api_v3_key_cipher, verify_mode,
		config_fingerprint, status, created_at
	) VALUES ('version-1', 'channel-1', 1, 'app', 'merchant', 'serial',
		'cipher-1', 'cipher-2', 'public_key', 'fingerprint', 'active', 'now')`); err != nil {
		t.Fatalf("seed channel version: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO recharge_products (
		id, sku, name, amount_fen, credits, enabled, created_at, updated_at
	) VALUES ('product-1', 'starter', '测试套餐', 100, 10, 1, 'now', 'now')`); err != nil {
		t.Fatalf("seed product: %v", err)
	}
}

func sqliteObjectExists(t *testing.T, db *sql.DB, objectType, name string) bool {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = ? AND name = ?`, objectType, name).Scan(&count); err != nil {
		t.Fatalf("query sqlite_master: %v", err)
	}
	return count == 1
}
