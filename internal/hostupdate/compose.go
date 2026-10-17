package hostupdate

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (m *Manager) pullTargetImage(ctx context.Context, target ReleaseTarget) error {
	return m.runner.Run(ctx, "docker", "pull", target.Image+"@"+target.Digest)
}

func (m *Manager) stopApp(ctx context.Context) error {
	return m.runner.Run(ctx, "docker", m.composeArgs("stop", m.opts.AppService)...)
}

func (m *Manager) startApp(ctx context.Context) error {
	return m.runner.Run(ctx, "docker", m.composeArgs("up", "-d", "--no-deps", m.opts.AppService)...)
}

func (m *Manager) composeArgs(command ...string) []string {
	args := []string{"compose", "--project-directory", m.opts.InstallDir, "-p", m.opts.ComposeProject}
	for _, name := range m.opts.ComposeFiles {
		if !filepath.IsAbs(name) {
			name = filepath.Join(m.opts.InstallDir, name)
		}
		args = append(args, "-f", filepath.Clean(name))
	}
	if _, err := os.Stat(m.opts.ManagedOverride); err == nil {
		args = append(args, "-f", m.opts.ManagedOverride)
	}
	return append(args, command...)
}

func (m *Manager) prepareManagedOverride(taskID string) error {
	if _, err := safeRelative(m.opts.StateDir, m.opts.ManagedOverride); err != nil {
		return errors.New("托管 Compose 覆盖文件必须位于更新器状态目录")
	}
	previousPath := filepath.Join(m.opts.StateDir, "previous-"+taskID+".override.yml")
	existed := false
	if data, err := os.ReadFile(m.opts.ManagedOverride); err == nil {
		existed = true
		if err := writeAtomicFile(previousPath, data, 0o600); err != nil {
			return fmt.Errorf("保存旧镜像覆盖文件: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("读取镜像覆盖文件: %w", err)
	}
	if err := m.updateTransaction(taskID, func(transaction *UpdateTransaction) {
		transaction.PreviousOverrideExisted = existed
		transaction.PreviousOverridePath = previousPath
		transaction.OverridePrepared = true
	}); err != nil {
		return fmt.Errorf("持久化旧镜像覆盖信息: %w", err)
	}
	return nil
}

func (m *Manager) switchManagedOverride(taskID string, target ReleaseTarget) error {
	state := m.State()
	if state.TaskID != taskID || state.Transaction == nil || !state.Transaction.OverridePrepared {
		return errors.New("当前镜像覆盖信息尚未安全保存")
	}
	content := fmt.Sprintf("services:\n  %s:\n    image: %q\n", m.opts.AppService, target.Image+"@"+target.Digest)
	if err := writeAtomicFile(m.opts.ManagedOverride, []byte(content), 0o600); err != nil {
		return fmt.Errorf("写入镜像覆盖文件: %w", err)
	}
	if err := m.updateTransaction(taskID, func(transaction *UpdateTransaction) { transaction.OverrideSwitched = true }); err != nil {
		return fmt.Errorf("持久化镜像切换状态: %w", err)
	}
	return nil
}

func (m *Manager) restoreManagedOverride(transaction UpdateTransaction) error {
	if transaction.PreviousOverrideExisted {
		data, err := os.ReadFile(transaction.PreviousOverridePath)
		if err != nil {
			return fmt.Errorf("读取旧镜像覆盖文件: %w", err)
		}
		return writeAtomicFile(m.opts.ManagedOverride, data, 0o600)
	}
	if err := os.Remove(m.opts.ManagedOverride); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("移除新镜像覆盖文件: %w", err)
	}
	return nil
}

func writeAtomicFile(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".write-*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(mode); err != nil {
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
	return replaceFile(name, path)
}

func cleanError(err error) string {
	if err == nil {
		return ""
	}
	return strings.TrimSpace(err.Error())
}

