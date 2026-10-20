package storage

import "fmt"

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
			case "product_type":
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
