package hostupdate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const stateFileName = "status.json"

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
	mu     sync.Mutex
	opts   Options
	runner commandRunner
	client *http.Client
	state  State
}

func NewManager(opts Options) (*Manager, error) {
	if strings.TrimSpace(opts.StateDir) == "" {
		return nil, errors.New("state directory is required")
	}
	if opts.CommandTimeout <= 0 {
		opts.CommandTimeout = 10 * time.Second
	}
	if opts.MinimumFree == 0 {
		opts.MinimumFree = 2 << 30
	}
	if err := os.MkdirAll(opts.StateDir, 0o700); err != nil {
		return nil, fmt.Errorf("create updater state directory: %w", err)
	}
	m := &Manager{
		opts: opts, runner: execRunner{},
		client: &http.Client{Timeout: opts.CommandTimeout},
		state:  State{Status: StatusIdle, UpdatedAt: nowISO(), Checks: []Check{}},
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	if m.state.Status == StatusPreflight {
		m.state.Status = StatusFailed
		m.state.Phase = "interrupted"
		m.state.Error = "上次更新预检因更新器重启而中断"
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
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.Status == StatusPreflight {
		return PreflightResult{State: cloneState(m.state), Started: false}, nil
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
		{"业务健康", m.checkHealth},
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
	if request.TargetVersion != "" {
		m.appendCheck(taskID, Check{Name: "目标版本", Status: "passed", Detail: request.TargetVersion})
	}
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

func (m *Manager) checkComposeFiles(context.Context) error {
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

func (m *Manager) checkHealth(ctx context.Context) error {
	if strings.TrimSpace(m.opts.HealthURL) == "" {
		return errors.New("未配置业务健康地址")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.opts.HealthURL, nil)
	if err != nil {
		return err
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("访问业务健康接口: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("业务健康接口返回 HTTP %d", resp.StatusCode)
	}
	var payload struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return fmt.Errorf("解析业务健康响应: %w", err)
	}
	if payload.Status != "ok" {
		return fmt.Errorf("业务状态为 %q，尚未就绪", payload.Status)
	}
	return nil
}

func (m *Manager) setPhase(taskID, phase string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || m.state.Status != StatusPreflight {
		return
	}
	m.state.Phase, m.state.UpdatedAt = phase, nowISO()
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist phase failed: %v", err)
	}
}

func (m *Manager) appendCheck(taskID string, check Check) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || m.state.Status != StatusPreflight {
		return
	}
	m.state.Checks = append(m.state.Checks, check)
	m.state.UpdatedAt = nowISO()
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist check failed: %v", err)
	}
}

func (m *Manager) finish(taskID, status, message string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || m.state.Status != StatusPreflight {
		return
	}
	now := nowISO()
	m.state.Status, m.state.Phase, m.state.Error = status, "completed", message
	m.state.FinishedAt, m.state.UpdatedAt = now, now
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist terminal state failed: %v", err)
	}
}

func (m *Manager) load() error {
	data, err := os.ReadFile(filepath.Join(m.opts.StateDir, stateFileName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read updater state: %w", err)
	}
	if err := json.Unmarshal(data, &m.state); err != nil {
		return fmt.Errorf("decode updater state: %w", err)
	}
	if m.state.Checks == nil {
		m.state.Checks = []Check{}
	}
	return nil
}

func (m *Manager) saveLocked() error {
	data, err := json.MarshalIndent(m.state, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(m.opts.StateDir, ".status-*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, filepath.Join(m.opts.StateDir, stateFileName))
}

func cloneState(state State) State {
	state.Checks = append([]Check(nil), state.Checks...)
	return state
}
func nowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }
func randomID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(data[:]), nil
}
