package hostupdate

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrUpdateBusy     = errors.New("已有更新任务正在运行")
	ErrUpdateNotReady = errors.New("请先完成并通过更新前检查")
)

func (m *Manager) StartUpdate(request UpdateRequest) (UpdateResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.Status == StatusUpdating || m.state.Status == StatusRollback {
		return UpdateResult{State: cloneState(m.state), Started: false}, nil
	}
	if m.state.Status != StatusReady || m.state.Target == nil || m.state.Source == nil {
		return UpdateResult{}, ErrUpdateNotReady
	}
	if strings.TrimSpace(request.TaskID) == "" || request.TaskID != m.state.TaskID {
		return UpdateResult{}, errors.New("更新任务 ID 已失效，请重新运行更新前检查")
	}
	if m.app == nil || m.backup == nil {
		return UpdateResult{}, errors.New("应用排空控制或冷备份服务未配置")
	}
	previous := cloneState(m.state)
	now := nowISO()
	m.state.Status, m.state.Phase, m.state.Error = StatusUpdating, "starting_update", ""
	m.state.StartedAt, m.state.FinishedAt, m.state.UpdatedAt = now, "", now
	m.state.Transaction = &UpdateTransaction{}
	if err := m.saveLocked(); err != nil {
		m.state = previous
		return UpdateResult{}, err
	}
	taskID := m.state.TaskID
	go m.runUpdate(taskID)
	return UpdateResult{State: cloneState(m.state), Started: true}, nil
}

func (m *Manager) runUpdate(taskID string) {
	state := m.State()
	if state.Target == nil || state.Source == nil {
		m.finish(taskID, StatusFailed, "更新目标或来源状态缺失")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), m.opts.UpdateTimeout)
	defer cancel()
	if err := m.updateStep(ctx, taskID, "预拉目标镜像", func(ctx context.Context) error {
		return m.pullTargetImage(ctx, *state.Target)
	}); err != nil {
		m.finish(taskID, StatusFailed, err.Error())
		return
	}
	if err := m.updateStep(ctx, taskID, "排空写入与创作任务", m.drainApplication); err != nil {
		_ = m.resumeApplication(context.Background())
		m.finish(taskID, StatusFailed, err.Error())
		return
	}
	if err := m.updateStep(ctx, taskID, "记录当前镜像覆盖", func(context.Context) error {
		return m.prepareManagedOverride(taskID)
	}); err != nil {
		_ = m.resumeApplication(context.Background())
		m.finish(taskID, StatusFailed, err.Error())
		return
	}
	if err := m.updateStep(ctx, taskID, "停止应用服务", func(ctx context.Context) error {
		if err := m.updateTransaction(taskID, func(transaction *UpdateTransaction) { transaction.StopInitiated = true }); err != nil {
			return err
		}
		if err := m.stopApp(ctx); err != nil {
			return err
		}
		return m.updateTransaction(taskID, func(transaction *UpdateTransaction) { transaction.AppStopped = true })
	}); err != nil {
		m.rollbackUpdate(taskID, err)
		return
	}
	if err := m.updateStep(ctx, taskID, "创建停写冷备份", func(ctx context.Context) error {
		artifact, err := m.backup.Create(ctx, taskID)
		if err != nil {
			return err
		}
		return m.updateTransaction(taskID, func(transaction *UpdateTransaction) { transaction.Backup = &artifact })
	}); err != nil {
		m.rollbackUpdate(taskID, err)
		return
	}
	if err := m.updateStep(ctx, taskID, "切换不可变镜像", func(context.Context) error {
		return m.switchManagedOverride(taskID, *state.Target)
	}); err != nil {
		m.rollbackUpdate(taskID, err)
		return
	}
	if err := m.updateStep(ctx, taskID, "启动目标版本", m.startApp); err != nil {
		m.rollbackUpdate(taskID, err)
		return
	}
	if err := m.updateStep(ctx, taskID, "连续健康验收", func(ctx context.Context) error {
		return m.waitForIdentity(ctx, ApplicationIdentity{Version: state.Target.Version, SchemaVersion: state.Target.StorageSchemaVersion})
	}); err != nil {
		m.rollbackUpdate(taskID, err)
		return
	}
	m.finish(taskID, StatusSucceeded, "")
}

func (m *Manager) updateStep(ctx context.Context, taskID, name string, run func(context.Context) error) error {
	m.setPhase(taskID, name)
	err := run(ctx)
	status, detail := "passed", "通过"
	if err != nil {
		status, detail = "failed", cleanError(err)
	}
	m.appendCheck(taskID, Check{Name: name, Status: status, Detail: detail})
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	return nil
}

func (m *Manager) drainApplication(ctx context.Context) error {
	drainCtx, cancel := context.WithTimeout(ctx, m.opts.DrainTimeout)
	defer cancel()
	state, err := m.app.beginDrain(drainCtx)
	if err != nil {
		return err
	}
	for !state.Drained {
		select {
		case <-drainCtx.Done():
			return fmt.Errorf("等待任务排空: %w", drainCtx.Err())
		case <-time.After(m.opts.ReadinessInterval):
		}
		state, err = m.app.status(drainCtx)
		if err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) resumeApplication(ctx context.Context) error {
	if m.app == nil {
		return nil
	}
	resumeCtx, cancel := context.WithTimeout(ctx, m.opts.CommandTimeout)
	defer cancel()
	_, err := m.app.resume(resumeCtx)
	return err
}

func (m *Manager) waitForIdentity(ctx context.Context, expected ApplicationIdentity) error {
	consecutive := 0
	var lastErr error
	for {
		identity, err := m.checkReadiness(ctx)
		if err == nil && expected.Version != "" && identity.Version != expected.Version {
			err = fmt.Errorf("运行版本 %q，不是目标版本 %q", identity.Version, expected.Version)
		}
		if err == nil && identity.SchemaVersion != expected.SchemaVersion {
			err = fmt.Errorf("存储结构版本 %d，不是目标版本 %d", identity.SchemaVersion, expected.SchemaVersion)
		}
		if err == nil {
			consecutive++
			if consecutive >= m.opts.ReadinessStableCount {
				return nil
			}
		} else {
			consecutive, lastErr = 0, err
		}
		select {
		case <-ctx.Done():
			if lastErr != nil {
				return fmt.Errorf("等待应用稳定就绪: %w（最后错误：%v）", ctx.Err(), lastErr)
			}
			return fmt.Errorf("等待应用稳定就绪: %w", ctx.Err())
		case <-time.After(m.opts.ReadinessInterval):
		}
	}
}

func (m *Manager) rollbackUpdate(taskID string, cause error) {
	started, persistErr := m.beginRollback(taskID, cleanError(cause))
	if !started {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), m.opts.UpdateTimeout)
	defer cancel()
	state := m.State()
	if state.Transaction == nil || state.Source == nil {
		m.finish(taskID, StatusFailed, "更新失败且缺少回滚元数据: "+cleanError(cause))
		return
	}
	transaction := *state.Transaction
	errorsFound := []error{}
	if persistErr != nil {
		errorsFound = append(errorsFound, fmt.Errorf("持久化回滚状态: %w", persistErr))
	}
	if err := m.stopApp(ctx); err != nil {
		errorsFound = append(errorsFound, fmt.Errorf("停止目标应用: %w", err))
	}
	if transaction.Backup != nil {
		if err := m.backup.Restore(ctx, *transaction.Backup); err != nil {
			errorsFound = append(errorsFound, fmt.Errorf("恢复冷备份: %w", err))
		}
	}
	if err := m.restoreManagedOverride(transaction); err != nil {
		errorsFound = append(errorsFound, err)
	}
	if err := m.startApp(ctx); err != nil {
		errorsFound = append(errorsFound, fmt.Errorf("重启原版本: %w", err))
	} else if err := m.waitForIdentity(ctx, *state.Source); err != nil {
		errorsFound = append(errorsFound, fmt.Errorf("验收原版本: %w", err))
	}
	if len(errorsFound) > 0 {
		m.finish(taskID, StatusFailed, fmt.Sprintf("更新失败：%v；自动回滚失败：%v", cause, errors.Join(errorsFound...)))
		return
	}
	m.finish(taskID, StatusRolledBack, "更新失败，已自动回滚："+cleanError(cause))
}

func (m *Manager) RecoverInterrupted() {
	state := m.State()
	if state.Status != StatusUpdating && state.Status != StatusRollback {
		return
	}
	if state.Transaction == nil || (!state.Transaction.StopInitiated && !state.Transaction.AppStopped && !state.Transaction.OverrideSwitched) {
		_ = m.resumeApplication(context.Background())
		m.finish(state.TaskID, StatusFailed, "更新器重启中断了更新，应用写入已恢复，请重新预检")
		return
	}
	go m.rollbackUpdate(state.TaskID, errors.New("更新器重启中断了更新"))
}

