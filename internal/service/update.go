package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	updateCacheTTL       = 20 * time.Minute
	defaultUpdateRepo    = "looksky888/shengtu-platform"
	defaultGitHubAPIBase = "https://api.github.com"
	maxUpdateDownload    = 500 * 1024 * 1024
)

type UpdateService struct {
	mu             sync.Mutex
	repo           string
	apiBaseURL     string
	githubToken    string
	currentVersion string
	buildType      string
	deployment     string
	httpClient     *http.Client
	downloadClient *http.Client
	cached         *UpdateInfo
	cachedAt       time.Time
}

type UpdateOptions struct {
	Repo           string
	APIBaseURL     string
	GitHubToken    string
	CurrentVersion string
	BuildType      string
	Deployment     string
	ProxyURL       string
}

type UpdateInfo struct {
	CurrentVersion           string       `json:"current_version"`
	LatestVersion            string       `json:"latest_version"`
	HasUpdate                bool         `json:"has_update"`
	ReleaseInfo              *ReleaseInfo `json:"release_info,omitempty"`
	Cached                   bool         `json:"cached"`
	Warning                  string       `json:"warning,omitempty"`
	BuildType                string       `json:"build_type"`
	Deployment               string       `json:"deployment"`
	Repository               string       `json:"repository"`
	AutomaticUpdateSupported bool         `json:"automatic_update_supported"`
	SupportReason            string       `json:"support_reason,omitempty"`
}

type ReleaseInfo struct {
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
	HTMLURL     string    `json:"html_url"`
	Assets      []Asset   `json:"assets"`
}

type Asset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"download_url"`
	Size        int64  `json:"size"`
}

func NewUpdateService(options UpdateOptions) *UpdateService {
	repo := strings.TrimSpace(options.Repo)
	if repo == "" {
		repo = defaultUpdateRepo
	}
	apiBaseURL := strings.TrimRight(strings.TrimSpace(options.APIBaseURL), "/")
	if apiBaseURL == "" {
		apiBaseURL = defaultGitHubAPIBase
	}
	buildType := strings.TrimSpace(options.BuildType)
	if buildType == "" {
		buildType = "source"
	}
	deployment := strings.ToLower(strings.TrimSpace(options.Deployment))
	if deployment == "" {
		deployment = "binary"
	}
	return &UpdateService{
		repo:           repo,
		apiBaseURL:     apiBaseURL,
		githubToken:    strings.TrimSpace(options.GitHubToken),
		currentVersion: strings.TrimSpace(options.CurrentVersion),
		buildType:      buildType,
		deployment:     deployment,
		httpClient:     HTTPClientForProxy(options.ProxyURL, 30*time.Second),
		downloadClient: HTTPClientForProxy(options.ProxyURL, 10*time.Minute),
	}
}

func (s *UpdateService) CheckUpdate(ctx context.Context, force bool) (*UpdateInfo, error) {
	if !force {
		if cached := s.cachedInfo(); cached != nil {
			return cached, nil
		}
	}
	info, err := s.fetchLatestRelease(ctx)
	if err != nil {
		if cached := s.cachedInfo(); cached != nil {
			cached.Warning = "Using cached data: " + err.Error()
			return cached, nil
		}
		return &UpdateInfo{
			CurrentVersion:           s.currentVersion,
			LatestVersion:            s.currentVersion,
			HasUpdate:                false,
			Warning:                  err.Error(),
			BuildType:                s.buildType,
			Deployment:               s.deployment,
			Repository:               s.repo,
			AutomaticUpdateSupported: s.automaticUpdateSupported(),
			SupportReason:            s.automaticUpdateSupportReason(),
		}, nil
	}
	s.saveInfo(info)
	return cloneUpdateInfo(info), nil
}

func (s *UpdateService) automaticUpdateSupported() bool {
	return s.deployment == "binary" && strings.EqualFold(s.buildType, "release")
}

func (s *UpdateService) automaticUpdateSupportReason() string {
	if s.automaticUpdateSupported() {
		return ""
	}
	if s.deployment == "docker" || s.deployment == "compose" {
		return "Docker 部署需要独立 Host Updater；当前仅支持检查更新"
	}
	return "只有 release 二进制部署支持进程内更新"
}

func (s *UpdateService) EnsureAutomaticUpdateSupported() error {
	if s.automaticUpdateSupported() {
		return nil
	}
	return errors.New(s.automaticUpdateSupportReason())
}

func (s *UpdateService) PerformUpdate(ctx context.Context) error {
	if err := s.EnsureAutomaticUpdateSupported(); err != nil {
		return err
	}
	info, err := s.CheckUpdate(ctx, true)
	if err != nil {
		return err
	}
	if !info.HasUpdate {
		return errors.New("当前已是最新版本")
	}
	if info.ReleaseInfo == nil {
		return errors.New("缺少发布信息")
	}

	archiveName := runtime.GOOS + "_" + runtime.GOARCH
	downloadURL, checksumURL := matchingReleaseAssets(info.ReleaseInfo.Assets, archiveName)
	if downloadURL == "" {
		return fmt.Errorf("未找到适用于 %s/%s 的发布包", runtime.GOOS, runtime.GOARCH)
	}
	if err := validateUpdateDownloadURL(downloadURL); err != nil {
		return fmt.Errorf("下载地址无效: %w", err)
	}
	if checksumURL != "" {
		if err := validateUpdateDownloadURL(checksumURL); err != nil {
			return fmt.Errorf("校验文件地址无效: %w", err)
		}
	}

	exePath, err := executablePath()
	if err != nil {
		return err
	}
	exeDir := filepath.Dir(exePath)
	tempDir, err := os.MkdirTemp(exeDir, ".chatgpt2api-update-*")
	if err != nil {
		return fmt.Errorf("创建更新临时目录失败: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	archivePath := filepath.Join(tempDir, downloadFileName(downloadURL))
	if err := s.downloadFile(ctx, downloadURL, archivePath); err != nil {
		return fmt.Errorf("下载失败: %w", err)
	}
	if checksumURL != "" {
		if err := s.verifyChecksum(ctx, archivePath, checksumURL); err != nil {
			return fmt.Errorf("校验和验证失败: %w", err)
		}
	}

	extractDir := filepath.Join(tempDir, "extract")
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return err
	}
	if err := extractUpdateArchive(archivePath, extractDir); err != nil {
		return fmt.Errorf("解压失败: %w", err)
	}
	newBinaryPath, err := findExtractedBinary(extractDir)
	if err != nil {
		return err
	}
	if err := os.Chmod(newBinaryPath, 0o755); err != nil {
		return fmt.Errorf("设置可执行权限失败: %w", err)
	}

	return replaceRuntimeFiles(exePath, newBinaryPath)
}

func (s *UpdateService) Rollback() error {
	if err := s.EnsureAutomaticUpdateSupported(); err != nil {
		return err
	}
	exePath, err := executablePath()
	if err != nil {
		return err
	}
	return rollbackRuntimeFiles(exePath)
}
