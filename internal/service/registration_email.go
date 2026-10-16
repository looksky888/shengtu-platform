package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
)

var ErrRegistrationEmailUnavailable = errors.New("平台尚未配置注册邮件，请联系管理员")

const (
	emailSettingsDocumentName     = "email_settings.json"
	emailVerificationDocumentName = "email_verifications.json"
)

type EmailSMTPConfig struct {
	Host       string
	Port       int
	Username   string
	Password   string
	Encryption string
	FromEmail  string
	FromName   string
}

type EmailSettingsInput struct {
	Enabled    bool   `json:"enabled"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	Encryption string `json:"encryption"`
	FromEmail  string `json:"from_email"`
	FromName   string `json:"from_name"`
}

type EmailSettingsPublic struct {
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Encryption  string `json:"encryption"`
	FromEmail   string `json:"from_email"`
	FromName    string `json:"from_name"`
	HasPassword bool   `json:"has_password"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

type emailSettingsRecord struct {
	EmailSettingsInput
	PasswordCiphertext string `json:"password_ciphertext,omitempty"`
	UpdatedAt          string `json:"updated_at,omitempty"`
}

type EmailVerification struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Purpose   string `json:"purpose"`
	CodeHash  string `json:"code_hash"`
	Attempts  int    `json:"attempts"`
	ClientIP  string `json:"client_ip,omitempty"`
	DeviceID  string `json:"device_id,omitempty"`
	CreatedAt string `json:"created_at"`
	ExpiresAt string `json:"expires_at"`
	UsedAt    string `json:"used_at,omitempty"`
}

type emailVerificationState struct {
	Items []EmailVerification `json:"items"`
}

type RegistrationEmailOptions struct {
	SendMail     func(context.Context, EmailSMTPConfig, string, string, string) error
	Now          func() time.Time
	GenerateCode func() (string, error)
}

type RegistrationEmailService struct {
	mu       sync.Mutex
	store    storage.JSONDocumentBackend
	key      []byte
	settings EmailSettingsInput
	updated  string
	codes    []EmailVerification
	sendMail func(context.Context, EmailSMTPConfig, string, string, string) error
	now      func() time.Time
	code     func() (string, error)
}

func NewRegistrationEmailService(dataDir string, backend storage.Backend, options *RegistrationEmailOptions) (*RegistrationEmailService, error) {
	store := jsonDocumentStoreFromBackend(backend)
	if store == nil {
		return nil, errors.New("邮箱注册需要 JSON 文档存储")
	}
	key, err := loadOrCreateEmailSettingsKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("加载邮箱设置密钥: %w", err)
	}
	s := &RegistrationEmailService{
		store: store, key: key, sendMail: sendSMTPMail,
		now: time.Now, code: randomEmailCode,
	}
	if options != nil {
		if options.SendMail != nil {
			s.sendMail = options.SendMail
		}
		if options.Now != nil {
			s.now = options.Now
		}
		if options.GenerateCode != nil {
			s.code = options.GenerateCode
		}
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *RegistrationEmailService) load() error {
	rawSettings, err := s.store.LoadJSONDocument(emailSettingsDocumentName)
	if err != nil {
		return fmt.Errorf("加载邮箱设置: %w", err)
	}
	if rawSettings != nil {
		var record emailSettingsRecord
		if err := remarshalJSON(rawSettings, &record); err != nil {
			return fmt.Errorf("邮箱设置格式无效: %w", err)
		}
		password, err := decryptEmailSecret(s.key, record.PasswordCiphertext)
		if err != nil {
			return fmt.Errorf("解密 SMTP 密码: %w", err)
		}
		record.Password = password
		s.settings = normalizeEmailSettings(record.EmailSettingsInput)
		s.updated = record.UpdatedAt
	} else {
		s.settings = normalizeEmailSettings(EmailSettingsInput{})
	}
	rawCodes, err := s.store.LoadJSONDocument(emailVerificationDocumentName)
	if err != nil {
		return fmt.Errorf("加载邮箱验证码: %w", err)
	}
	if rawCodes != nil {
		var state emailVerificationState
		if err := remarshalJSON(rawCodes, &state); err != nil {
			return fmt.Errorf("邮箱验证码格式无效: %w", err)
		}
		s.codes = state.Items
	}
	s.pruneLocked(s.now())
	return nil
}

func remarshalJSON(value any, target any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, target)
}

func normalizeEmailSettings(value EmailSettingsInput) EmailSettingsInput {
	value.Host = strings.TrimSpace(value.Host)
	value.Username = strings.TrimSpace(value.Username)
	value.Password = strings.TrimSpace(value.Password)
	value.FromEmail = strings.ToLower(strings.TrimSpace(value.FromEmail))
	value.FromName = strings.TrimSpace(value.FromName)
	if value.Port == 0 {
		value.Port = 587
	}
	switch value.Encryption {
	case "tls", "none":
	default:
		value.Encryption = "starttls"
	}
	if value.FromName == "" {
		value.FromName = "生图"
	}
	return value
}

func validateEmailSettings(value EmailSettingsInput) error {
	if strings.ContainsAny(value.FromName, "\r\n") {
		return errors.New("发件人名称不能包含换行")
	}
	if !value.Enabled {
		return nil
	}
	if value.Host == "" || value.Port < 1 || value.Port > 65535 || value.FromEmail == "" {
		return errors.New("启用邮件前请填写 SMTP 主机、端口和发件邮箱")
	}
	if _, err := normalizeAccountEmail(value.FromEmail); err != nil {
		return errors.New("发件邮箱格式不正确")
	}
	if value.Username != "" && value.Password == "" {
		return errors.New("SMTP 用户名已填写，请同时填写密码")
	}
	if value.Username == "" && value.Password != "" {
		return errors.New("SMTP 密码已填写，请同时填写用户名")
	}
	return nil
}

func (s *RegistrationEmailService) Enabled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settings.Enabled && validateEmailSettings(s.settings) == nil
}

func (s *RegistrationEmailService) Settings() EmailSettingsPublic {
	s.mu.Lock()
	defer s.mu.Unlock()
	return publicEmailSettings(s.settings, s.updated)
}

func publicEmailSettings(value EmailSettingsInput, updated string) EmailSettingsPublic {
	return EmailSettingsPublic{
		Enabled: value.Enabled, Host: value.Host, Port: value.Port,
		Username: value.Username, Encryption: value.Encryption,
		FromEmail: value.FromEmail, FromName: value.FromName,
		HasPassword: value.Password != "", UpdatedAt: updated,
	}
}
