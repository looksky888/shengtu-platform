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
	imageChannelKeyEnv  = "CHATGPT2API_IMAGE_CHANNEL_KEY"
	imageChannelKeyFile = "image_channels.secret"
	imageChannelAAD     = "image_channels.json"
)

func loadOrCreateImageChannelKey(dataDir string) ([]byte, error) {
	if raw := strings.TrimSpace(os.Getenv(imageChannelKeyEnv)); raw != "" {
		return decodeImageChannelKey(raw)
	}
	path := filepath.Join(dataDir, imageChannelKeyFile)
	if raw, err := os.ReadFile(path); err == nil {
		return decodeImageChannelKey(strings.TrimSpace(string(raw)))
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

func decodeImageChannelKey(raw string) ([]byte, error) {
	if key, err := hex.DecodeString(raw); err == nil && len(key) == 32 {
		return key, nil
	}
	if key, err := base64.StdEncoding.DecodeString(raw); err == nil && len(key) == 32 {
		return key, nil
	}
	return nil, fmt.Errorf("%s 必须是 32 字节密钥的 hex 或 base64", imageChannelKeyEnv)
}

func encryptImageChannelSecret(key []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	gcm, err := imageChannelGCM(key)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), []byte(imageChannelAAD))
	return "v1:" + base64.RawStdEncoding.EncodeToString(sealed), nil
}

func decryptImageChannelSecret(key []byte, encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	if !strings.HasPrefix(encoded, "v1:") {
		return "", errors.New("生图渠道密钥版本无效")
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(encoded, "v1:"))
	if err != nil {
		return "", err
	}
	gcm, err := imageChannelGCM(key)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("生图渠道密钥长度无效")
	}
	plain, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], []byte(imageChannelAAD))
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func imageChannelGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
