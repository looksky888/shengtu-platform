package storage

import "testing"

func TestPaymentSchemaUsesIntegerFlagsForPostgresCompatibleQueries(t *testing.T) {
	backend := &DatabaseBackend{driver: "postgres"}
	if got := backend.boolLiteral(); got != "1" {
		t.Fatalf("boolLiteral(postgres) = %q, want 1 for INTEGER flags", got)
	}
}
