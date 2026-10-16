package storage

func sqlitePaymentReconciliationSchemaStatements() []string {
	return []string{
		`CREATE TABLE IF NOT EXISTS payment_reconciliation_runs (
			id TEXT PRIMARY KEY NOT NULL,
			channel_id TEXT NOT NULL,
			channel_version_id TEXT NOT NULL,
			bill_date TEXT NOT NULL,
			status TEXT NOT NULL,
			archive_path TEXT NOT NULL DEFAULT '',
			hash_type TEXT NOT NULL DEFAULT '',
			hash_value TEXT NOT NULL DEFAULT '',
			bill_rows INTEGER NOT NULL DEFAULT 0,
			matched_orders INTEGER NOT NULL DEFAULT 0,
			missing_local_orders INTEGER NOT NULL DEFAULT 0,
			missing_bill_orders INTEGER NOT NULL DEFAULT 0,
			amount_mismatches INTEGER NOT NULL DEFAULT 0,
			status_mismatches INTEGER NOT NULL DEFAULT 0,
			skipped_external INTEGER NOT NULL DEFAULT 0,
			last_error TEXT NOT NULL DEFAULT '',
			started_at TEXT NOT NULL DEFAULT '',
			finished_at TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			UNIQUE (channel_id, bill_date)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_runs_status_date ON payment_reconciliation_runs (status, bill_date)`,
		`CREATE TABLE IF NOT EXISTS payment_reconciliation_items (
			id TEXT PRIMARY KEY NOT NULL,
			run_id TEXT NOT NULL,
			category TEXT NOT NULL,
			out_trade_no TEXT NOT NULL DEFAULT '',
			transaction_id TEXT NOT NULL DEFAULT '',
			local_order_id TEXT NOT NULL DEFAULT '',
			bill_amount_fen INTEGER NOT NULL DEFAULT 0,
			local_amount_fen INTEGER NOT NULL DEFAULT 0,
			detail TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_items_run_category ON payment_reconciliation_items (run_id, category)`,
	}
}
