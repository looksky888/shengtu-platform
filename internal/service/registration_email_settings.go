package service

import (
	"context"
	"fmt"
	"time"
)

func (s *RegistrationEmailService) UpdateSettings(input EmailSettingsInput) (EmailSettingsPublic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := normalizeEmailSettings(input)
	if next.Password == "" {
		next.Password = s.settings.Password
	}
	if err := validateEmailSettings(next); err != nil {
		return EmailSettingsPublic{}, err
	}
	previous, previousUpdated := s.settings, s.updated
	s.settings = next
	s.updated = s.now().UTC().Format(time.RFC3339Nano)
	if err := s.persistSettingsLocked(); err != nil {
		s.settings, s.updated = previous, previousUpdated
		return EmailSettingsPublic{}, err
	}
	return publicEmailSettings(s.settings, s.updated), nil
}

func (s *RegistrationEmailService) TestMail(ctx context.Context, recipient string) error {
	recipient, err := normalizeAccountEmail(recipient)
	if err != nil {
		return err
	}
	s.mu.Lock()
	settings := s.settings
	s.mu.Unlock()
	if err := validateEmailSettings(settings); err != nil {
		return err
	}
	if !settings.Enabled {
		return fmt.Errorf("邮件服务尚未启用")
	}
	return s.sendMail(ctx, smtpConfig(settings), recipient, "生图邮件服务测试", "这是一封测试邮件。收到此邮件说明 SMTP 配置可用。")
}

func (s *RegistrationEmailService) persistSettingsLocked() error {
	ciphertext, err := encryptEmailSecret(s.key, s.settings.Password)
	if err != nil {
		return fmt.Errorf("加密 SMTP 密码: %w", err)
	}
	record := emailSettingsRecord{
		EmailSettingsInput: s.settings,
		PasswordCiphertext: ciphertext,
		UpdatedAt:          s.updated,
	}
	record.Password = ""
	if err := s.store.SaveJSONDocument(emailSettingsDocumentName, record); err != nil {
		return fmt.Errorf("保存邮箱设置: %w", err)
	}
	return nil
}

func smtpConfig(value EmailSettingsInput) EmailSMTPConfig {
	return EmailSMTPConfig{
		Host: value.Host, Port: value.Port, Username: value.Username,
		Password: value.Password, Encryption: value.Encryption,
		FromEmail: value.FromEmail, FromName: value.FromName,
	}
}
