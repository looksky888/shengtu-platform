package service

import (
	"chatgpt2api/internal/util"
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

func (s *ImageTaskService) CancelTask(identity Identity, clientTaskID string) (map[string]any, error) {
	taskID := strings.TrimSpace(clientTaskID)
	if taskID == "" {
		return nil, fmt.Errorf("请提供任务 ID")
	}
	key := taskKey(ownerID(identity), taskID)
	return s.cancelTaskByKey(key)
}

// AdminCancelTask cancels a task by public id regardless of owner (ops task-queue).
func (s *ImageTaskService) AdminCancelTask(clientTaskID string) (map[string]any, error) {
	taskID := strings.TrimSpace(clientTaskID)
	if taskID == "" {
		return nil, fmt.Errorf("请提供任务 ID")
	}
	s.mu.Lock()
	var key string
	for k, task := range s.tasks {
		if util.Clean(task.ID) == taskID {
			key = k
			break
		}
	}
	s.mu.Unlock()
	if key == "" {
		return nil, fmt.Errorf("创作任务不存在")
	}
	return s.cancelTaskByKey(key)
}

func (s *ImageTaskService) cancelTaskByKey(key string) (map[string]any, error) {
	now := util.NowLocal()
	var cancel context.CancelFunc
	var saveErr error
	var observer func(*ImageTask)
	var snapshot *ImageTask
	s.mu.Lock()
	task := s.tasks[key]
	if task == nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("创作任务不存在")
	}
	if isActiveTaskStatus(util.Clean(task.Status)) {
		task.finishStage(time.Now())
		task.Status = TaskStatusCancelled
		task.Error = "任务已终止"
		task.Progress = 100
		task.progressSet = true
		task.ProgressStage = "已取消"
		task.ProgressMessage = "任务已终止"
		task.FinishedAt = now
		task.DurationSeconds = taskDurationSeconds(task, now)
		task.durationSecondsSet = true
		if task.Data == nil {
			task.Data = []map[string]any{}
		}
		task.UpdatedAt = now
		cancel = s.cancels[key]
		delete(s.cancels, key)
		s.markTaskDirtyLocked(key)
		saveErr = s.flushSaveLocked()
		s.notifySubscribersLocked()
		observer = s.terminalObserver
		if observer != nil {
			copy := *task
			copy.Data = append([]map[string]any(nil), task.Data...)
			copy.Events = append([]map[string]any(nil), task.Events...)
			snapshot = &copy
		}
	}
	result := publicTask(task)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if observer != nil && snapshot != nil {
		observer(snapshot)
	}
	if saveErr != nil {
		return result, &ImageTaskPersistenceError{Operation: "任务已取消，但保存任务状态", Err: saveErr}
	}
	return result, nil
}

func (s *ImageTaskService) submit(ctx context.Context, identity Identity, clientTaskID, mode string, payload map[string]any) (map[string]any, error) {
	taskID := strings.TrimSpace(clientTaskID)
	if taskID == "" {
		return nil, fmt.Errorf("请提供任务 ID")
	}
	owner := ownerID(identity)
	key := taskKey(owner, taskID)
	now := util.NowLocal()
	s.mu.Lock()
	if !s.storeReady {
		s.mu.Unlock()
		return nil, fmt.Errorf("创作任务数据未成功加载，已拒绝新任务以防清空存储")
	}
	cleaned := s.cleanupLocked()
	if existing := s.tasks[key]; existing != nil {
		fingerprint := strings.TrimSpace(util.Clean(payload["request_fingerprint"]))
		if fingerprint != "" && (existing.RequestFingerprint == "" || fingerprint != existing.RequestFingerprint) {
			s.mu.Unlock()
			return nil, ImageTaskIdempotencyConflictError{}
		}
		if cleaned {
			if err := s.saveLocked(); err != nil {
				log.Printf("image task duplicate-submit cleanup persistence failed: %v", err)
			}
		}
		result := publicTask(existing)
		s.mu.Unlock()
		return result, nil
	}
	if s.draining || s.closing {
		code := ImageTaskAdmissionCodeDraining
		message := strings.TrimSpace(s.drainReason)
		if s.closing {
			code = ImageTaskAdmissionCodeClosing
			message = "服务正在关闭，无法提交新任务"
		} else if message == "" {
			message = "服务更新中，暂不接收新的创作任务"
		}
		if cleaned {
			if saveErr := s.saveLocked(); saveErr != nil {
				log.Printf("image task admission cleanup persistence failed: %v", saveErr)
			}
		}
		s.mu.Unlock()
		return nil, ImageTaskAdmissionError{Code: code, Message: message}
	}
	count := taskCount(mode, payload)
	if err := s.checkUserTaskLimitsLocked(identity, owner, count, mode, payload, time.Now()); err != nil {
		if cleaned {
			if saveErr := s.saveLocked(); saveErr != nil {
				log.Printf("image task limit-check cleanup persistence failed: %v", saveErr)
			}
		}
		s.mu.Unlock()
		return nil, err
	}
	// App wiring starts workers through BindRootContext. Keep a lazy start for
	// focused service tests and embedders that submit before binding a root
	// context; otherwise a nil queue is indistinguishable from a full queue.
	s.startWorkersLocked()
	parent := s.rootCtx
	if parent == nil {
		parent = context.Background()
	}
	taskCtx, cancel := context.WithCancel(parent)
	outputFormat := NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
	if mode == "video" {
		outputFormat = ""
	}
	task := &ImageTask{
		ID: taskID, OwnerID: owner,
		OwnerName: firstNonEmpty(util.Clean(identity.Name), util.Clean(identity.CredentialName), util.Clean(identity.ID)),
		Status:    TaskStatusQueued, Mode: mode, Model: firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto),
		Size: util.Clean(payload["size"]), Quality: util.Clean(payload["quality"]),
		Seconds: util.ToInt(payload["seconds"], 0), ResolutionName: util.Clean(payload["resolution_name"]),
		Preset:             util.Clean(payload["preset"]),
		RequestFingerprint: util.Clean(payload["request_fingerprint"]),
		OutputFormat:       outputFormat, Visibility: util.Clean(payload["visibility"]),
		EffectiveProvider: util.Clean(payload["effective_provider"]),
		EffectiveChannel:  util.Clean(payload["effective_channel"]),
		ProviderSource:    util.Clean(payload["provider_source"]),
		EffectiveModel:    util.Clean(payload["effective_model"]),
		ChannelModelID:    util.Clean(payload["channel_model_id"]),
		ChannelID:         util.Clean(payload["channel_id"]),
		ChannelName:       util.Clean(payload["channel_name"]),
		CreditCost:        util.ToInt(payload["image_credit_cost"], 0),
		UpstreamHost:      util.Clean(payload["upstream_host"]),
		Count:             count, CreatedAt: now, UpdatedAt: now,
		Progress: 5, progressSet: true, ProgressStage: "排队中", ProgressMessage: "等待任务 Worker",
		LogCount: 1, logCountSet: true,
	}
	task.activeStage = "queue_wait"
	task.activeStageStartedAt = time.Now()
	if compression, ok := normalizedImageOutputCompressionValue(payload["output_compression"]); ok {
		task.OutputCompression = &compression
	}
	s.tasks[key] = task
	s.cancels[key] = cancel
	s.markTaskDirtyLocked(key)
	s.indexDirty = true
	if err := s.saveLocked(); err != nil {
		delete(s.tasks, key)
		delete(s.cancels, key)
		cancel()
		s.mu.Unlock()
		return nil, fmt.Errorf("保存任务失败: %w", err)
	}
	// Stable billing ref: deductImageCredits prefers client_task_id / task_id.
	// Must match BillingRefForTask so restart recovery can refund the same ref.
	if payload == nil {
		payload = map[string]any{}
	} else {
		// Shallow copy so concurrent callers cannot mutate the live map mid-flight.
		copied := make(map[string]any, len(payload)+2)
		for k, v := range payload {
			copied[k] = v
		}
		payload = copied
	}
	payload["client_task_id"] = taskID
	payload["task_id"] = taskID
	result := publicTask(task)
	s.taskWG.Add(1)
	work := imageTaskWork{ctx: taskCtx, key: key, mode: mode, identity: identity, payload: payload}
	queue := s.workQueue
	queueFullMessage := "图片任务队列已满，请稍后重试"
	if mode == "video" {
		queue = s.videoWorkQueue
		queueFullMessage = "视频任务队列已满，请稍后重试"
	} else if imageTaskLane(mode, payload) == imageTaskLaneRelay {
		queue = s.relayWorkQueue
		queueFullMessage = "中转站图片任务队列已满，请稍后重试"
	}
	select {
	case queue <- work:
		s.mu.Unlock()
		return result, nil
	default:
		s.taskWG.Done()
		delete(s.tasks, key)
		delete(s.cancels, key)
		cancel()
		s.markTaskRemovedLocked(key)
		if saveErr := s.saveLocked(); saveErr != nil {
			// The task was never accepted by a worker. If deleting its
			// persisted row fails, keep a durable terminal record instead of
			// leaving a queued ghost task that can reappear after restart.
			now := util.NowLocal()
			task.Status = TaskStatusError
			task.Error = queueFullMessage
			task.Progress = 100
			task.progressSet = true
			task.ProgressStage = "已拒绝"
			task.ProgressMessage = queueFullMessage
			task.FinishedAt = now
			task.DurationSeconds = taskDurationSeconds(task, now)
			task.durationSecondsSet = true
			task.UpdatedAt = now
			if task.Data == nil {
				task.Data = []map[string]any{}
			}
			s.tasks[key] = task
			if s.removedKeys != nil {
				delete(s.removedKeys, key)
			}
			s.markTaskDirtyLocked(key)
			s.indexDirty = true
			if retryErr := s.saveLocked(); retryErr != nil {
				log.Printf("image task queue-overflow rollback persistence failed: %v", retryErr)
				s.mu.Unlock()
				return nil, &ImageTaskPersistenceError{Operation: "队列满回滚持久化", Err: retryErr}
			}
			s.notifySubscribersLocked()
		}
		s.mu.Unlock()
		return nil, fmt.Errorf("%s", queueFullMessage)
	}
}
