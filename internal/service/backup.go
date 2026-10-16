package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type BackupService struct {
	mu          sync.Mutex
	rootDir     string
	dataDir     string
	path        string
	store       storage.JSONDocumentBackend
	docName     string
	config      BackupConfig
	state       BackupState
	storeReady  bool
	snapshotter storage.DatabaseSnapshotBackend
	ctx         context.Context
	cancel      context.CancelFunc
	runCancel   context.CancelFunc
	started     bool
	closing     bool
	running     bool
	wg          sync.WaitGroup
	runOverride func(context.Context, BackupConfig, string) (backupRunOutput, error)
}

func NewBackupService(rootDir, dataDir string, backend ...storage.Backend) *BackupService {
	var snapshotter storage.DatabaseSnapshotBackend
	if len(backend) > 0 {
		snapshotter, _ = backend[0].(storage.DatabaseSnapshotBackend)
	}
	s := &BackupService{
		rootDir: rootDir, dataDir: dataDir, path: filepath.Join(dataDir, "backup.json"),
		store: firstJSONDocumentStore(backend), docName: "backup.json", snapshotter: snapshotter,
	}
	s.config = backupDefaultConfigStruct()
	s.state = backupDefaultStateStruct()
	s.storeReady = s.load()
	if s.storeReady && s.state.Status == BackupStatusRunning {
		s.state.Status = BackupStatusFailed
		s.state.Phase = "interrupted"
		s.state.FinishedAt = util.NowISO()
		s.state.LastError = "上次备份因服务重启或异常退出而中断"
		s.state.UpdatedAt = s.state.FinishedAt
		if err := s.saveLocked(); err != nil {
			s.storeReady = false
		}
	}
	return s
}

func (s *BackupService) Start(ctx context.Context) {
	if ctx == nil {
		return
	}
	s.mu.Lock()
	if s.started || s.closing {
		s.mu.Unlock()
		return
	}
	s.ctx, s.cancel = context.WithCancel(ctx)
	runCtx := s.ctx
	s.started = true
	s.wg.Add(1)
	s.mu.Unlock()
	go func() {
		defer s.wg.Done()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				s.runIfDue()
			}
		}
	}()
}

func (s *BackupService) runIfDue() {
	s.mu.Lock()
	cfg := normalizeBackupConfigStruct(s.config)
	state := s.state
	if !cfg.Enabled || s.running || s.closing {
		s.mu.Unlock()
		return
	}
	interval := time.Duration(maxInt(1, cfg.IntervalMinutes)) * time.Minute
	lastSuccess := parseBackupTime(cfgStateLastSuccess(state))
	if !lastSuccess.IsZero() && time.Since(lastSuccess) < interval {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	_, _ = s.TriggerTyped()
}

func cfgStateLastSuccess(state BackupState) string {
	return state.LastSuccessAt
}

func (s *BackupService) Get() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{"config": s.config.toMap(), "state": s.state.toMap()}
}

func (s *BackupService) Update(updates map[string]any) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := s.config
	// Keep stored R2 secret when client omits/clears the write-only field after redacted GET.
	if secret, ok := updates["r2_secret_access_key"]; ok && strings.TrimSpace(util.Clean(secret)) == "" {
		delete(updates, "r2_secret_access_key")
	}
	delete(updates, "r2_secret_access_key_configured")
	merged := mergeMaps(s.config.toMap(), updates)
	// Preserve existing secret if not provided in updates.
	if _, ok := updates["r2_secret_access_key"]; !ok {
		merged["r2_secret_access_key"] = s.config.R2SecretAccessKey
	}
	s.config = normalizeBackupConfigStruct(backupConfigFromMap(merged))
	if err := s.saveLocked(); err != nil {
		s.config = previous
		return nil, fmt.Errorf("保存备份配置失败: %w", err)
	}
	return map[string]any{"config": s.config.toMap(), "state": s.state.toMap()}, nil
}

func (s *BackupService) backupDir(cfg BackupConfig) string {
	backupDir := filepath.Join(s.dataDir, "backups")
	if dir := strings.TrimSpace(cfg.LocalDir); dir != "" {
		if filepath.IsAbs(dir) {
			backupDir = dir
		} else {
			backupDir = filepath.Join(s.rootDir, dir)
		}
	}
	return backupDir
}
