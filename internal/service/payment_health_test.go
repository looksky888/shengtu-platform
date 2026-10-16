package service

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestPaymentCallbackHealthAvailabilityAndDatabaseErrors(t *testing.T) {
	if got := (*PaymentService)(nil).CallbackHealth(); got.Status != "unavailable" || got.Available {
		t.Fatalf("nil service health = %#v", got)
	}
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "payment-health.db")))
	if err != nil {
		t.Fatal(err)
	}
	svc := &PaymentService{backend: backend}
	if got := svc.CallbackHealth(); got.Status != "ok" || !got.Available || got.PendingEvents != 0 || got.FailedEvents != 0 {
		t.Fatalf("empty database health = %#v", got)
	}
	if err := backend.Close(); err != nil {
		t.Fatal(err)
	}
	if got := svc.CallbackHealth(); got.Status != "error" || !got.Available || got.Error == "" {
		t.Fatalf("closed database health = %#v", got)
	}
}
