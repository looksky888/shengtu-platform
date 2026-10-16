package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

const (
	registrationEmailPurpose = "registration"
	registrationEmailCodeTTL = 10 * time.Minute
	registrationEmailResend  = time.Minute
	registrationEmailHour    = time.Hour
	registrationEmailMaxTry  = 5
)

type EmailRateLimitError struct {
	RetryAfter time.Duration
	Message    string
}

func (e *EmailRateLimitError) Error() string { return e.Message }

type EmailCodeDelivery struct {
	Sent              bool `json:"sent"`
	RetryAfterSeconds int  `json:"retry_after_seconds"`
	ExpiresInSeconds  int  `json:"expires_in_seconds"`
}

func (s *RegistrationEmailService) SendRegistrationCode(ctx context.Context, rawEmail, clientIP, deviceID string) (EmailCodeDelivery, error) {
	return s.sendEmailCode(
		ctx, rawEmail, clientIP, deviceID, registrationEmailPurpose,
		"生图注册验证码", "发送注册邮件失败", registrationEmailBody,
	)
}

func (s *RegistrationEmailService) sendEmailCode(
	ctx context.Context,
	rawEmail, clientIP, deviceID, purpose, subject, failureMessage string,
	body func(string) string,
) (EmailCodeDelivery, error) {
	email, err := normalizeAccountEmail(rawEmail)
	if err != nil {
		return EmailCodeDelivery{}, err
	}
	clientIP = NormalizeClientIP(clientIP)
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		return EmailCodeDelivery{}, errors.New("注册设备标识无效，请刷新页面后重试")
	}
	code, err := s.code()
	if err != nil {
		return EmailCodeDelivery{}, err
	}
	now := s.now()

	s.mu.Lock()
	if !s.settings.Enabled || validateEmailSettings(s.settings) != nil {
		s.mu.Unlock()
		return EmailCodeDelivery{}, ErrRegistrationEmailUnavailable
	}
	if err := s.checkSendLimitLocked(email, clientIP, deviceID, purpose, now); err != nil {
		s.mu.Unlock()
		return EmailCodeDelivery{}, err
	}
	record := EmailVerification{
		ID: util.NewHex(16), Email: email, Purpose: purpose,
		CodeHash: s.hashCode(purpose, email, code), ClientIP: clientIP, DeviceID: deviceID,
		CreatedAt: now.UTC().Format(time.RFC3339Nano),
		ExpiresAt: now.Add(registrationEmailCodeTTL).UTC().Format(time.RFC3339Nano),
	}
	s.codes = append(s.codes, record)
	settings := s.settings
	if err := s.persistCodesLocked(); err != nil {
		s.codes = s.codes[:len(s.codes)-1]
		s.mu.Unlock()
		return EmailCodeDelivery{}, err
	}
	s.mu.Unlock()

	if err := s.sendMail(ctx, smtpConfig(settings), email, subject, body(code)); err != nil {
		s.mu.Lock()
		removeErr := s.removeCodeLocked(record.ID)
		s.mu.Unlock()
		if removeErr != nil {
			return EmailCodeDelivery{}, errors.Join(fmt.Errorf("%s: %w", failureMessage, err), removeErr)
		}
		return EmailCodeDelivery{}, fmt.Errorf("%s: %w", failureMessage, err)
	}
	return EmailCodeDelivery{Sent: true, RetryAfterSeconds: int(registrationEmailResend.Seconds()), ExpiresInSeconds: int(registrationEmailCodeTTL.Seconds())}, nil
}

func (s *RegistrationEmailService) checkSendLimitLocked(email, clientIP, deviceID, purpose string, now time.Time) error {
	var emailCount, ipCount, deviceCount int
	for _, item := range s.codes {
		created := parseEmailTime(item.CreatedAt)
		if created.IsZero() {
			continue
		}
		if item.Email == email && item.Purpose == purpose && now.Sub(created) < registrationEmailResend {
			return &EmailRateLimitError{RetryAfter: registrationEmailResend - now.Sub(created), Message: "验证码发送过于频繁，请稍后再试"}
		}
		if now.Sub(created) > registrationEmailHour {
			continue
		}
		if item.Email == email {
			emailCount++
		}
		if clientIP != "" && item.ClientIP == clientIP {
			ipCount++
		}
		if item.DeviceID == deviceID {
			deviceCount++
		}
	}
	if emailCount >= 5 || ipCount >= 10 || deviceCount >= 5 {
		return &EmailRateLimitError{RetryAfter: registrationEmailHour, Message: "验证码请求过多，请一小时后重试"}
	}
	return nil
}

func (s *RegistrationEmailService) VerifyRegistrationCode(rawEmail, rawCode, deviceID string) (string, error) {
	return s.verifyEmailCode(rawEmail, rawCode, deviceID, registrationEmailPurpose)
}

func (s *RegistrationEmailService) verifyEmailCode(rawEmail, rawCode, deviceID, purpose string) (string, error) {
	email, err := normalizeAccountEmail(rawEmail)
	if err != nil {
		return "", err
	}
	code := strings.TrimSpace(rawCode)
	if len(code) != 6 {
		return "", errors.New("请输入 6 位邮箱验证码")
	}
	deviceID = strings.TrimSpace(deviceID)
	s.mu.Lock()
	defer s.mu.Unlock()
	index := s.latestCodeIndexLocked(email, purpose)
	if index < 0 {
		return "", errors.New("请先获取邮箱验证码")
	}
	record := &s.codes[index]
	now := s.now()
	if record.UsedAt != "" || now.After(parseEmailTime(record.ExpiresAt)) {
		return "", errors.New("邮箱验证码已失效，请重新获取")
	}
	if record.DeviceID == "" || record.DeviceID != deviceID {
		return "", errors.New("验证码与当前设备不匹配，请重新获取")
	}
	if !hmac.Equal([]byte(record.CodeHash), []byte(s.hashCode(purpose, email, code))) {
		previous := append([]EmailVerification(nil), s.codes...)
		record.Attempts++
		if record.Attempts >= registrationEmailMaxTry {
			record.UsedAt = now.UTC().Format(time.RFC3339Nano)
		}
		if err := s.persistCodesLocked(); err != nil {
			s.codes = previous
			return "", err
		}
		if record.Attempts >= registrationEmailMaxTry {
			return "", errors.New("验证码错误次数过多，请重新获取")
		}
		return "", errors.New("邮箱验证码不正确")
	}
	return record.ID, nil
}

func (s *RegistrationEmailService) MarkCodeUsed(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := append([]EmailVerification(nil), s.codes...)
	for index := range s.codes {
		if s.codes[index].ID != id || s.codes[index].UsedAt != "" {
			continue
		}
		s.codes[index].UsedAt = s.now().UTC().Format(time.RFC3339Nano)
		if err := s.persistCodesLocked(); err != nil {
			s.codes = previous
			return err
		}
		return nil
	}
	return errors.New("邮箱验证码已失效")
}

func (s *RegistrationEmailService) latestCodeIndexLocked(email, purpose string) int {
	index := -1
	for i := range s.codes {
		if s.codes[i].Email == email && s.codes[i].Purpose == purpose {
			index = i
		}
	}
	return index
}

func (s *RegistrationEmailService) hashCode(purpose, email, code string) string {
	mac := hmac.New(sha256.New, s.key)
	_, _ = mac.Write([]byte(purpose + ":" + email + ":" + code))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *RegistrationEmailService) persistCodesLocked() error {
	s.pruneLocked(s.now())
	if err := s.store.SaveJSONDocument(emailVerificationDocumentName, emailVerificationState{Items: s.codes}); err != nil {
		return fmt.Errorf("保存邮箱验证码: %w", err)
	}
	return nil
}

func (s *RegistrationEmailService) removeCodeLocked(id string) error {
	next := make([]EmailVerification, 0, len(s.codes))
	for _, item := range s.codes {
		if item.ID != id {
			next = append(next, item)
		}
	}
	s.codes = next
	return s.persistCodesLocked()
}

func (s *RegistrationEmailService) pruneLocked(now time.Time) {
	cutoff := now.Add(-24 * time.Hour)
	next := make([]EmailVerification, 0, len(s.codes))
	for _, item := range s.codes {
		created := parseEmailTime(item.CreatedAt)
		if !created.IsZero() && created.After(cutoff) {
			next = append(next, item)
		}
	}
	s.codes = next
}

func parseEmailTime(value string) time.Time {
	parsed, _ := time.Parse(time.RFC3339Nano, strings.TrimSpace(value))
	return parsed
}

func randomEmailCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func registrationEmailBody(code string) string {
	return "你正在注册生图平台账号。\n\n验证码：" + code + "\n\n验证码 10 分钟内有效。若非本人操作，请忽略本邮件。"
}
