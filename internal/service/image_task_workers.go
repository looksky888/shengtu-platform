package service

import (
	"context"
	"time"

	"chatgpt2api/internal/util"
)

func (s *ImageTaskService) BindRootContext(parent context.Context) {
	if s == nil || parent == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.rootCancel != nil {
		return
	}
	s.rootCtx, s.rootCancel = context.WithCancel(parent)
	s.startWorkersLocked()
}

func (s *ImageTaskService) startWorkersLocked() {
	if s.workersStarted {
		return
	}
	if s.workerCount < 1 {
		s.workerCount = defaultImageTaskWorkers
	}
	if s.queueCapacity < 1 {
		s.queueCapacity = defaultImageTaskQueueCap
	}
	if s.videoWorkerCount < 1 {
		s.videoWorkerCount = defaultVideoTaskWorkers
	}
	if s.videoQueueCapacity < 1 {
		s.videoQueueCapacity = defaultVideoTaskQueueCap
	}
	s.workQueue = make(chan imageTaskWork, s.queueCapacity)
	s.relayWorkQueue = make(chan imageTaskWork, s.queueCapacity)
	s.videoWorkQueue = make(chan imageTaskWork, s.videoQueueCapacity)
	s.workerStop = make(chan struct{})
	s.workersStarted = true
	for i := 0; i < s.workerCount; i++ {
		s.workerWG.Add(1)
		go s.imageTaskWorker()
	}
	// Relay work has a dedicated pool with the same configured capacity. This
	// intentionally uses separate workers so a slow relay cannot occupy every
	// local account-pool worker, and local work cannot starve a relay.
	for i := 0; i < s.workerCount; i++ {
		s.workerWG.Add(1)
		go s.relayTaskWorker()
	}
	for i := 0; i < s.videoWorkerCount; i++ {
		s.workerWG.Add(1)
		go s.videoTaskWorker()
	}
}

func (s *ImageTaskService) imageTaskWorker() { s.taskWorker(s.workQueue) }
func (s *ImageTaskService) relayTaskWorker() { s.taskWorker(s.relayWorkQueue) }
func (s *ImageTaskService) videoTaskWorker() { s.taskWorker(s.videoWorkQueue) }

func (s *ImageTaskService) taskWorker(queue <-chan imageTaskWork) {
	defer s.workerWG.Done()
	for {
		select {
		case work := <-queue:
			s.executeImageTaskWork(work)
		case <-s.workerStop:
			for {
				select {
				case work := <-queue:
					s.executeImageTaskWork(work)
				default:
					return
				}
			}
		}
	}
}

func (s *ImageTaskService) executeImageTaskWork(work imageTaskWork) {
	defer s.taskWG.Done()
	defer s.recoverTaskPanic(work.key)
	s.runTask(work.ctx, work.key, work.mode, work.identity, work.payload)
}

func (s *ImageTaskService) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	s.closing = true
	s.mu.Unlock()

	done := make(chan struct{})
	go func() { s.taskWG.Wait(); close(done) }()
	waitCtx := ctx
	if waitCtx == nil {
		var cancel context.CancelFunc
		waitCtx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
	}
	select {
	case <-done:
	case <-waitCtx.Done():
		if s.rootCancel != nil {
			s.rootCancel()
		}
		s.mu.Lock()
		for _, cancel := range s.cancels {
			cancel()
		}
		s.mu.Unlock()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
		}
	}

	s.mu.Lock()
	now := util.NowLocal()
	for key, task := range s.tasks {
		if task == nil || !isActiveTaskStatus(util.Clean(task.Status)) {
			continue
		}
		task.finishStage(time.Now())
		task.applyUpdates(map[string]any{"status": TaskStatusCancelled, "error": "服务关闭，任务已取消", "progress": 100, "progress_stage": "已取消", "progress_message": "服务关闭，任务已取消"})
		task.FinishedAt = now
		task.UpdatedAt = now
		task.DurationSeconds = taskDurationSeconds(task, now)
		task.durationSecondsSet = true
		s.recordTerminalStatsLocked(task)
		s.markTaskDirtyLocked(key)
	}
	s.indexDirty = true
	taskSaveErr := s.saveLocked()
	statsSaveErr := s.flushStatsLedgerSaveLocked()
	if s.saveTimer != nil {
		s.saveTimer.Stop()
		s.saveTimer = nil
	}
	if s.statsLedgerSaveTimer != nil {
		s.statsLedgerSaveTimer.Stop()
		s.statsLedgerSaveTimer = nil
	}
	if s.rootCancel != nil {
		s.rootCancel()
	}
	if s.workersStarted && s.workerStop != nil {
		close(s.workerStop)
		s.workersStarted = false
	}
	s.mu.Unlock()
	s.workerWG.Wait()
	if taskSaveErr != nil {
		return taskSaveErr
	}
	return statsSaveErr
}
