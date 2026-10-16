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

const emailSettingsKeyEnv = "CHATGPT2API_EMAIL_SETTINGS_KEY"
const emailSettingsKeyFile = "email_settings.secret"

func loadOrCreateEmailSettingsKey(dataDir string) ([]byte, error) {
	if raw := strings.TrimSpace(os.Getenv(emailSettingsKeyEnv)); raw != "" {
		return decodeEmailSettingsKey(raw)
	}
	path := filepath.Join(dataDir, emailSettingsKeyFile)
	if raw, err := os.ReadFile(path); err == nil {
		return decodeEmailSettingsKey(strings.TrimSpace(string(raw)))
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

func decodeEmailSettingsKey(raw string) ([]byte, error) {
	if key, err := hex.DecodeString(raw); err == nil && len(key) == 32 {
		return key, nil
	}
	if key, err := base64.StdEncoding.DecodeString(raw); err == nil && len(key) == 32 {
		return key, nil
	}
	return nil, fmt.Errorf("%s 必须是 32 字节密钥的 hex 或 base64", emailSettingsKeyEnv)
}

func encryptEmailSecret(key []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	gcm, err := emailSecretGCM(key)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), []byte(emailSettingsDocumentName))
	return "v1:" + base64.RawStdEncoding.EncodeToString(sealed), nil
}

func decryptEmailSecret(key []byte, encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	if !strings.HasPrefix(encoded, "v1:") {
		return "", errors.New("SMTP 密码密文版本无效")
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(encoded, "v1:"))
	if err != nil {
		return "", err
	}
	gcm, err := emailSecretGCM(key)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("SMTP 密码密文长度无效")
	}
	plaintext, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], []byte(emailSettingsDocumentName))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func emailSecretGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
