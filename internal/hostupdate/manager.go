package hostupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const stateFileName = "status.json"

const (
	defaultRepository    = "looksky888/shengtu-platform"
	defaultGitHubAPIBase = "https://api.github.com"
	defaultPlatform      = "linux/amd64"
)

type commandRunner interface {
	Run(context.Context, string, ...string) error
}

type execRunner struct{}

func (execRunner) Run(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}

type Manager struct {
	mu      sync.Mutex
	opts    Options
	runner  commandRunner
	client  *http.Client
	release *releaseClient
	app     *appControlClient
	backup  backupStore
	state   State
}

func NewManager(opts Options) (*Manager, error) {
	if strings.TrimSpace(opts.StateDir) == "" {
		return nil, errors.New("state directory is required")
	}
	if opts.CommandTimeout <= 0 {
		opts.CommandTimeout = 10 * time.Second
	}
	if opts.DrainTimeout <= 0 {
		opts.DrainTimeout = 15 * time.Minute
	}
	if opts.UpdateTimeout <= 0 {
		opts.UpdateTimeout = 30 * time.Minute
	}
	if opts.ReadinessInterval <= 0 {
		opts.ReadinessInterval = 2 * time.Second
	}
	if opts.ReadinessStableCount < 1 {
		opts.ReadinessStableCount = 3
	}
	if opts.MinimumFree == 0 {
		opts.MinimumFree = 2 << 30
	}
	opts.Repository = strings.TrimSpace(opts.Repository)
	if opts.Repository == "" {
		opts.Repository = defaultRepository
	}
	if !repositoryPattern.MatchString(opts.Repository) {
		return nil, errors.New("GitHub 仓库必须使用 owner/name 格式")
	}
	opts.GitHubAPIBase = strings.TrimRight(strings.TrimSpace(opts.GitHubAPIBase), "/")
	if opts.GitHubAPIBase == "" {
		opts.GitHubAPIBase = defaultGitHubAPIBase
	}
	opts.Platform = strings.ToLower(strings.TrimSpace(opts.Platform))
	if opts.Platform == "" {
		opts.Platform = defaultPlatform
	}
	opts.ExpectedImage = strings.ToLower(strings.TrimSpace(opts.ExpectedImage))
	if opts.ExpectedImage == "" {
		opts.ExpectedImage = "ghcr.io/" + strings.ToLower(opts.Repository)
	}
	opts.ComposeProject = strings.TrimSpace(opts.ComposeProject)
	if opts.ComposeProject == "" {
		opts.ComposeProject = "shengtu"
	}
	opts.AppService = strings.TrimSpace(opts.AppService)
	if opts.AppService == "" {
		opts.AppService = "app"
	}
	if !versionPattern.MatchString(opts.ComposeProject) || !versionPattern.MatchString(opts.AppService) {
		return nil, errors.New("Compose 项目名或应用服务名格式无效")
	}
	if strings.TrimSpace(opts.DataDir) == "" && strings.TrimSpace(opts.InstallDir) != "" {
		opts.DataDir = filepath.Join(opts.InstallDir, "data")
	}
	if strings.TrimSpace(opts.ManagedOverride) == "" {
		opts.ManagedOverride = filepath.Join(opts.StateDir, "image.override.yml")
	}
	if err := os.MkdirAll(opts.StateDir, 0o700); err != nil {
		return nil, fmt.Errorf("create updater state directory: %w", err)
	}
	client := &http.Client{Timeout: opts.CommandTimeout}
	app, err := newAppControlClient(opts.AppControlURL, opts.AppControlToken, client)
	if err != nil {
		return nil, err
	}
	m := &Manager{
		opts: opts, runner: execRunner{},
		client:  client,
		release: newReleaseClient(opts, client),
		app:     app,
		backup:  newColdBackupStore(opts),
		state:   State{Status: StatusIdle, UpdatedAt: nowISO(), Checks: []Check{}},
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	if m.state.Status == StatusPreflight {
		m.state.Status = StatusFailed
		m.state.Phase = "interrupted"
		m.state.Error = "上次更新预检因更新器重启而中断"
		m.state.Target = nil
		m.state.FinishedAt = nowISO()
		m.state.UpdatedAt = m.state.FinishedAt
		if err := m.saveLocked(); err != nil {
			return nil, err
		}
	} else if m.state.Status == StatusReady && (m.state.Target == nil || m.state.Source == nil) {
		m.state.Status = StatusFailed
		m.state.Phase = "stale"
		m.state.Error = "已有预检状态缺少已验证的来源或发布目标，请重新执行预检"
		m.state.FinishedAt = nowISO()
		m.state.UpdatedAt = m.state.FinishedAt
		if err := m.saveLocked(); err != nil {
			return nil, err
		}
	}
	return m, nil
}

func (m *Manager) State() State {
	m.mu.Lock()
	defer m.mu.Unlock()
	return cloneState(m.state)
}

func (m *Manager) StartPreflight(request PreflightRequest) (PreflightResult, error) {
	request.TargetVersion = normalizeVersion(request.TargetVersion)
	if !versionPattern.MatchString(request.TargetVersion) {
		return PreflightResult{}, errors.New("目标版本格式无效")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.Status == StatusPreflight {
		return PreflightResult{State: cloneState(m.state), Started: false}, nil
	}
	if m.state.Status == StatusUpdating || m.state.Status == StatusRollback {
		return PreflightResult{}, ErrUpdateBusy
	}
	taskID, err := randomID()
	if err != nil {
		return PreflightResult{}, err
	}
	now := nowISO()
	m.state = State{TaskID: taskID, Status: StatusPreflight, Phase: "starting", StartedAt: now, UpdatedAt: now, Checks: []Check{}}
	if err := m.saveLocked(); err != nil {
		return PreflightResult{}, err
	}
	go m.runPreflight(taskID, request)
	return PreflightResult{State: cloneState(m.state), Started: true}, nil
}

func (m *Manager) runPreflight(taskID string, request PreflightRequest) {
	var target ReleaseTarget
	var source ApplicationIdentity
	checks := []struct {
		name string
		run  func(context.Context) error
	}{
		{"安装目录", m.checkInstallDir},
		{"Compose 配置", m.checkComposeFiles},
		{"状态与备份目录", m.checkWritableDirs},
		{"Docker 引擎", func(ctx context.Context) error {
			return m.runner.Run(ctx, "docker", "version", "--format", "{{.Server.Version}}")
		}},
		{"Docker Compose", func(ctx context.Context) error { return m.runner.Run(ctx, "docker", "compose", "version", "--short") }},
		{"可用磁盘", m.checkDiskSpace},
		{"发布清单", func(ctx context.Context) error {
			resolved, err := m.release.resolve(ctx, request.TargetVersion)
			if err == nil {
				target = resolved
			}
			return err
		}},
		{"业务就绪", func(ctx context.Context) error {
			current, err := m.checkReadiness(ctx)
			if err != nil {
				return err
			}
			source = current
			return validateStorageUpgrade(current.SchemaVersion, target)
		}},
	}
	for _, item := range checks {
		m.setPhase(taskID, item.name)
		ctx, cancel := context.WithTimeout(context.Background(), m.opts.CommandTimeout)
		err := item.run(ctx)
		cancel()
		status, detail := "passed", "通过"
		if err != nil {
			status, detail = "failed", err.Error()
		}
		m.appendCheck(taskID, Check{Name: item.name, Status: status, Detail: detail})
		if err != nil {
			m.finish(taskID, StatusFailed, err.Error())
			return
		}
	}
	m.setTarget(taskID, target, source)
	m.finish(taskID, StatusReady, "")
}

func (m *Manager) checkInstallDir(context.Context) error {
	path := filepath.Clean(strings.TrimSpace(m.opts.InstallDir))
	if !filepath.IsAbs(path) {
		return errors.New("安装目录必须是绝对路径")
	}
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("读取安装目录: %w", err)
	}
	if !info.IsDir() {
		return errors.New("安装目录不是文件夹")
	}
	return nil
}

func (m *Manager) checkComposeFiles(ctx context.Context) error {
	if len(m.opts.ComposeFiles) == 0 {
		return errors.New("未配置 Compose 文件")
	}
	for _, name := range m.opts.ComposeFiles {
		path := name
		if !filepath.IsAbs(path) {
			path = filepath.Join(m.opts.InstallDir, path)
		}
		info, err := os.Stat(path)
		if err != nil {
			return fmt.Errorf("读取 %s: %w", path, err)
		}
		if info.IsDir() {
			return fmt.Errorf("Compose 路径是目录: %s", path)
		}
	}
	if err := m.runner.Run(ctx, "docker", m.composeArgs("config", "--quiet")...); err != nil {
		return fmt.Errorf("渲染 Compose 配置: %w", err)
	}
	return nil
}

func (m *Manager) checkWritableDirs(context.Context) error {
	for _, dir := range []string{m.opts.StateDir, m.opts.BackupDir} {
		if strings.TrimSpace(dir) == "" {
			return errors.New("状态目录或备份目录未配置")
		}
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("创建目录 %s: %w", dir, err)
		}
		file, err := os.CreateTemp(dir, ".write-check-*")
		if err != nil {
			return fmt.Errorf("目录不可写 %s: %w", dir, err)
		}
		name := file.Name()
		closeErr := file.Close()
		removeErr := os.Remove(name)
		if err := errors.Join(closeErr, removeErr); err != nil {
			return fmt.Errorf("清理目录写入检查 %s: %w", dir, err)
		}
	}
	dataDir := filepath.Clean(strings.TrimSpace(m.opts.DataDir))
	if !filepath.IsAbs(dataDir) {
		return errors.New("数据目录必须是绝对路径")
	}
	info, err := os.Stat(dataDir)
	if err != nil {
		return fmt.Errorf("读取数据目录: %w", err)
	}
	if !info.IsDir() {
		return errors.New("数据目录不是文件夹")
	}
	if _, err := safeRelative(m.opts.StateDir, m.opts.ManagedOverride); err != nil {
		return errors.New("托管 Compose 覆盖文件必须位于更新器状态目录")
	}
	return nil
}

func (m *Manager) checkDiskSpace(context.Context) error {
	available, err := diskFreeBytes(m.opts.InstallDir)
	if err != nil {
		return err
	}
	if available < m.opts.MinimumFree {
		return fmt.Errorf("可用空间 %d 字节，低于要求 %d 字节", available, m.opts.MinimumFree)
	}
	return nil
}

func (m *Manager) checkReadiness(ctx context.Context) (ApplicationIdentity, error) {
	if strings.TrimSpace(m.opts.ReadinessURL) == "" {
		return ApplicationIdentity{}, errors.New("未配置业务就绪地址")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.opts.ReadinessURL, nil)
	if err != nil {
		return ApplicationIdentity{}, err
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return ApplicationIdentity{}, fmt.Errorf("访问业务就绪接口: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ApplicationIdentity{}, fmt.Errorf("业务就绪接口返回 HTTP %d", resp.StatusCode)
	}
	var payload struct {
		Status        string `json:"status"`
		Version       string `json:"version"`
		SchemaVersion int    `json:"schema_version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ApplicationIdentity{}, fmt.Errorf("解析业务就绪响应: %w", err)
	}
	if payload.Status != "ready" {
		return ApplicationIdentity{}, fmt.Errorf("业务状态为 %q，尚未就绪", payload.Status)
	}
	if payload.SchemaVersion < 1 {
		return ApplicationIdentity{}, fmt.Errorf("业务返回的存储结构版本 %d 无效", payload.SchemaVersion)
	}
	runningVersion := normalizeVersion(payload.Version)
	if runningVersion == "" {
		return ApplicationIdentity{}, errors.New("业务就绪接口未返回运行版本")
	}
	return ApplicationIdentity{Version: runningVersion, SchemaVersion: payload.SchemaVersion}, nil
}
