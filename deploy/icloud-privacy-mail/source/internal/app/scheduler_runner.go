package app

import (
	"context"
	"fmt"
	"time"
)

func (s *Server) runMailboxScheduler(ctx context.Context, ownerID string, job *mailboxSchedulerJob, cfg mailboxSchedulerConfig) {
	defer func() {
		job.mu.Lock()
		if job.state.Running {
			job.state.Running = false
			job.state.Status = "stopped"
			job.state.StoppedAt = time.Now()
			job.addEventLocked("stopped", "定时创建已停止", job.state.BatchIndex, Mailbox{}, nil)
		}
		job.cancel = nil
		job.mu.Unlock()
	}()

	for {
		if ctx.Err() != nil {
			return
		}
		job.mu.Lock()
		job.state.BatchIndex++
		batch := job.state.BatchIndex
		job.state.Status = "creating"
		job.state.LastRunAt = time.Now()
		job.state.NextRunAt = time.Time{}
		job.addEventLocked("batch_started", schedulerBatchStartedMessage(batch), batch, Mailbox{}, nil)
		job.mu.Unlock()

		if s.runMailboxSchedulerBatch(ctx, ownerID, job, cfg, batch) {
			job.mu.Lock()
			job.state.Running = false
			job.state.Status = "completed"
			job.state.StoppedAt = time.Now()
			job.addEventLocked("completed", fmt.Sprintf("所有账号已达到每账号 %d 个邮箱的目标", defaultMailboxSchedulerTarget), batch, Mailbox{}, nil)
			job.mu.Unlock()
			return
		}
		if ctx.Err() != nil {
			return
		}

		nextRunAt := time.Now().Add(cfg.Interval)
		job.mu.Lock()
		job.state.Status = "waiting"
		job.state.NextRunAt = nextRunAt
		job.addEventLocked("waiting", fmt.Sprintf("进入等待：%s 后重新尝试全部账号", cfg.Interval.Round(time.Second)), batch, Mailbox{}, nil)
		job.mu.Unlock()

		timer := time.NewTimer(cfg.Interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}
