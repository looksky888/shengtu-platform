package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

type backupRunOutput struct {
	archivePath string
	archiveName string
	size        int64
	fileCount   int
	remoteKey   string
	remoteURL   string
	removed     int
}

func (s *BackupService) TriggerTyped() (BackupRunResultPublic, error) {
	cfg, taskID, runCtx, state, started, err := s.beginRun()
	result := BackupRunResultPublic{State: BackupStatePublicFromState(state), Started: started}
	if err != nil {
		result.Error = err.Error()
		return result, err
	}
	if !started {
		return result, nil
	}
	go s.executeRun(runCtx, cfg, taskID)
	return result, nil
}

// Run executes one backup synchronously. It shares the same single-flight guard
// as the HTTP-triggered asynchronous path and is kept for internal callers/tests.
func (s *BackupService) Run() (map[string]any, error) {
	cfg, taskID, runCtx, state, started, err := s.beginRun()
	if err != nil || !started {
		return state.toMap(), err
	}
	out, runErr := s.runBackup(runCtx, cfg, taskID)
	state, finishErr := s.finishRun(taskID, out, runErr)
	s.wg.Done()
	return state.toMap(), errors.Join(runErr, finishErr)
}

func (s *BackupService) beginRun() (BackupConfig, string, context.Context, BackupState, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.storeReady {
		return BackupConfig{}, "", nil, s.state, false, fmt.Errorf("备份配置未成功加载，无法启动备份")
	}
	if s.closing {
		return BackupConfig{}, "", nil, s.state, false, fmt.Errorf("备份服务正在关闭")
	}
	if s.running {
		return BackupConfig{}, s.state.TaskID, nil, s.state, false, nil
	}
	cfg := normalizeBackupConfigStruct(s.config)
	cfg.Include = append([]string(nil), cfg.Include...)
	baseCtx := s.ctx
	if baseCtx == nil {
		baseCtx = context.Background()
	}
	if err := baseCtx.Err(); err != nil {
		return BackupConfig{}, "", nil, s.state, false, fmt.Errorf("备份服务已停止: %w", err)
	}
	runCtx, cancel := context.WithCancel(baseCtx)
	now := util.NowISO()
	taskID := util.NewUUID()
	previous := s.state
	s.state.TaskID = taskID
	s.state.Status = BackupStatusRunning
	s.state.Phase = "queued"
	s.state.StartedAt = now
	s.state.FinishedAt = ""
	s.state.LastRunAt = now
	s.state.LastError = ""
	s.state.Provider = cfg.Provider
	s.state.UpdatedAt = now
	if err := s.saveLocked(); err != nil {
		s.state = previous
		cancel()
		return BackupConfig{}, "", nil, s.state, false, fmt.Errorf("保存备份任务状态失败: %w", err)
	}
	s.running = true
	s.runCancel = cancel
	s.wg.Add(1)
	return cfg, taskID, runCtx, s.state, true, nil
}

func (s *BackupService) executeRun(ctx context.Context, cfg BackupConfig, taskID string) {
	defer s.wg.Done()
	out, err := s.runBackup(ctx, cfg, taskID)
	_, _ = s.finishRun(taskID, out, err)
}

func (s *BackupService) runBackup(ctx context.Context, cfg BackupConfig, taskID string) (backupRunOutput, error) {
	if s.runOverride != nil {
		return s.runOverride(ctx, cfg, taskID)
	}
	return s.executeBackup(ctx, cfg, taskID)
}

func (s *BackupService) setPhase(taskID, phase string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running || s.state.TaskID != taskID {
		return fmt.Errorf("备份任务 %s 已不再运行", taskID)
	}
	s.state.Phase = phase
	s.state.UpdatedAt = util.NowISO()
	if err := s.saveLocked(); err != nil {
		return fmt.Errorf("保存备份阶段失败: %w", err)
	}
	return nil
}

func (s *BackupService) finishRun(taskID string, out backupRunOutput, runErr error) (BackupState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.TaskID != taskID {
		return s.state, fmt.Errorf("备份任务状态已被替换")
	}
	now := util.NowISO()
	s.running = false
	s.runCancel = nil
	s.state.FinishedAt = now
	s.state.UpdatedAt = now
	s.state.LastDurationMS = backupDurationMS(s.state.StartedAt)
	if runErr != nil {
		s.state.Status = BackupStatusFailed
		if errors.Is(runErr, context.Canceled) || errors.Is(runErr, context.DeadlineExceeded) {
			s.state.Phase = "interrupted"
		} else {
			s.state.Phase = "failed"
		}
		s.state.LastError = runErr.Error()
	} else {
		s.state.Status = BackupStatusSuccess
		s.state.Phase = "completed"
		s.state.LastSuccessAt = now
		s.state.LastError = ""
		s.state.LastFile = out.archivePath
		s.state.LastFileName = out.archiveName
		s.state.LastSize = out.size
		s.state.LastFileCount = out.fileCount
		s.state.RemoteKey = out.remoteKey
		s.state.RemoteURL = out.remoteURL
		s.state.RemovedLocalBackups = out.removed
	}
	if err := s.saveLocked(); err != nil {
		finishErr := fmt.Errorf("保存备份完成状态失败: %w", err)
		s.state.Status = BackupStatusFailed
		s.state.Phase = "failed"
		s.state.LastError = finishErr.Error()
		return s.state, finishErr
	}
	return s.state, nil
}

func backupDurationMS(startedAt string) int64 {
	started := parseBackupTime(startedAt)
	if started.IsZero() {
		return 0
	}
	return maxInt64(0, time.Since(started).Milliseconds())
}

func (s *BackupService) executeBackup(ctx context.Context, cfg BackupConfig, taskID string) (backupRunOutput, error) {
	var out backupRunOutput
	if err := ctx.Err(); err != nil {
		return out, err
	}
	if err := validateBackupRunConfig(cfg); err != nil {
		return out, err
	}
	backupDir := s.backupDir(cfg)
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return out, fmt.Errorf("创建备份目录: %w", err)
	}
	if err := s.setPhase(taskID, "collecting"); err != nil {
		return out, err
	}
	excluded := []string(nil)
	var snapshotDir string
	if effectiveBackupIncludes(cfg)["data"] && s.snapshotter != nil {
		if err := s.setPhase(taskID, "snapshotting"); err != nil {
			return out, err
		}
		var err error
		snapshotDir, err = os.MkdirTemp(backupDir, ".snapshot-*")
		if err != nil {
			return out, fmt.Errorf("创建数据库快照临时目录: %w", err)
		}
		defer os.RemoveAll(snapshotDir)
		snapshotPath := filepath.Join(snapshotDir, "chatgpt2api.db")
		if err := s.snapshotter.CreateDatabaseSnapshot(ctx, snapshotPath); err != nil {
			return out, err
		}
		excluded = s.snapshotter.DatabaseSnapshotSourceFiles()
	}
	files, err := s.collectFilesExcluding(cfg, excluded)
	if err != nil {
		return out, fmt.Errorf("收集备份文件: %w", err)
	}
	if snapshotDir != "" {
		files = append(files, backupFile{Path: filepath.Join(snapshotDir, "chatgpt2api.db"), Name: "data/chatgpt2api.db"})
	}
	if err := s.setPhase(taskID, "archiving"); err != nil {
		return out, err
	}
	name := "shengtu-backup-" + time.Now().Format("20060102-150405.000") + "-" + taskID[:8] + ".zip"
	archivePath := filepath.Join(backupDir, name)
	if err := writeBackupZip(ctx, archivePath, files); err != nil {
		return out, fmt.Errorf("生成备份 ZIP: %w", err)
	}
	info, err := os.Stat(archivePath)
	if err != nil {
		return out, fmt.Errorf("读取备份 ZIP 信息: %w", err)
	}
	out = backupRunOutput{archivePath: archivePath, archiveName: name, size: info.Size(), fileCount: len(files)}
	if cfg.Provider == "cloudflare_r2" {
		if err := s.setPhase(taskID, "uploading"); err != nil {
			return out, err
		}
		out.remoteKey, out.remoteURL, err = s.uploadBackupToR2(ctx, cfg, archivePath, name)
		if err != nil {
			return out, err
		}
	}
	if err := s.setPhase(taskID, "finalizing"); err != nil {
		return out, err
	}
	out.removed = s.pruneBackupsLocked(backupDir, cfg.LastMaxFiles)
	return out, nil
}

func validateBackupRunConfig(cfg BackupConfig) error {
	switch cfg.Provider {
	case "local":
		return nil
	case "cloudflare_r2":
		if strings.TrimSpace(cfg.R2AccountID) == "" || strings.TrimSpace(cfg.R2AccessKeyID) == "" ||
			strings.TrimSpace(cfg.R2SecretAccessKey) == "" || strings.TrimSpace(cfg.R2Bucket) == "" {
			return fmt.Errorf("cloudflare R2 配置不完整，请填写 Account ID、Access Key ID、Secret Access Key 和 Bucket")
		}
		return nil
	default:
		return fmt.Errorf("不支持的备份方式: %s", cfg.Provider)
	}
}

func (s *BackupService) Close(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	s.mu.Lock()
	s.closing = true
	if s.cancel != nil {
		s.cancel()
	}
	if s.runCancel != nil {
		s.runCancel()
	}
	s.mu.Unlock()
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("等待备份服务关闭: %w", ctx.Err())
	}
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func normalizePathKey(path string) string {
	abs, err := filepath.Abs(strings.TrimSpace(path))
	if err != nil {
		return filepath.Clean(path)
	}
	return filepath.Clean(abs)
}
