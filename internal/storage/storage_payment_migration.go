package storage

import (
	"database/sql"
	"fmt"
)

type paymentColumnMigration struct {
	name       string
	definition string
}

func (b *DatabaseBackend) ensurePaymentChannelVersionColumns() error {
	columns := []paymentColumnMigration{
		{name: "alipay_private_key_cipher", definition: "TEXT NOT NULL DEFAULT ''"},
		{name: "alipay_public_key_cipher", definition: "TEXT NOT NULL DEFAULT ''"},
		{name: "alipay_gateway", definition: "TEXT NOT NULL DEFAULT ''"},
		{name: "alipay_seller_id", definition: "TEXT NOT NULL DEFAULT ''"},
	}
	if b.driver == "mysql" {
		columns[0].definition = "LONGTEXT NULL"
		columns[1].definition = "LONGTEXT NULL"
		columns[2].definition = "VARCHAR(512) NOT NULL DEFAULT ''"
		columns[3].definition = "VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''"
	}
	for _, column := range columns {
		exists, err := b.paymentColumnExists("payment_channel_versions", column.name)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := b.db.Exec(`ALTER TABLE payment_channel_versions ADD COLUMN ` + column.name + ` ` + column.definition); err != nil {
			return fmt.Errorf("add %s: %w", column.name, err)
		}
	}
	productTypeExists, err := b.paymentColumnExists("recharge_products", "product_type")
	if err != nil {
		return err
	}
	for _, column := range []paymentColumnMigration{
		{name: "storage_days", definition: "INTEGER NOT NULL DEFAULT 0"},
		{name: "storage_bytes", definition: "BIGINT NOT NULL DEFAULT 0"},
	} {
		exists, err := b.paymentColumnExists("recharge_products", column.name)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		definition := column.definition
		if b.driver == "mysql" && column.name == "storage_bytes" {
			definition = "BIGINT NOT NULL DEFAULT 0"
		}
		if _, err := b.db.Exec(`ALTER TABLE recharge_products ADD COLUMN ` + column.name + ` ` + definition); err != nil {
			return fmt.Errorf("add recharge_products.%s: %w", column.name, err)
		}
	}
	for _, column := range []paymentColumnMigration{
		{name: "cloud_storage_enabled", definition: "INTEGER NOT NULL DEFAULT 0"},
		{name: "cloud_storage_policy_started_at", definition: "TEXT NOT NULL DEFAULT ''"},
	} {
		exists, err := b.paymentColumnExists("payment_settings", column.name)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := b.db.Exec(`ALTER TABLE payment_settings ADD COLUMN ` + column.name + ` ` + column.definition); err != nil {
			return fmt.Errorf("add payment_settings.%s: %w", column.name, err)
		}
	}
	for _, column := range []paymentColumnMigration{
		{name: "product_type_snapshot", definition: "TEXT NOT NULL DEFAULT 'credits'"},
		{name: "storage_days_snapshot", definition: "INTEGER NOT NULL DEFAULT 0"},
		{name: "storage_bytes_snapshot", definition: "BIGINT NOT NULL DEFAULT 0"},
	} {
		exists, err := b.paymentColumnExists("payment_orders", column.name)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := b.db.Exec(`ALTER TABLE payment_orders ADD COLUMN ` + column.name + ` ` + column.definition); err != nil {
			return fmt.Errorf("add payment_orders.%s: %w", column.name, err)
		}
	}
	if !productTypeExists {
		definition := "TEXT NOT NULL DEFAULT 'credits'"
		if b.driver == "mysql" {
			definition = "VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'credits'"
		}
		if _, err := b.db.Exec(`ALTER TABLE recharge_products ADD COLUMN product_type ` + definition); err != nil {
			return fmt.Errorf("add recharge_products.product_type: %w", err)
		}
	}
	archivedAtExists, err := b.paymentColumnExists("recharge_products", "archived_at")
	if err != nil {
		return err
	}
	if !archivedAtExists {
		definition := "TEXT NOT NULL DEFAULT ''"
		if b.driver == "mysql" {
			definition = "VARCHAR(64) NOT NULL DEFAULT ''"
		}
		if _, err := b.db.Exec(`ALTER TABLE recharge_products ADD COLUMN archived_at ` + definition); err != nil {
			return fmt.Errorf("add recharge_products.archived_at: %w", err)
		}
	}
	if _, err := b.db.Exec(`INSERT INTO payment_settings (id) VALUES (1)`); err != nil && !b.isUniqueConflict(err) {
		return fmt.Errorf("initialize payment settings: %w", err)
	}
	return nil
}

func (b *DatabaseBackend) paymentColumnExists(table, column string) (bool, error) {
	var marker int
	var err error
	switch b.driver {
	case "postgres":
		err = b.db.QueryRow(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`, table, column).Scan(&marker)
	case "mysql":
		err = b.db.QueryRow(`SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, table, column).Scan(&marker)
	default:
		rows, queryErr := b.db.Query(`PRAGMA table_info(` + table + `)`)
		if queryErr != nil {
			return false, queryErr
		}
		defer rows.Close()
		for rows.Next() {
			var cid, notNull, primaryKey int
			var name, dataType string
			var defaultValue any
			if scanErr := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); scanErr != nil {
				return false, scanErr
			}
			if name == column {
				return true, nil
			}
		}
		return false, rows.Err()
	}
	if err == nil {
		return true, nil
	}
	if err == sql.ErrNoRows {
		return false, nil
	}
	return false, err
}
