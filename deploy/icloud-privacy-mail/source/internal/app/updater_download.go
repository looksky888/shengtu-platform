package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func downloadAndReplaceExecutable(ctx context.Context, downloadURL, wantSHA256, exePath string) error {
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "iCloud-Privacy-Mail-Updater/"+AppVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("下载更新失败：%w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("下载更新失败：HTTP %d：%s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	dir := filepath.Dir(exePath)
	tmp, err := os.CreateTemp(dir, ".panel-update-*")
	if err != nil {
		return fmt.Errorf("创建更新临时文件失败：%w", err)
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	hasher := sha256.New()
	limited := &io.LimitedReader{R: res.Body, N: updateDownloadMaxBytes + 1}
	written, copyErr := io.Copy(io.MultiWriter(tmp, hasher), limited)
	closeErr := tmp.Close()
	if copyErr != nil {
		return fmt.Errorf("保存更新文件失败：%w", copyErr)
	}
	if closeErr != nil {
		return fmt.Errorf("关闭更新文件失败：%w", closeErr)
	}
	if written > updateDownloadMaxBytes {
		return fmt.Errorf("更新文件超过 %d MB，已拒绝", updateDownloadMaxBytes>>20)
	}
	gotSHA256 := hex.EncodeToString(hasher.Sum(nil))
	if wantSHA256 != "" && !strings.EqualFold(gotSHA256, wantSHA256) {
		return fmt.Errorf("更新文件校验失败：sha256=%s", gotSHA256)
	}
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("设置更新文件权限失败：%w", err)
	}
	backupPath := exePath + ".bak-" + time.Now().Format("20060102150405")
	if err := os.Rename(exePath, backupPath); err != nil {
		return fmt.Errorf("备份当前程序失败：%w", err)
	}
	if err := os.Rename(tmpPath, exePath); err != nil {
		_ = os.Rename(backupPath, exePath)
		return fmt.Errorf("替换当前程序失败：%w", err)
	}
	return nil
}
