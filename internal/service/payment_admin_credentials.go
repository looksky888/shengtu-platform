package service

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"strings"
)

func parsePrivateKeyPEM(raw string) (*rsa.PrivateKey, error) {
	der, err := decodeRSAKeyMaterial(raw)
	if err != nil {
		return nil, err
	}
	if value, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		if key, ok := value.(*rsa.PrivateKey); ok {
			return key, nil
		}
	}
	if key, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return key, nil
	}
	return nil, errors.New("仅支持 RSA PKCS#8 或 PKCS#1 私钥")
}

func parsePublicKeyPEM(raw string) (*rsa.PublicKey, error) {
	der, err := decodeRSAKeyMaterial(raw)
	if err != nil {
		return nil, err
	}
	if value, err := x509.ParsePKIXPublicKey(der); err == nil {
		if key, ok := value.(*rsa.PublicKey); ok {
			return key, nil
		}
	}
	if key, err := x509.ParsePKCS1PublicKey(der); err == nil {
		return key, nil
	}
	if cert, err := x509.ParseCertificate(der); err == nil {
		if key, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			return key, nil
		}
	}
	return nil, errors.New("RSA 公钥或证书 PEM 无效")
}

func decodeRSAKeyMaterial(raw string) ([]byte, error) {
	trimmed := strings.TrimSpace(raw)
	if block, _ := pem.Decode([]byte(trimmed)); block != nil {
		return block.Bytes, nil
	}
	compact := strings.Join(strings.Fields(trimmed), "")
	if compact == "" {
		return nil, errors.New("密钥内容为空")
	}
	der, err := base64.StdEncoding.DecodeString(compact)
	if err != nil {
		return nil, errors.New("密钥必须是 PEM 或 Base64 DER")
	}
	return der, nil
}
