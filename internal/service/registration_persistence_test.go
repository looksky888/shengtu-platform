package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type registrationFailureBackend struct {
	storage.Backend
	documents storage.JSONDocumentBackend
	failName  string
	loadName  string
}

func (b *registrationFailureBackend) LoadJSONDocument(name string) (any, error) {
	if name == b.loadName {
		return nil, errors.New("forced registration document load failure")
	}
	return b.documents.LoadJSONDocument(name)
}

func (b *registrationFailureBackend) SaveJSONDocument(name string, value any) error {
	if name == b.failName {
		return errors.New("forced registration document failure")
	}
	return b.documents.SaveJSONDocument(name, value)
}

func (b *registrationFailureBackend) DeleteJSONDocument(name string) error {
	return b.documents.DeleteJSONDocument(name)
}

func newRegistrationFailureBackend(t *testing.T) *registrationFailureBackend {
	t.Helper()
	dir := t.TempDir()
	base := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	return &registrationFailureBackend{Backend: base, documents: base}
}

func TestRegistrationQuotaBindAndReleaseRollbackOnSaveFailure(t *testing.T) {
	backend := newRegistrationFailureBackend(t)
	quota := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{})
	quota.store = backend
	reserveID, err := quota.Reserve(riskInput("203.0.113.1", "device-a", "user@example.test"))
	if err != nil {
		t.Fatal(err)
	}
	backend.failName = registrationQuotaDocumentName
	if err := quota.Bind(reserveID, "user-1", "user@example.test"); err == nil {
		t.Fatal("Bind succeeded while storage failed")
	}
	if len(quota.state.Events) != 1 || quota.state.Events[0].UserID != "" || quota.state.Events[0].ReserveID != reserveID {
		t.Fatalf("failed Bind changed memory: %#v", quota.state.Events)
	}
	if err := quota.Release(reserveID); err == nil {
		t.Fatal("Release succeeded while storage failed")
	}
	if len(quota.state.Events) != 1 || quota.state.Events[0].ReserveID != reserveID {
		t.Fatalf("failed Release changed memory: %#v", quota.state.Events)
	}
}

func TestRegistrationEmailMarkUsedRollsBackOnSaveFailure(t *testing.T) {
	backend := newRegistrationFailureBackend(t)
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	service, err := NewRegistrationEmailService(t.TempDir(), backend, &RegistrationEmailOptions{
		SendMail:     func(context.Context, EmailSMTPConfig, string, string, string) error { return nil },
		Now:          func() time.Time { return now },
		GenerateCode: func() (string, error) { return "123456", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.UpdateSettings(EmailSettingsInput{
		Enabled: true, Host: "smtp.example.test", Port: 587, Encryption: "starttls",
		FromEmail: "no-reply@example.test", FromName: "生图测试",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SendRegistrationCode(context.Background(), "user@example.test", "203.0.113.1", "device-a"); err != nil {
		t.Fatal(err)
	}
	id, err := service.VerifyRegistrationCode("user@example.test", "123456", "device-a")
	if err != nil {
		t.Fatal(err)
	}
	backend.failName = emailVerificationDocumentName
	if err := service.MarkCodeUsed(id); err == nil {
		t.Fatal("MarkCodeUsed succeeded while storage failed")
	}
	if len(service.codes) != 1 || service.codes[0].UsedAt != "" {
		t.Fatalf("failed MarkCodeUsed changed memory: %#v", service.codes)
	}
}

func TestRegistrationQuotaRejectsCorruptLocalLedger(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, registrationQuotaDocumentName), []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewRegistrationQuotaService(dir, nil, RegistrationQuotaConfig{}); err == nil {
		t.Fatal("NewRegistrationQuotaService succeeded with corrupt local ledger")
	}
}

func TestRegistrationQuotaRejectsBackendLoadFailure(t *testing.T) {
	backend := newRegistrationFailureBackend(t)
	backend.loadName = registrationQuotaDocumentName
	if _, err := NewRegistrationQuotaService(t.TempDir(), backend, RegistrationQuotaConfig{}); err == nil {
		t.Fatal("NewRegistrationQuotaService succeeded while backend load failed")
	}
}

func TestRegistrationQuotaRejectsFailedLocalLedgerMigration(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, registrationQuotaDocumentName), []byte(`{"events":[],"attempts":[],"blocks":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	backend := newRegistrationFailureBackend(t)
	backend.failName = registrationQuotaDocumentName
	if _, err := NewRegistrationQuotaService(dir, backend, RegistrationQuotaConfig{}); err == nil {
		t.Fatal("NewRegistrationQuotaService succeeded while ledger migration failed")
	}
}

func TestRegistrationQuotaRejectsFailedStartupPruneSave(t *testing.T) {
	backend := newRegistrationFailureBackend(t)
	old := time.Date(2025, time.January, 1, 0, 0, 0, 0, time.UTC)
	state := registrationQuotaState{
		Events: []RegistrationQuotaEvent{{
			UserID: "old-user", ClientIP: "203.0.113.1", CreatedAt: old.Format(time.RFC3339Nano),
		}},
	}
	if err := backend.SaveJSONDocument(registrationQuotaDocumentName, state); err != nil {
		t.Fatal(err)
	}
	backend.failName = registrationQuotaDocumentName
	now := old.Add(400 * 24 * time.Hour)
	if _, err := NewRegistrationQuotaService(t.TempDir(), backend, RegistrationQuotaConfig{
		Now: func() time.Time { return now },
	}); err == nil {
		t.Fatal("NewRegistrationQuotaService succeeded while startup prune save failed")
	}
}
