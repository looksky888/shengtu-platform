package service

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func newRegistrationEmailForTest(t *testing.T) (*RegistrationEmailService, storage.JSONDocumentBackend, *time.Time) {
	t.Helper()
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	now := time.Date(2026, time.August, 2, 12, 0, 0, 0, time.UTC)
	service, err := NewRegistrationEmailService(dir, backend, &RegistrationEmailOptions{
		SendMail:     func(context.Context, EmailSMTPConfig, string, string, string) error { return nil },
		Now:          func() time.Time { return now },
		GenerateCode: func() (string, error) { return "123456", nil },
	})
	if err != nil {
		t.Fatalf("NewRegistrationEmailService() error = %v", err)
	}
	if _, err := service.UpdateSettings(EmailSettingsInput{
		Enabled: true, Host: "smtp.example.test", Port: 587, Encryption: "starttls",
		FromEmail: "no-reply@example.test", FromName: "生图测试",
	}); err != nil {
		t.Fatalf("UpdateSettings() error = %v", err)
	}
	return service, backend, &now
}

func TestRegistrationEmailCodeLifecycle(t *testing.T) {
	service, _, now := newRegistrationEmailForTest(t)
	if _, err := service.SendRegistrationCode(context.Background(), "User@Example.Test", "203.0.113.1", "device-a"); err != nil {
		t.Fatalf("SendRegistrationCode() error = %v", err)
	}
	if _, err := service.SendRegistrationCode(context.Background(), "user@example.test", "203.0.113.1", "device-a"); err == nil {
		t.Fatal("immediate resend succeeded")
	} else {
		var limited *EmailRateLimitError
		if !errors.As(err, &limited) || limited.RetryAfter <= 0 {
			t.Fatalf("resend error = %#v", err)
		}
	}
	if _, err := service.VerifyRegistrationCode("user@example.test", "123456", "device-b"); err == nil {
		t.Fatal("code verified on another device")
	}
	id, err := service.VerifyRegistrationCode("user@example.test", "123456", "device-a")
	if err != nil || id == "" {
		t.Fatalf("VerifyRegistrationCode() id=%q error=%v", id, err)
	}
	if err := service.MarkCodeUsed(id); err != nil {
		t.Fatalf("MarkCodeUsed() error = %v", err)
	}
	if _, err := service.VerifyRegistrationCode("user@example.test", "123456", "device-a"); err == nil {
		t.Fatal("used code verified again")
	}

	*now = now.Add(11 * time.Minute)
	if _, err := service.SendRegistrationCode(context.Background(), "expired@example.test", "203.0.113.2", "device-c"); err != nil {
		t.Fatalf("send expiry code: %v", err)
	}
	*now = now.Add(11 * time.Minute)
	if _, err := service.VerifyRegistrationCode("expired@example.test", "123456", "device-c"); err == nil {
		t.Fatal("expired code verified")
	}
}

func TestRegistrationEmailCodeLocksAfterFiveFailures(t *testing.T) {
	service, _, _ := newRegistrationEmailForTest(t)
	if _, err := service.SendRegistrationCode(context.Background(), "lock@example.test", "203.0.113.3", "device-lock"); err != nil {
		t.Fatalf("SendRegistrationCode() error = %v", err)
	}
	for attempt := 1; attempt <= 5; attempt++ {
		if _, err := service.VerifyRegistrationCode("lock@example.test", "000000", "device-lock"); err == nil {
			t.Fatalf("wrong code attempt %d succeeded", attempt)
		}
	}
	if _, err := service.VerifyRegistrationCode("lock@example.test", "123456", "device-lock"); err == nil {
		t.Fatal("correct code succeeded after lockout")
	}
}

func TestPasswordResetCodePurposeDeviceAndReplayProtection(t *testing.T) {
	service, _, now := newRegistrationEmailForTest(t)
	codes := []string{"111111", "222222"}
	service.code = func() (string, error) {
		code := codes[0]
		codes = codes[1:]
		return code, nil
	}
	const email = "purpose@example.test"
	if _, err := service.SendRegistrationCode(context.Background(), email, "203.0.113.9", "device-purpose"); err != nil {
		t.Fatalf("SendRegistrationCode() error = %v", err)
	}
	*now = now.Add(61 * time.Second)
	if _, err := service.SendPasswordResetCode(context.Background(), email, "203.0.113.9", "device-purpose"); err != nil {
		t.Fatalf("SendPasswordResetCode() error = %v", err)
	}
	if _, err := service.VerifyRegistrationCode(email, "222222", "device-purpose"); err == nil {
		t.Fatal("password reset code verified for registration purpose")
	}
	if _, err := service.VerifyPasswordResetCode(email, "111111", "device-purpose"); err == nil {
		t.Fatal("registration code verified for password reset purpose")
	}
	if _, err := service.VerifyPasswordResetCode(email, "222222", "other-device"); err == nil {
		t.Fatal("password reset code verified on another device")
	}
	id, err := service.VerifyPasswordResetCode(email, "222222", "device-purpose")
	if err != nil || id == "" {
		t.Fatalf("VerifyPasswordResetCode() id=%q error=%v", id, err)
	}
	if err := service.MarkCodeUsed(id); err != nil {
		t.Fatalf("MarkCodeUsed() error = %v", err)
	}
	if _, err := service.VerifyPasswordResetCode(email, "222222", "device-purpose"); err == nil {
		t.Fatal("used password reset code verified again")
	}
}

func TestRegistrationEmailSettingsEncryptPasswordAndDoNotExposeIt(t *testing.T) {
	service, backend, _ := newRegistrationEmailForTest(t)
	settings, err := service.UpdateSettings(EmailSettingsInput{
		Enabled: true, Host: "smtp.example.test", Port: 465, Encryption: "tls",
		Username: "mailer", Password: "smtp-secret", FromEmail: "no-reply@example.test", FromName: "生图",
	})
	if err != nil {
		t.Fatalf("UpdateSettings() error = %v", err)
	}
	if !settings.HasPassword {
		t.Fatal("public settings did not report stored password")
	}
	raw, err := backend.LoadJSONDocument(emailSettingsDocumentName)
	if err != nil {
		t.Fatalf("LoadJSONDocument() error = %v", err)
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if strings.Contains(string(encoded), "smtp-secret") {
		t.Fatalf("SMTP password stored in plaintext: %s", encoded)
	}
}

func TestRegistrationEmailDeliveryFailureRemovesCodeAndAllowsRetry(t *testing.T) {
	service, _, _ := newRegistrationEmailForTest(t)
	service.sendMail = func(context.Context, EmailSMTPConfig, string, string, string) error {
		return errors.New("smtp unavailable")
	}
	if _, err := service.SendRegistrationCode(context.Background(), "retry@example.test", "203.0.113.8", "device-retry"); err == nil || !strings.Contains(err.Error(), "发送注册邮件失败") {
		t.Fatalf("first SendRegistrationCode() error = %v", err)
	}

	service.sendMail = func(context.Context, EmailSMTPConfig, string, string, string) error { return nil }
	if _, err := service.SendRegistrationCode(context.Background(), "retry@example.test", "203.0.113.8", "device-retry"); err != nil {
		t.Fatalf("retry after SMTP recovery failed: %v", err)
	}
}
