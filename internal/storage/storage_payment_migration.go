package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

type paymentColumnMigration struct {
	table      string
	name       string
	definition string
}

// ensurePaymentChannelVersionColumns installs the payment columns that were
// added after the original payment schema. Every ALTER TABLE is issued
// unconditionally and a concurrent initializer that created the column first is
// tolerated, so two instances starting at the same time cannot fail startup
// with "duplicate column name".
func (b *DatabaseBackend) ensurePaymentChannelVersionColumns() error {
	for _, column := range b.paymentColumnMigrations() {
		if err := b.addPaymentColumn(column); err != nil {
			return err
		}
	}
	if err := b.ensureStorageEntitlementZeroBytesAllowed(); err != nil {
		return err
	}
	if _, err := b.db.Exec(`INSERT INTO payment_settings (id) VALUES (1)`); err != nil && !b.isUniqueConflict(err) {
		return fmt.Errorf("initialize payment settings: %w", err)
	}
	return nil
}

// paymentColumnMigrations lists the post-baseline payment columns in install
// order. MySQL definitions mirror the MySQL baseline CREATE TABLE statements:
// the cipher columns are NOT NULL there, so the migration must not widen them to
// NULL (which previously forced COALESCE on the read path).
func (b *DatabaseBackend) paymentColumnMigrations() []paymentColumnMigration {
	columns := []paymentColumnMigration{
		{table: "payment_channel_versions", name: "alipay_private_key_cipher", definition: "TEXT NOT NULL DEFAULT ''"},
		{table: "payment_channel_versions", name: "alipay_public_key_cipher", definition: "TEXT NOT NULL DEFAULT ''"},
		{table: "payment_channel_versions", name: "alipay_gateway", definition: "TEXT NOT NULL DEFAULT ''"},
		{table: "payment_channel_versions", name: "alipay_seller_id", definition: "TEXT NOT NULL DEFAULT ''"},
		{table: "recharge_products", name: "storage_days", definition: "INTEGER NOT NULL DEFAULT 0"},
		{table: "recharge_products", name: "storage_bytes", definition: "BIGINT NOT NULL DEFAULT 0"},
		{table: "payment_settings", name: "cloud_storage_enabled", definition: "INTEGER NOT NULL DEFAULT 0"},
		{table: "payment_settings", name: "cloud_storage_policy_started_at", definition: "TEXT NOT NULL DEFAULT ''"},
		{table: "payment_settings", name: "free_retention_days", definition: "INTEGER NOT NULL DEFAULT 3"},
		{table: "payment_settings", name: "vip_grace_days", definition: "INTEGER NOT NULL DEFAULT 7"},
		{table: "payment_settings", name: "historical_grace_days", definition: "INTEGER NOT NULL DEFAULT 7"},
		{table: "payment_orders", name: "product_type_snapshot", definition: "TEXT NOT NULL DEFAULT 'credits'"},
		{table: "payment_orders", name: "storage_days_snapshot", definition: "INTEGER NOT NULL DEFAULT 0"},
		{table: "payment_orders", name: "storage_bytes_snapshot", definition: "BIGINT NOT NULL DEFAULT 0"},
		{table: "recharge_products", name: "product_type", definition: "TEXT NOT NULL DEFAULT 'credits'"},
		{table: "recharge_products", name: "archived_at", definition: "TEXT NOT NULL DEFAULT ''"},
	}
	if b.driver == "mysql" {
		for index := range columns {
			switch columns[index].name {
			case "alipay_private_key_cipher", "alipay_public_key_cipher":
				columns[index].definition = "LONGTEXT NOT NULL"
			case "alipay_gateway":
				columns[index].definition = "VARCHAR(512) NOT NULL DEFAULT ''"
			case "alipay_seller_id":
				columns[index].definition = "VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''"
			case "cloud_storage_enabled":
				columns[index].definition = "BOOLEAN NOT NULL DEFAULT FALSE"
			case "cloud_storage_policy_started_at":
				columns[index].definition = "VARCHAR(64) NOT NULL DEFAULT ''"
			case "product_type_snapshot", "product_type":
				columns[index].definition = "VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'credits'"
			case "archived_at":
				columns[index].definition = "VARCHAR(64) NOT NULL DEFAULT ''"
			}
		}
	}
	return columns
}

// addPaymentColumn adds one column and treats "the column already exists" as
// success: the existence check and the ALTER TABLE cannot be made atomic, so the
// loser of that race must not abort startup.
func (b *DatabaseBackend) addPaymentColumn(column paymentColumnMigration) error {
	statement := `ALTER TABLE ` + column.table + ` ADD COLUMN `
	if b.driver == "postgres" {
		// Postgres 9.6+ supports ADD COLUMN IF NOT EXISTS, so the race never
		// surfaces as an error there.
		statement += `IF NOT EXISTS `
	}
	statement += column.name + ` ` + column.definition
	if _, err := b.db.Exec(statement); err != nil {
		if isDuplicatePaymentColumnError(err) {
			return nil
		}
		return fmt.Errorf("add %s.%s: %w", column.table, column.name, err)
	}
	return nil
}

// ensureStorageEntitlementZeroBytesAllowed upgrades legacy user_storage_entitlements
// tables created with CHECK (storage_bytes > 0) so unlimited-count VIP entitlements
// (storage_bytes = 0) can be persisted cleanly.
func (b *DatabaseBackend) ensureStorageEntitlementZeroBytesAllowed() error {
	switch b.driver {
	case "sqlite":
		var tableSQL sql.NullString
		err := b.db.QueryRow(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_storage_entitlements'`).Scan(&tableSQL)
		if errors.Is(err, sql.ErrNoRows) || !tableSQL.Valid {
			return nil
		}
		if err != nil {
			return fmt.Errorf("inspect user_storage_entitlements schema: %w", err)
		}
		if !strings.Contains(tableSQL.String, "storage_bytes > 0") {
			return nil
		}
		tx, err := b.db.Begin()
		if err != nil {
			return fmt.Errorf("begin user_storage_entitlements migration: %w", err)
		}
		defer func() { _ = tx.Rollback() }()
		for _, stmt := range []string{
			`DROP TABLE IF EXISTS user_storage_entitlements_v2`,
			`CREATE TABLE user_storage_entitlements_v2 (
				id TEXT PRIMARY KEY NOT NULL,
				user_id TEXT NOT NULL,
				source_order_id TEXT UNIQUE NOT NULL,
				product_id TEXT NOT NULL,
				storage_bytes INTEGER NOT NULL,
				expires_at TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				CHECK (storage_bytes >= 0)
			)`,
			`INSERT INTO user_storage_entitlements_v2 (id, user_id, source_order_id, product_id, storage_bytes, expires_at, created_at, updated_at)
				SELECT id, user_id, source_order_id, product_id, storage_bytes, expires_at, created_at, updated_at FROM user_storage_entitlements`,
			`DROP TABLE user_storage_entitlements`,
			`ALTER TABLE user_storage_entitlements_v2 RENAME TO user_storage_entitlements`,
			`CREATE INDEX IF NOT EXISTS idx_storage_entitlements_user_expiry ON user_storage_entitlements (user_id, expires_at)`,
		} {
			if _, execErr := tx.Exec(stmt); execErr != nil {
				return fmt.Errorf("migrate user_storage_entitlements check constraint: %w", execErr)
			}
		}
		return tx.Commit()
	case "postgres":
		rows, err := b.db.Query(`SELECT conname FROM pg_constraint WHERE conrelid = to_regclass('user_storage_entitlements') AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%storage_bytes > 0%'`)
		if err != nil {
			return fmt.Errorf("inspect user_storage_entitlements constraints: %w", err)
		}
		var names []string
		for rows.Next() {
			var name string
			if scanErr := rows.Scan(&name); scanErr != nil {
				_ = rows.Close()
				return fmt.Errorf("scan user_storage_entitlements constraint: %w", scanErr)
			}
			if trimmed := strings.TrimSpace(name); trimmed != "" {
				names = append(names, trimmed)
			}
		}
		if rowsErr := rows.Err(); rowsErr != nil {
			_ = rows.Close()
			return fmt.Errorf("iterate user_storage_entitlements constraints: %w", rowsErr)
		}
		_ = rows.Close()
		for _, name := range names {
			if _, dropErr := b.db.Exec(`ALTER TABLE user_storage_entitlements DROP CONSTRAINT IF EXISTS "` + strings.ReplaceAll(name, `"`, `""`) + `"`); dropErr != nil && !isMissingCheckConstraintError(dropErr) {
				return fmt.Errorf("drop legacy user_storage_entitlements constraint %q: %w", name, dropErr)
			}
		}
		if len(names) > 0 {
			if _, addErr := b.db.Exec(`ALTER TABLE user_storage_entitlements ADD CONSTRAINT user_storage_entitlements_storage_bytes_check CHECK (storage_bytes >= 0)`); addErr != nil && !isDuplicateCheckConstraintError(addErr) {
				return fmt.Errorf("add user_storage_entitlements check constraint: %w", addErr)
			}
		}
	case "mysql":
		rows, err := b.db.Query(`SELECT tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'user_storage_entitlements' AND tc.CONSTRAINT_TYPE = 'CHECK' AND cc.CHECK_CLAUSE LIKE '%> 0%'`)
		if err != nil {
			if isMissingCheckConstraintsCatalogError(err) {
				return nil
			}
			return fmt.Errorf("inspect user_storage_entitlements constraints: %w", err)
		}
		var names []string
		for rows.Next() {
			var name string
			if scanErr := rows.Scan(&name); scanErr != nil {
				_ = rows.Close()
				return fmt.Errorf("scan user_storage_entitlements constraint: %w", scanErr)
			}
			if trimmed := strings.TrimSpace(name); trimmed != "" {
				names = append(names, trimmed)
			}
		}
		if rowsErr := rows.Err(); rowsErr != nil {
			_ = rows.Close()
			return fmt.Errorf("iterate user_storage_entitlements constraints: %w", rowsErr)
		}
		_ = rows.Close()
		for _, name := range names {
			if _, dropErr := b.db.Exec("ALTER TABLE user_storage_entitlements DROP CHECK `" + strings.ReplaceAll(name, "`", "``") + "`"); dropErr != nil && !isMissingCheckConstraintError(dropErr) {
				return fmt.Errorf("drop legacy user_storage_entitlements check %q: %w", name, dropErr)
			}
		}
		if len(names) > 0 {
			if _, addErr := b.db.Exec(`ALTER TABLE user_storage_entitlements ADD CONSTRAINT user_storage_entitlements_storage_bytes_check CHECK (storage_bytes >= 0)`); addErr != nil && !isDuplicateCheckConstraintError(addErr) {
				return fmt.Errorf("add user_storage_entitlements check constraint: %w", addErr)
			}
		}
	}
	return nil
}
