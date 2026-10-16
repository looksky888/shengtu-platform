package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/storage"
)

const (
	paymentSettingsKeyEnv  = "CHATGPT2API_PAYMENT_SETTINGS_KEY"
	paymentSettingsKeyFile = "payment_settings.secret"
	paymentSecretPrefix    = "v1:"
)

// loadOrCreatePaymentSettingsKey keeps payment credentials under a key that is
// independent from SMTP and registration secrets. The generated key is written
// with owner-only permissions and is never returned through an API response.
func loadOrCreatePaymentSettingsKey(dataDir string) ([]byte, error) {
	if raw := strings.TrimSpace(os.Getenv(paymentSettingsKeyEnv)); raw != "" {
		return decodePaymentSettingsKey(raw)
	}
	path := filepath.Join(dataDir, paymentSettingsKeyFile)
	if raw, err := os.ReadFile(path); err == nil {
		return decodePaymentSettingsKey(strings.TrimSpace(string(raw)))
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	if err := storage.AtomicWriteFile(path, []byte(hex.EncodeToString(key)+"\n"), 0o600); err != nil {
		return nil, err
	}
	return key, nil
}

func decodePaymentSettingsKey(raw string) ([]byte, error) {
	if key, err := hex.DecodeString(raw); err == nil && len(key) == 32 {
		return key, nil
	}
	if key, err := base64.StdEncoding.DecodeString(raw); err == nil && len(key) == 32 {
		return key, nil
	}
	return nil, fmt.Errorf("%s 必须是 32 字节密钥的 hex 或 base64", paymentSettingsKeyEnv)
}

func encryptPaymentSecret(key []byte, field, plaintext string) (string, error) {
	if strings.TrimSpace(plaintext) == "" {
		return "", nil
	}
	gcm, err := paymentSecretGCM(key)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), []byte("payment:"+strings.TrimSpace(field)))
	return paymentSecretPrefix + base64.RawStdEncoding.EncodeToString(sealed), nil
}

func decryptPaymentSecret(key []byte, field, encoded string) (string, error) {
	if strings.TrimSpace(encoded) == "" {
		return "", nil
	}
	if !strings.HasPrefix(encoded, paymentSecretPrefix) {
		return "", errors.New("支付凭据密文版本无效")
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(encoded, paymentSecretPrefix))
	if err != nil {
		return "", err
	}
	gcm, err := paymentSecretGCM(key)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("支付凭据密文长度无效")
	}
	plaintext, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], []byte("payment:"+strings.TrimSpace(field)))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func paymentSecretGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
