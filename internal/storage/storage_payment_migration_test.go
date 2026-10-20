package storage

import (
	"database/sql"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

var legacyPaymentSchemaStatements = []string{
	`CREATE TABLE payment_channel_versions (id TEXT PRIMARY KEY NOT NULL, channel_id TEXT NOT NULL)`,
	`CREATE TABLE recharge_products (id TEXT PRIMARY KEY NOT NULL)`,
	`CREATE TABLE payment_settings (id INTEGER PRIMARY KEY NOT NULL)`,
	`CREATE TABLE payment_orders (id TEXT PRIMARY KEY NOT NULL)`,
}

// legacyPaymentSchemaBackend builds a backend whose payment tables predate the
// columns added by later releases, which is the upgrade path the migration runs.
func legacyPaymentSchemaBackend(t *testing.T) (*DatabaseBackend, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "legacy-payment.db")
	db, err := sql.Open("sqlite", sqlitePragmaDSN(dbPath))
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, statement := range legacyPaymentSchemaStatements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("create legacy table: %v", err)
		}
	}
	return &DatabaseBackend{driver: "sqlite", dsn: dbPath, db: db}, dbPath
}

func TestPaymentColumnMigrationAddsMissingColumnsAndIsIdempotent(t *testing.T) {
	backend, _ := legacyPaymentSchemaBackend(t)
	for _, pass := range []int{1, 2} {
		if err := backend.ensurePaymentChannelVersionColumns(); err != nil {
			t.Fatalf("ensurePaymentChannelVersionColumns() pass %d error = %v", pass, err)
		}
	}
	for _, column := range backend.paymentColumnMigrations() {
		var count int
		if err := backend.db.QueryRow(
			`SELECT COUNT(*) FROM pragma_table_info('`+column.table+`') WHERE name = `+backend.placeholder(1), column.name).Scan(&count); err != nil {
			t.Fatalf("query pragma_table_info(%s): %v", column.table, err)
		}
		if count != 1 {
			t.Fatalf("column %s.%s missing after migration", column.table, column.name)
		}
	}
	var settings int
	if err := backend.db.QueryRow(`SELECT COUNT(*) FROM payment_settings WHERE id = 1`).Scan(&settings); err != nil {
		t.Fatalf("query payment settings: %v", err)
	}
	if settings != 1 {
		t.Fatal("payment_settings row missing after migration")
	}
}

// TestPaymentColumnMigrationToleratesConcurrentInitializers reproduces the
// multi-instance startup race: the loser of ADD COLUMN must not abort startup
// with "duplicate column name".
func TestPaymentColumnMigrationToleratesConcurrentInitializers(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	columns := backend.paymentColumnMigrations()
	errs := make([]error, len(columns)*2)
	var wg sync.WaitGroup
	for round := 0; round < 2; round++ {
		for index, column := range columns {
			wg.Add(1)
			go func(slot int, column paymentColumnMigration) {
				defer wg.Done()
				errs[slot] = backend.addPaymentColumn(column)
			}(round*len(columns)+index, column)
		}
	}
	wg.Wait()
	for index, err := range errs {
		if err != nil {
			t.Fatalf("concurrent addPaymentColumn() #%d error = %v", index, err)
		}
	}
}

func TestAddPaymentColumnKeepsRealFailuresAsFailures(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	err := backend.addPaymentColumn(paymentColumnMigration{
		table: "missing_table", name: "missing_column", definition: "TEXT NOT NULL DEFAULT ''",
	})
	if err == nil {
		t.Fatal("addPaymentColumn() on a missing table unexpectedly succeeded")
	}
	if isDuplicatePaymentColumnError(err) {
		t.Fatalf("missing-table error classified as a duplicate column: %v", err)
	}
}

// TestPaymentColumnMigrationsMatchMySQLBaseline locks the structural drift the
// audit found: the cipher columns are NOT NULL in the MySQL baseline CREATE
// TABLE, so the migration must declare them the same way instead of widening
// them to NULL and forcing COALESCE on the read path.
func TestPaymentColumnMigrationsMatchMySQLBaseline(t *testing.T) {
	backend := &DatabaseBackend{driver: "mysql"}
	definitions := map[string]string{}
	for _, column := range backend.paymentColumnMigrations() {
		definitions[column.table+"."+column.name] = column.definition
	}
	for _, name := range []string{"alipay_private_key_cipher", "alipay_public_key_cipher"} {
		key := "payment_channel_versions." + name
		if got := definitions[key]; got != "LONGTEXT NOT NULL" {
			t.Fatalf("%s migration definition = %q, want %q", key, got, "LONGTEXT NOT NULL")
		}
	}
	baseline := strings.Join(mysqlPaymentSchemaStatements(), "\n")
	for _, name := range []string{"alipay_private_key_cipher", "alipay_public_key_cipher"} {
		if !strings.Contains(baseline, name+" LONGTEXT NOT NULL") {
			t.Fatalf("MySQL baseline no longer declares %s as LONGTEXT NOT NULL", name)
		}
		if strings.Contains(baseline, name+" LONGTEXT NULL") {
			t.Fatalf("MySQL baseline declares %s as LONGTEXT NULL", name)
		}
	}
}

func TestLoadPaymentChannelVersionReadsAlipayCipherColumnsWithoutNullFallback(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	version, err := backend.LoadPaymentChannelVersion("version-1")
	if err != nil {
		t.Fatalf("LoadPaymentChannelVersion() error = %v", err)
	}
	if version.AlipayPrivateKeyCipher != "" || version.AlipayPublicKeyCipher != "" {
		t.Fatalf("alipay ciphers = %q/%q, want empty strings", version.AlipayPrivateKeyCipher, version.AlipayPublicKeyCipher)
	}
	if version.MerchantID != "merchant" || version.APIv3KeyCipher != "cipher-2" {
		t.Fatalf("wechat credentials = %q/%q, want merchant/cipher-2", version.MerchantID, version.APIv3KeyCipher)
	}
}
