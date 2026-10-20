package storage

import (
	"errors"
	"strings"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"github.com/lib/pq"
	"modernc.org/sqlite"
)

// Driver codes that mean "a row with this key already exists".
const (
	sqliteConstraintPrimaryKey = 1555 // SQLITE_CONSTRAINT_PRIMARYKEY
	sqliteConstraintUnique     = 2067 // SQLITE_CONSTRAINT_UNIQUE
	mysqlDuplicateEntry        = 1062 // ER_DUP_ENTRY
	postgresUniqueViolation    = "23505"
)

// Driver codes that mean "the column already exists".
const (
	sqliteGenericError    = 1    // SQLITE_ERROR: SQLite reports duplicate columns under this generic code
	mysqlDuplicateColumn  = 1060 // ER_DUP_FIELDNAME
	sqliteDuplicateColumn = "duplicate column name"
)

// isDuplicatePaymentColumnError reports whether an ALTER TABLE ADD COLUMN lost
// the race against another initializer that already created the column, which is
// the expected outcome when two instances start at the same time. Classification
// stays driver-code based: a missing table or a malformed definition must remain
// a startup error.
func isDuplicatePaymentColumnError(err error) bool {
	if err == nil {
		return false
	}
	var mysqlErr *mysqlDriver.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == mysqlDuplicateColumn
	}
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) {
		// SQLite has no dedicated code for "duplicate column name"; it arrives as
		// the generic SQLITE_ERROR, so the driver message is the discriminator.
		return sqliteErr.Code() == sqliteGenericError &&
			strings.Contains(strings.ToLower(sqliteErr.Error()), sqliteDuplicateColumn)
	}
	return false
}

// isUniqueViolation reports whether err is a unique / primary-key conflict.
//
// Classification is by driver error code, never by the word "constraint": a
// CHECK (amount_fen > 0) or NOT NULL failure is a real write failure and must not
// be reported as an idempotent replay of an already stored row.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	var mysqlErr *mysqlDriver.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == mysqlDuplicateEntry
	}
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		return string(pqErr.Code) == postgresUniqueViolation
	}
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) {
		switch sqliteErr.Code() {
		case sqliteConstraintPrimaryKey, sqliteConstraintUnique:
			return true
		}
		return false
	}
	return matchesUniqueViolationText(err.Error())
}

// matchesUniqueViolationText is the last resort for errors whose driver type is
// hidden. It matches unique-specific wording only, so CHECK / NOT NULL / FOREIGN
// KEY failures stay failures.
func matchesUniqueViolationText(message string) bool {
	lower := strings.ToLower(message)
	for _, needle := range []string{
		"unique constraint",
		"unique_violation",
		"duplicate key",
		"duplicate entry",
		"sqlite_constraint_unique",
		"sqlite_constraint_primarykey",
	} {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}
