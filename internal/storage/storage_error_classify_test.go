package storage

import (
	"errors"
	"fmt"
	"testing"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"github.com/lib/pq"
)

func TestIsDuplicatePaymentColumnErrorTypes(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{name: "mysql duplicate field name", err: &mysqlDriver.MySQLError{Number: 1060}, want: true},
		{name: "mysql duplicate entry is not a column", err: &mysqlDriver.MySQLError{Number: 1062}, want: false},
		{name: "wrapped duplicate field name", err: fmt.Errorf("add column: %w", &mysqlDriver.MySQLError{Number: 1060}), want: true},
		{name: "untyped duplicate text is not enough", err: errors.New("duplicate column name: alipay_gateway"), want: false},
		{name: "missing table", err: errors.New("no such table: payment_orders"), want: false},
		{name: "nil", err: nil, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isDuplicatePaymentColumnError(tc.err); got != tc.want {
				t.Fatalf("isDuplicatePaymentColumnError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsDuplicatePaymentColumnErrorClassifiesRealSQLiteError(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	// The baseline schema already declares the column, so this ALTER fails the
	// same way a concurrent initializer's ALTER does.
	_, err := backend.db.Exec(`ALTER TABLE payment_channel_versions ADD COLUMN alipay_gateway TEXT NOT NULL DEFAULT ''`)
	if err == nil {
		t.Fatal("duplicate ALTER TABLE ADD COLUMN unexpectedly succeeded")
	}
	if !isDuplicatePaymentColumnError(err) {
		t.Fatalf("SQLite duplicate column error = %v, not classified as a duplicate", err)
	}
	_, err = backend.db.Exec(`ALTER TABLE missing_table ADD COLUMN missing TEXT NOT NULL DEFAULT ''`)
	if err == nil || isDuplicatePaymentColumnError(err) {
		t.Fatalf("missing-table error = %v, want an unclassified failure", err)
	}
}

func TestIsUniqueViolationTypes(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{name: "mysql duplicate entry", err: &mysqlDriver.MySQLError{Number: 1062}, want: true},
		{name: "mysql check violated", err: &mysqlDriver.MySQLError{Number: 3819}, want: false},
		{name: "postgres unique violation", err: &pq.Error{Code: "23505"}, want: true},
		{name: "postgres check violation", err: &pq.Error{Code: "23514"}, want: false},
		{name: "postgres not null", err: &pq.Error{Code: "23502"}, want: false},
		{name: "wrapped duplicate entry", err: fmt.Errorf("insert order: %w", &mysqlDriver.MySQLError{Number: 1062}), want: true},
		{name: "wrapped check violation", err: fmt.Errorf("insert order: %w", &pq.Error{Code: "23514"}), want: false},
		{name: "nil", err: nil, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isUniqueViolation(tc.err); got != tc.want {
				t.Fatalf("isUniqueViolation(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestIsUniqueViolationTextFallbackKeepsCheckFailuresAsFailures pins the bug the
// old substring matcher caused: the bare word "constraint" used to classify every
// CHECK / NOT NULL / FOREIGN KEY failure as an idempotent duplicate, which made
// failed payment order writes look like "already exists".
func TestIsUniqueViolationTextFallbackKeepsCheckFailuresAsFailures(t *testing.T) {
	for _, tc := range []struct {
		message string
		want    bool
	}{
		{"UNIQUE constraint failed: payment_orders.id", true},
		{"UNIQUE constraint failed: payment_orders.user_id, payment_orders.idempotency_key", true},
		{"CHECK constraint failed: amount_fen > 0", false},
		{"NOT NULL constraint failed: payment_orders.user_id", false},
		{"FOREIGN KEY constraint failed", false},
		{`ERROR: duplicate key value violates unique constraint "payment_orders_pkey" (SQLSTATE 23505)`, true},
		{"Error 1062 (23000): Duplicate entry 'x' for key 'PRIMARY'", true},
		{"Error 3819 (HY000): Check constraint 'payment_orders_chk_1' is violated.", false},
		{"constraint failed", false},
	} {
		t.Run(tc.message, func(t *testing.T) {
			if got := isUniqueViolation(errors.New(tc.message)); got != tc.want {
				t.Fatalf("isUniqueViolation(%q) = %v, want %v", tc.message, got, tc.want)
			}
		})
	}
}
