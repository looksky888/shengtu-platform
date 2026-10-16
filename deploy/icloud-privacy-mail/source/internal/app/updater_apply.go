package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func (s *Server) applyUpdate(ctx context.Context) (publicUpdateStatus, error) {
	s.updateApplyMu.Lock()
	defer s.updateApplyMu.Unlock()

	if runtime.GOOS == "windows" {
		return publicUpdateStatus{}, errCode("update_unsupported", "Windows 运行中的 exe 不能安全自替换，请下载新版后手动重启", false)
	}
	candidate, err := s.latestUpdateCandidate(ctx, true)
	if err != nil {
		return publicUpdateStatus{}, err
	}
	if !candidate.Status.UpdateAvailable {
		return candidate.Status, errCode("no_update_available", "当前已经是最新版本", false)
	}
	if strings.TrimSpace(candidate.DownloadURL) == "" || !candidate.Status.AssetAvailable {
		return candidate.Status, errCode("update_asset_missing", "最新版本没有匹配当前系统架构的二进制包", false)
	}
	if isArchiveAssetName(candidate.Status.AssetName) {
		return candidate.Status, errCode("update_asset_unsupported", "最新版本匹配到的是压缩包，在线更新需要发布裸二进制文件", false)
	}
	exePath, err := os.Executable()
	if err != nil {
		return candidate.Status, fmt.Errorf("读取当前程序路径失败：%w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return candidate.Status, fmt.Errorf("解析当前程序路径失败：%w", err)
	}
	if err := downloadAndReplaceExecutable(ctx, candidate.DownloadURL, candidate.SHA256, exePath); err != nil {
		return candidate.Status, err
	}
	candidate.Status.CheckedAt = formatTime(time.Now())
	go func() {
		time.Sleep(1200 * time.Millisecond)
		os.Exit(2)
	}()
	return candidate.Status, nil
}

func getJSON(ctx context.Context, url string, out any) error {
	reqCtx, cancel := context.WithTimeout(ctx, updateHTTPTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "iCloud-Privacy-Mail-Updater/"+AppVersion)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return &httpStatusError{StatusCode: res.StatusCode, Body: strings.TrimSpace(string(body))}
	}
	return json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(out)
}

func githubAPIURL(path string) string {
	base := strings.TrimRight(strings.TrimSpace(updateGitHubAPIBaseURL), "/")
	if base == "" {
		base = "https://api.github.com"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return base + path
}

func shortCommit(sha string) string {
	sha = strings.TrimSpace(sha)
	if len(sha) <= 7 {
		return sha
	}
	return sha[:7]
}

func firstLine(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if idx := strings.IndexAny(text, "\r\n"); idx >= 0 {
		return strings.TrimSpace(text[:idx])
	}
	return text
}
