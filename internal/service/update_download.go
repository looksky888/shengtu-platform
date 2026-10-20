package service

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func (s *UpdateService) downloadFile(ctx context.Context, downloadURL, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.downloadClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("下载返回 HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > maxUpdateDownload {
		return fmt.Errorf("下载文件过大：%d 字节", resp.ContentLength)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	written, copyErr := io.Copy(out, io.LimitReader(resp.Body, maxUpdateDownload+1))
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(dest)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(dest)
		return closeErr
	}
	if written > maxUpdateDownload {
		_ = os.Remove(dest)
		return fmt.Errorf("下载超过大小限制 %d 字节", maxUpdateDownload)
	}
	return nil
}

func (s *UpdateService) verifyChecksum(ctx context.Context, filePath, checksumURL string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checksumURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("校验文件下载返回 HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return err
	}
	hash, err := fileSHA256(filePath)
	if err != nil {
		return err
	}
	fileName := filepath.Base(filePath)
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 2 && strings.TrimPrefix(parts[1], "*") == fileName {
			if strings.EqualFold(parts[0], hash) {
				return nil
			}
			return fmt.Errorf("校验和不匹配：期望 %s，实际 %s", parts[0], hash)
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return fmt.Errorf("未找到 %s 的校验和", fileName)
}

func matchingReleaseAssets(assets []Asset, archiveName string) (string, string) {
	var downloadURL string
	var checksumURL string
	for _, asset := range assets {
		name := strings.TrimSpace(asset.Name)
		url := strings.TrimSpace(asset.DownloadURL)
		if name == "" || url == "" {
			continue
		}
		// Deterministic: the first checksum manifest in release order wins.
		if checksumURL == "" && isChecksumAssetName(name) {
			checksumURL = url
			continue
		}
		if strings.Contains(name, archiveName) && !strings.HasSuffix(name, ".txt") {
			downloadURL = url
		}
	}
	return downloadURL, checksumURL
}

// isChecksumAssetName recognises the sha256 manifest names release tooling uses
// (goreleaser's "checksums.txt", scripted "sha256sums.txt", ...).
func isChecksumAssetName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if !strings.HasSuffix(lower, ".txt") {
		return false
	}
	return strings.Contains(lower, "checksum") || strings.Contains(lower, "sha256sum")
}

func validateUpdateDownloadURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL 无效: %w", err)
	}
	if parsed.Scheme != "https" {
		return errors.New("仅允许 HTTPS 下载地址")
	}
	host := strings.ToLower(parsed.Hostname())
	switch {
	case host == "github.com":
		return nil
	case strings.HasSuffix(host, ".github.com"):
		return nil
	case host == "objects.githubusercontent.com":
		return nil
	case strings.HasSuffix(host, ".objects.githubusercontent.com"):
		return nil
	default:
		return fmt.Errorf("不可信的下载主机: %s", host)
	}
}

func downloadFileName(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err == nil {
		if name := path.Base(parsed.Path); name != "." && name != "/" {
			return name
		}
	}
	return "update-archive"
}

func fileSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
