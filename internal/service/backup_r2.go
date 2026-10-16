package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func (s *BackupService) uploadBackupToR2(ctx context.Context, cfg BackupConfig, archivePath, name string) (string, string, error) {
	accountID := strings.TrimSpace(cfg.R2AccountID)
	accessKey := strings.TrimSpace(cfg.R2AccessKeyID)
	secretKey := strings.TrimSpace(cfg.R2SecretAccessKey)
	bucket := strings.TrimSpace(cfg.R2Bucket)
	prefix := strings.Trim(strings.TrimSpace(cfg.R2Prefix), "/")
	if accountID == "" || accessKey == "" || secretKey == "" || bucket == "" {
		return "", "", fmt.Errorf("cloudflare R2 配置不完整，请填写 Account ID、Access Key ID、Secret Access Key 和 Bucket")
	}
	hashFile, err := os.Open(archivePath)
	if err != nil {
		return "", "", err
	}
	hasher := sha256.New()
	size, hashErr := io.Copy(hasher, hashFile)
	if err := errors.Join(hashErr, hashFile.Close()); err != nil {
		return "", "", fmt.Errorf("计算备份文件哈希: %w", err)
	}
	payloadHash := hex.EncodeToString(hasher.Sum(nil))
	uploadFile, err := os.Open(archivePath)
	if err != nil {
		return "", "", err
	}
	key := name
	if prefix != "" {
		key = prefix + "/" + name
	}
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com/%s/%s", accountID, bucket, url.PathEscape(key))
	endpoint = strings.ReplaceAll(endpoint, "%2F", "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, uploadFile)
	if err != nil {
		return "", "", errors.Join(err, uploadFile.Close())
	}
	req.Header.Set("Content-Type", "application/zip")
	req.ContentLength = size
	req.Header.Set("Content-Length", fmt.Sprint(size))
	signR2Request(req, accessKey, secretKey, payloadHash)
	client := &http.Client{Timeout: 2 * time.Hour}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4096))
	closeErr := resp.Body.Close()
	if err := errors.Join(readErr, closeErr); err != nil {
		return "", "", fmt.Errorf("读取 Cloudflare R2 响应: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("cloudflare R2 上传失败：HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return key, endpoint, nil
}

func signR2Request(req *http.Request, accessKey, secretKey, payloadHash string) {
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalURI := req.URL.EscapedPath()
	canonicalHeaders := "host:" + req.Host + "\n" + "x-amz-content-sha256:" + payloadHash + "\n" + "x-amz-date:" + amzDate + "\n"
	canonicalRequest := strings.Join([]string{req.Method, canonicalURI, "", canonicalHeaders, signedHeaders, payloadHash}, "\n")
	credentialScope := dateStamp + "/auto/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + credentialScope + "\n" + sha256Hex([]byte(canonicalRequest))
	signingKey := awsV4SigningKey(secretKey, dateStamp, "auto", "s3")
	signature := hmacSHA256Hex(signingKey, stringToSign)
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+accessKey+"/"+credentialScope+", SignedHeaders="+signedHeaders+", Signature="+signature)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(data))
	return h.Sum(nil)
}

func hmacSHA256Hex(key []byte, data string) string {
	return hex.EncodeToString(hmacSHA256(key, data))
}

func awsV4SigningKey(secret, date, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), date)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	return hmacSHA256(kService, "aws4_request")
}
