package service

import (
	"chatgpt2api/internal/util"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"net/mail"
	"strings"
)

func normalizeAccountUsername(username string) (string, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if !accountUsernameRE.MatchString(username) {
		return "", errors.New("用户名需为 3-32 位小写字母、数字、点、下划线或短横线，并以字母或数字开头")
	}
	return username, nil
}

func normalizeAccountDisplayName(name, username string) string {
	name = util.Clean(name)
	if len([]rune(name)) > 64 {
		name = string([]rune(name)[:64])
	}
	if name != "" {
		return name
	}
	return username
}

func normalizeAccountEmail(value string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(value))
	if email == "" || len(email) > 254 || strings.ContainsAny(email, "\r\n") {
		return "", errors.New("请输入有效邮箱")
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		return "", errors.New("请输入有效邮箱")
	}
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" || domain == "" || !strings.Contains(domain, ".") {
		return "", errors.New("请输入有效邮箱")
	}
	return email, nil
}

// ValidateRegistrationEmail exposes the canonical account email validation at
// the HTTP boundary without leaking normalization rules into handlers.
func ValidateRegistrationEmail(value string) error {
	_, err := normalizeAccountEmail(value)
	return err
}

// ValidateAccountPassword exposes the canonical password rules at public HTTP boundaries.
func ValidateAccountPassword(value string) error {
	return validateAccountPassword(value)
}

func validateAccountPassword(password string) error {
	if len(password) < 8 {
		return errors.New("密码长度不能少于 8 位")
	}
	if len(password) > 128 {
		return errors.New("密码长度不能超过 128 位")
	}
	return nil
}

func hashAccountPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func verifyAccountPassword(password, hash string) bool {
	if password == "" || hash == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
