package storage

import (
	"database/sql"
	"errors"
	"testing"
)

// zeroRowsAffectedResult reproduces what MySQL returns (without
// clientFoundRows) for an UPDATE whose new values equal the stored ones.
type zeroRowsAffectedResult struct{}

func (zeroRowsAffectedResult) LastInsertId() (int64, error) { return 0, nil }
func (zeroRowsAffectedResult) RowsAffected() (int64, error) { return 0, nil }

// TestRequirePaymentRowUpdatedDistinguishesUnchangedFromMissing pins the audit
// finding that saving an admin form twice without edits was reported as
// ErrPaymentRecordNotFound (HTTP 404) instead of success.
func TestRequirePaymentRowUpdatedDistinguishesUnchangedFromMissing(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	order := paymentRepositoryTestOrder("order-1", "trade-1", "idem-1")
	if _, _, err := backend.CreatePaymentOrder(order); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	if _, err := backend.db.Exec(`INSERT INTO payment_events (
		id, provider, provider_event_id, channel_version_id, event_type, out_trade_no,
		resource_digest, status, received_at
	) VALUES ('event-1', 'wechatpay', 'provider-event-1', 'version-1', 'TRANSACTION.SUCCESS',
		'trade-1', 'digest', 'pending', '2026-08-30T12:00:00Z')`); err != nil {
		t.Fatalf("seed event: %v", err)
	}
	if _, err := backend.db.Exec(`INSERT INTO recharge_products (
		id, sku, name, amount_fen, credits, enabled, created_at, updated_at, archived_at
	) VALUES ('product-archived', 'retired', '已下架套餐', 100, 10, 0,
		'2026-08-30T12:00:00Z', '2026-08-30T12:00:00Z', '2026-08-30T12:00:00Z')`); err != nil {
		t.Fatalf("seed archived product: %v", err)
	}
	unchanged := zeroRowsAffectedResult{}
	for _, tc := range []struct {
		name    string
		result  sql.Result
		table   string
		where   string
		args    []any
		wantErr error
	}{
		{
			name: "payment channel values unchanged", result: unchanged,
			table: "payment_channels", where: `id = ` + backend.placeholder(1), args: []any{"channel-1"},
		},
		{
			name: "recharge product values unchanged", result: unchanged,
			table: "recharge_products", where: `id = ` + backend.placeholder(1) + ` AND archived_at = ''`, args: []any{"product-1"},
		},
		{
			name: "order prepay result replayed", result: unchanged,
			table: "payment_orders", where: `id = ` + backend.placeholder(1) + ` AND status IN (` + backend.placeholder(2) + `, ` + backend.placeholder(3) + `)`,
			args: []any{"order-1", PaymentOrderStatusCreated, PaymentOrderStatusPending},
		},
		{
			name: "event status replayed", result: unchanged,
			table: "payment_events", where: `provider_event_id = ` + backend.placeholder(1), args: []any{"provider-event-1"},
		},
		{
			name: "payment settings replayed", result: unchanged,
			table: "payment_settings", where: "id = 1",
		},
		{
			name: "missing channel", result: unchanged,
			table: "payment_channels", where: `id = ` + backend.placeholder(1), args: []any{"missing"},
			wantErr: ErrPaymentRecordNotFound,
		},
		{
			name: "archived product is not updatable", result: unchanged,
			table: "recharge_products", where: `id = ` + backend.placeholder(1) + ` AND archived_at = ''`, args: []any{"product-archived"},
			wantErr: ErrPaymentRecordNotFound,
		},
		{
			name: "order in a terminal state", result: unchanged,
			table: "payment_orders", where: `id = ` + backend.placeholder(1) + ` AND status IN (` + backend.placeholder(2) + `, ` + backend.placeholder(3) + `)`,
			args:    []any{"order-1", PaymentOrderStatusSucceeded, PaymentOrderStatusClosed},
			wantErr: ErrPaymentRecordNotFound,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := backend.requirePaymentRowUpdated(tc.result, backend.db, tc.table, tc.where, tc.args...)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("requirePaymentRowUpdated() error = %v, want %v", err, tc.wantErr)
			}
		})
	}
}

func TestRequirePaymentRowUpdatedKeepsRealFailuresAndSkipsTheProbeOnSuccess(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	result, err := backend.db.Exec(`UPDATE recharge_products SET name = 'renamed' WHERE id = `+backend.placeholder(1), "product-1")
	if err != nil {
		t.Fatalf("update product: %v", err)
	}
	if err := backend.requirePaymentRowUpdated(result, backend.db, "recharge_products", `id = `+backend.placeholder(1), "product-1"); err != nil {
		t.Fatalf("affected row must not be probed: %v", err)
	}

	// A broken probe must surface as an error and must never be reported as a
	// deleted record, otherwise a schema problem looks like a 404 to the admin.
	err = backend.requirePaymentRowUpdated(zeroRowsAffectedResult{}, backend.db, "missing_table", `id = `+backend.placeholder(1), "product-1")
	if err == nil || errors.Is(err, ErrPaymentRecordNotFound) {
		t.Fatalf("broken probe error = %v, want a driver error", err)
	}
}

func TestRequirePaymentRowUpdatedUsesTheTransactionExecutor(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	tx, err := backend.db.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := backend.requirePaymentRowUpdated(zeroRowsAffectedResult{}, tx, "payment_channels", `id = `+backend.placeholder(1), "channel-1"); err != nil {
		t.Fatalf("transaction probe error = %v", err)
	}
	if err := backend.requirePaymentRowUpdated(zeroRowsAffectedResult{}, tx, "payment_channels", `id = `+backend.placeholder(1), "missing"); !errors.Is(err, ErrPaymentRecordNotFound) {
		t.Fatalf("transaction probe error = %v, want %v", err, ErrPaymentRecordNotFound)
	}
}

// TestArchiveRechargeProductDistinguishesRepeatFromMissing locks the archive
// semantics: the bool reports whether this call took effect, so a repeat request
// must not be indistinguishable from an unknown product.
func TestArchiveRechargeProductDistinguishesRepeatFromMissing(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	archived, err := backend.ArchiveRechargeProduct("product-1", "admin", "2026-08-30T12:00:00Z")
	if err != nil || !archived {
		t.Fatalf("first ArchiveRechargeProduct() = %v err=%v, want true", archived, err)
	}
	archived, err = backend.ArchiveRechargeProduct("product-1", "admin", "2026-08-30T12:05:00Z")
	if err != nil || archived {
		t.Fatalf("repeated ArchiveRechargeProduct() = %v err=%v, want false without error", archived, err)
	}
	archived, err = backend.ArchiveRechargeProduct("missing", "admin", "2026-08-30T12:10:00Z")
	if archived || !errors.Is(err, ErrPaymentRecordNotFound) {
		t.Fatalf("unknown ArchiveRechargeProduct() = %v err=%v, want ErrPaymentRecordNotFound", archived, err)
	}
	var count int
	if err := backend.db.QueryRow(`SELECT COUNT(*) FROM recharge_products WHERE id = 'product-1' AND archived_at <> ''`).Scan(&count); err != nil {
		t.Fatalf("count archived: %v", err)
	}
	if count != 1 {
		t.Fatalf("archived rows = %d, want 1", count)
	}
}
