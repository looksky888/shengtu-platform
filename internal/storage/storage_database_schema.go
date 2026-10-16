package storage

import (
	"errors"
	"fmt"
	mysqlDriver "github.com/go-sql-driver/mysql"
)

func (b *DatabaseBackend) init() error {
	schema := []string{
		`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, access_token TEXT UNIQUE NOT NULL, data TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS auth_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS json_documents (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, type TEXT NOT NULL, day TEXT NOT NULL, data TEXT NOT NULL)`,
		`CREATE INDEX IF NOT EXISTS idx_logs_day_id ON logs (day, id)`,
		`CREATE TABLE IF NOT EXISTS user_usage_aggregate (
			user_id TEXT NOT NULL,
			day TEXT NOT NULL,
			calls INTEGER NOT NULL DEFAULT 0,
			success INTEGER NOT NULL DEFAULT 0,
			failure INTEGER NOT NULL DEFAULT 0,
			quota_used INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (user_id, day)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_user_usage_aggregate_day ON user_usage_aggregate (day)`,
		`CREATE TABLE IF NOT EXISTS user_usage_aggregate_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS api_key_limit_keys (key_id TEXT PRIMARY KEY NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS api_key_limit_events (
			id TEXT PRIMARY KEY NOT NULL,
			key_id TEXT NOT NULL,
			occurred_at TEXT NOT NULL,
			day TEXT NOT NULL,
			lease_until TEXT NOT NULL,
			released INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_api_key_limit_events_key_time ON api_key_limit_events (key_id, occurred_at)`,
		`CREATE INDEX IF NOT EXISTS idx_api_key_limit_events_lease ON api_key_limit_events (released, lease_until)`,
		`CREATE TABLE IF NOT EXISTS media_capacity_reservations (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, size_bytes INTEGER NOT NULL, lease_until TEXT NOT NULL, released INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS media_capacity_keys (user_id TEXT PRIMARY KEY NOT NULL)`,
		`CREATE INDEX IF NOT EXISTS idx_media_capacity_reservations_user ON media_capacity_reservations (user_id, released, lease_until)`,
		`CREATE TABLE IF NOT EXISTS credit_ledger (
			id TEXT PRIMARY KEY NOT NULL,
			user_id TEXT NOT NULL,
			delta INTEGER NOT NULL,
			balance_after INTEGER NOT NULL,
			reason TEXT NOT NULL,
			ref_id TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger (user_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON credit_ledger (created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_ledger_reason ON credit_ledger (reason)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_reason_ref ON credit_ledger (user_id, reason, ref_id)`,
		`CREATE TABLE IF NOT EXISTS media_assets (
			id TEXT PRIMARY KEY NOT NULL,
			path TEXT UNIQUE NOT NULL,
			owner_id TEXT NOT NULL DEFAULT '',
			owner_name TEXT NOT NULL DEFAULT '',
			media_type TEXT NOT NULL,
			object_key TEXT NOT NULL,
			thumbnail_key TEXT NOT NULL DEFAULT '',
			content_type TEXT NOT NULL,
			size_bytes INTEGER NOT NULL DEFAULT 0,
			sha256 TEXT NOT NULL DEFAULT '',
			width INTEGER NOT NULL DEFAULT 0,
			height INTEGER NOT NULL DEFAULT 0,
			visibility TEXT NOT NULL DEFAULT 'private',
			status TEXT NOT NULL DEFAULT 'ready',
			resolution_preset TEXT NOT NULL DEFAULT '',
			requested_size TEXT NOT NULL DEFAULT '',
			output_format TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			published_at TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL,
			deleted_at TEXT NOT NULL DEFAULT '',
			retry_at TEXT NOT NULL DEFAULT '',
			last_error TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created ON media_assets (owner_id, created_at, path)`,
		`CREATE INDEX IF NOT EXISTS idx_media_assets_public_published ON media_assets (visibility, published_at, path)`,
		`CREATE INDEX IF NOT EXISTS idx_media_assets_status_updated ON media_assets (status, updated_at)`,
		`CREATE INDEX IF NOT EXISTS idx_media_assets_retention ON media_assets (media_type, status, deleted_at, created_at, path)`,
	}
	if b.driver == "postgres" {
		schema = []string{
			`CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, access_token TEXT UNIQUE NOT NULL, data TEXT NOT NULL)`,
			`CREATE TABLE IF NOT EXISTS auth_keys (id SERIAL PRIMARY KEY, key_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL)`,
			`CREATE TABLE IF NOT EXISTS json_documents (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`,
			`CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY, created_at TEXT NOT NULL, type TEXT NOT NULL, day TEXT NOT NULL, data TEXT NOT NULL)`,
			`CREATE INDEX IF NOT EXISTS idx_logs_day_id ON logs (day, id)`,
			`CREATE TABLE IF NOT EXISTS user_usage_aggregate (
				user_id TEXT NOT NULL,
				day TEXT NOT NULL,
				calls INTEGER NOT NULL DEFAULT 0,
				success INTEGER NOT NULL DEFAULT 0,
				failure INTEGER NOT NULL DEFAULT 0,
				quota_used INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (user_id, day)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_user_usage_aggregate_day ON user_usage_aggregate (day)`,
			`CREATE TABLE IF NOT EXISTS user_usage_aggregate_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
			`CREATE TABLE IF NOT EXISTS api_key_limit_keys (key_id TEXT PRIMARY KEY NOT NULL)`,
			`CREATE TABLE IF NOT EXISTS api_key_limit_events (
				id TEXT PRIMARY KEY NOT NULL,
				key_id TEXT NOT NULL,
				occurred_at TEXT NOT NULL,
				day TEXT NOT NULL,
				lease_until TEXT NOT NULL,
				released INTEGER NOT NULL DEFAULT 0
			)`,
			`CREATE INDEX IF NOT EXISTS idx_api_key_limit_events_key_time ON api_key_limit_events (key_id, occurred_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_key_limit_events_lease ON api_key_limit_events (released, lease_until)`,
			`CREATE TABLE IF NOT EXISTS media_capacity_reservations (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, size_bytes INTEGER NOT NULL, lease_until TEXT NOT NULL, released INTEGER NOT NULL DEFAULT 0)`,
			`CREATE TABLE IF NOT EXISTS media_capacity_keys (user_id TEXT PRIMARY KEY NOT NULL)`,
			`CREATE INDEX IF NOT EXISTS idx_media_capacity_reservations_user ON media_capacity_reservations (user_id, released, lease_until)`,
			`CREATE TABLE IF NOT EXISTS credit_ledger (
				id TEXT PRIMARY KEY NOT NULL,
				user_id TEXT NOT NULL,
				delta INTEGER NOT NULL,
				balance_after INTEGER NOT NULL,
				reason TEXT NOT NULL,
				ref_id TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger (user_id, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON credit_ledger (created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_ledger_reason ON credit_ledger (reason)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_reason_ref ON credit_ledger (user_id, reason, ref_id)`,
			`CREATE TABLE IF NOT EXISTS media_assets (
				id TEXT PRIMARY KEY NOT NULL,
				path TEXT UNIQUE NOT NULL,
				owner_id TEXT NOT NULL DEFAULT '',
				owner_name TEXT NOT NULL DEFAULT '',
				media_type TEXT NOT NULL,
				object_key TEXT NOT NULL,
				thumbnail_key TEXT NOT NULL DEFAULT '',
				content_type TEXT NOT NULL,
				size_bytes BIGINT NOT NULL DEFAULT 0,
				sha256 TEXT NOT NULL DEFAULT '',
				width INTEGER NOT NULL DEFAULT 0,
				height INTEGER NOT NULL DEFAULT 0,
				visibility TEXT NOT NULL DEFAULT 'private',
				status TEXT NOT NULL DEFAULT 'ready',
				resolution_preset TEXT NOT NULL DEFAULT '',
				requested_size TEXT NOT NULL DEFAULT '',
				output_format TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL,
				published_at TEXT NOT NULL DEFAULT '',
				updated_at TEXT NOT NULL,
				deleted_at TEXT NOT NULL DEFAULT '',
				retry_at TEXT NOT NULL DEFAULT '',
				last_error TEXT NOT NULL DEFAULT ''
			)`,
			`CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created ON media_assets (owner_id, created_at, path)`,
			`CREATE INDEX IF NOT EXISTS idx_media_assets_public_published ON media_assets (visibility, published_at, path)`,
			`CREATE INDEX IF NOT EXISTS idx_media_assets_status_updated ON media_assets (status, updated_at)`,
			`CREATE INDEX IF NOT EXISTS idx_media_assets_retention ON media_assets (media_type, status, deleted_at, created_at, path)`,
		}
	}
	if b.driver == "mysql" {
		schema = mysqlSchemaStatements()
		// MySQL lacks portable IF NOT EXISTS for indexes. Duplicate index names are
		// classified below; all other failures must abort initialization.
	}
	schema = append(schema, paymentSchemaStatements(b.driver)...)
	for _, stmt := range schema {
		if _, err := b.db.Exec(stmt); err != nil {
			return fmt.Errorf("initialize %s schema: %w", b.driver, err)
		}
	}
	if err := b.ensurePaymentChannelVersionColumns(); err != nil {
		return fmt.Errorf("migrate %s payment channel versions: %w", b.driver, err)
	}
	if b.driver == "mysql" {
		for _, stmt := range []string{
			`CREATE INDEX idx_logs_day_id ON logs (day, id)`,
			`CREATE INDEX idx_user_usage_aggregate_day ON user_usage_aggregate (day)`,
			`CREATE INDEX idx_api_key_limit_events_key_time ON api_key_limit_events (key_id, occurred_at)`,
			`CREATE INDEX idx_api_key_limit_events_lease ON api_key_limit_events (released, lease_until)`,
			`CREATE INDEX idx_media_capacity_reservations_user ON media_capacity_reservations (user_id, released, lease_until)`,
			`CREATE INDEX idx_credit_ledger_user_created ON credit_ledger (user_id, created_at)`,
			`CREATE INDEX idx_credit_ledger_created ON credit_ledger (created_at)`,
			`CREATE INDEX idx_credit_ledger_reason ON credit_ledger (reason)`,
			`CREATE INDEX idx_credit_ledger_user_reason_ref ON credit_ledger (user_id, reason, ref_id)`,
			`CREATE INDEX idx_media_assets_owner_created ON media_assets (owner_id, created_at, path)`,
			`CREATE INDEX idx_media_assets_public_published ON media_assets (visibility, published_at, path)`,
			`CREATE INDEX idx_media_assets_status_updated ON media_assets (status, updated_at)`,
			`CREATE INDEX idx_media_assets_retention ON media_assets (media_type, status, deleted_at, created_at, path)`,
		} {
			if _, err := b.db.Exec(stmt); err != nil {
				if isMySQLDuplicateIndexError(err) {
					continue
				}
				return fmt.Errorf("create mysql index: %w", err)
			}
		}
	}
	return nil
}

func isMySQLDuplicateIndexError(err error) bool {
	var mysqlErr *mysqlDriver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1061
}

func mysqlSchemaStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTO_INCREMENT, access_token VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NOT NULL, data LONGTEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS auth_keys (id INTEGER PRIMARY KEY AUTO_INCREMENT, key_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NOT NULL, data LONGTEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS json_documents (name VARCHAR(512) PRIMARY KEY, data LONGTEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTO_INCREMENT, created_at TEXT NOT NULL, type VARCHAR(64) NOT NULL, day VARCHAR(10) NOT NULL, data LONGTEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS user_usage_aggregate (
			user_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
			day VARCHAR(10) NOT NULL,
			calls INTEGER NOT NULL DEFAULT 0,
			success INTEGER NOT NULL DEFAULT 0,
			failure INTEGER NOT NULL DEFAULT 0,
			quota_used INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (user_id, day)
		)`,
		`CREATE TABLE IF NOT EXISTS user_usage_aggregate_meta (
			name VARCHAR(64) PRIMARY KEY,
			value VARCHAR(255) NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS api_key_limit_keys (
			key_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS api_key_limit_events (
			id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY NOT NULL,
			key_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
			occurred_at VARCHAR(64) NOT NULL,
			day VARCHAR(10) NOT NULL,
			lease_until VARCHAR(64) NOT NULL,
			released TINYINT NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS media_capacity_reservations (id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY NOT NULL, user_id VARCHAR(128) NOT NULL, size_bytes BIGINT NOT NULL, lease_until VARCHAR(64) NOT NULL, released TINYINT NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS media_capacity_keys (user_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS credit_ledger (
			id VARCHAR(64) PRIMARY KEY NOT NULL,
			user_id VARCHAR(128) NOT NULL,
			delta INTEGER NOT NULL,
			balance_after INTEGER NOT NULL,
			reason VARCHAR(128) NOT NULL,
			ref_id VARCHAR(256) NOT NULL DEFAULT '',
			created_at VARCHAR(64) NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS media_assets (
			id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY NOT NULL,
			path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin UNIQUE NOT NULL,
			owner_id VARCHAR(128) NOT NULL DEFAULT '',
			owner_name VARCHAR(255) NOT NULL DEFAULT '',
			media_type VARCHAR(32) NOT NULL,
			object_key VARCHAR(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
			thumbnail_key VARCHAR(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '',
			content_type VARCHAR(128) NOT NULL,
			size_bytes BIGINT NOT NULL DEFAULT 0,
			sha256 VARCHAR(64) NOT NULL DEFAULT '',
			width INTEGER NOT NULL DEFAULT 0,
			height INTEGER NOT NULL DEFAULT 0,
			visibility VARCHAR(16) NOT NULL DEFAULT 'private',
			status VARCHAR(32) NOT NULL DEFAULT 'ready',
			resolution_preset VARCHAR(32) NOT NULL DEFAULT '',
			requested_size VARCHAR(64) NOT NULL DEFAULT '',
			output_format VARCHAR(16) NOT NULL DEFAULT '',
			created_at VARCHAR(64) NOT NULL,
			published_at VARCHAR(64) NOT NULL DEFAULT '',
			updated_at VARCHAR(64) NOT NULL,
			deleted_at VARCHAR(64) NOT NULL DEFAULT '',
			retry_at VARCHAR(64) NOT NULL DEFAULT '',
			last_error TEXT NOT NULL
		)`,
	}
}
