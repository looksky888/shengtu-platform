package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

const maxTaskEvents = 40

type taskProgressBridge struct {
	service *ImageTaskService
	key     string
}

func (b *taskProgressBridge) Event(stage, message string, extra map[string]any) {
	if b == nil || b.service == nil || b.key == "" {
		return
	}
	b.service.appendTaskEvent(b.key, stage, message, extra)
}

func (b *taskProgressBridge) BindAccount(label, tokenHash string, switchCount int) {
	if b == nil || b.service == nil {
		return
	}
	updates := map[string]any{
		"account_label":        label,
		"account_token_hash":   tokenHash,
		"account_switch_count": switchCount,
	}
	b.service.updateActiveTask(b.key, updates)
	b.Event("account_bound", "绑定账号 "+label, map[string]any{
		"account_label":        label,
		"account_token_hash":   tokenHash,
		"account_switch_count": switchCount,
	})
}

func (b *taskProgressBridge) SetProgress(percent int, stage, message string) {
	if b == nil || b.service == nil {
		return
	}
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	b.service.updateActiveTask(b.key, map[string]any{
		"progress": percent, "progress_stage": stage, "progress_message": message,
	})
	b.Event(stage, message, map[string]any{"progress": percent})
}

func (s *ImageTaskService) appendTaskEvent(key, stage, message string, extra map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	// Terminal tasks must not be mutated (cancel/finish already closed the lifecycle).
	if task == nil || !isActiveTaskStatus(util.Clean(task.Status)) {
		return
	}
	event := map[string]any{
		"time":    util.NowLocal(),
		"stage":   stage,
		"message": message,
	}
	for k, v := range extra {
		if util.Clean(k) == "" || v == nil {
			continue
		}
		event[k] = v
	}
	task.applyObservabilityUpdates(event)
	events := append([]map[string]any(nil), task.Events...)
	events = append(events, event)
	if len(events) > maxTaskEvents {
		events = events[len(events)-maxTaskEvents:]
	}
	task.Events = events
	task.LogCount = len(events)
	task.logCountSet = true
	if stage != "" && util.Clean(task.ProgressStage) == "" {
		task.ProgressStage = stage
	}
	if message != "" {
		task.ProgressMessage = message
	}
	task.UpdatedAt = util.NowLocal()
	// Coalesce event persistence under load; terminal states flush via finish/cancel.
	s.scheduleSaveLocked(key)
	s.notifySubscribersLocked()
}

// SubscribeTaskQueue returns SSE payloads for admin task queue.
func (s *ImageTaskService) SubscribeTaskQueue(ctx context.Context) <-chan string {
	ch := make(chan string, 8)
	s.mu.Lock()
	if s.subscribers == nil {
		s.subscribers = map[chan string]struct{}{}
	}
	s.subscribers[ch] = struct{}{}
	initial := s.taskQueueSnapshotJSONLocked()
	s.mu.Unlock()
	ch <- initial
	go func() {
		<-ctx.Done()
		s.mu.Lock()
		delete(s.subscribers, ch)
		s.mu.Unlock()
		close(ch)
	}()
	return ch
}

func (s *ImageTaskService) notifySubscribersLocked() {
	if len(s.subscribers) == 0 {
		return
	}
	payload := s.taskQueueSnapshotJSONLocked()
	for ch := range s.subscribers {
		select {
		case ch <- payload:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- payload:
			default:
			}
		}
	}
}

func (s *ImageTaskService) taskQueueSnapshotJSONLocked() string {
	items := make([]map[string]any, 0, len(s.tasks))
	for _, task := range s.tasks {
		items = append(items, publicTaskSummary(task))
	}
	// map 遍历无序；显式按创建时间新→旧
	sortTasksNewestFirst(items)
	data, err := json.Marshal(ImageTaskQueueSnapshotPublic{
		Items: ImageTaskPublicListFromMaps(items), Total: len(items), UpdatedAt: util.NowLocal(),
		PersistenceError: s.persistenceError,
	})
	if err != nil {
		return `{"items":[],"total":0}`
	}
	return string(data)
}

// AdminCancelTasks cancels multiple tasks by id.
func (s *ImageTaskService) AdminCancelTasks(ids []string) map[string]any {
	cancelled := 0
	errors := make([]map[string]string, 0)
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, err := s.AdminCancelTask(id); err != nil {
			errors = append(errors, map[string]string{"id": id, "error": err.Error()})
			continue
		}
		cancelled++
	}
	return map[string]any{"cancelled": cancelled, "errors": errors}
}

// AdminClearTasks removes terminal tasks from the in-memory/persisted queue.
// scope:
//   - "finished" (default): success + error + cancelled
//   - "failed": error only
//   - "success": success only
//   - "cancelled": cancelled only
//
// Running/queued tasks are never removed (use cancel first).
func (s *ImageTaskService) AdminClearTasks(scope string) (map[string]any, error) {
	scope = strings.ToLower(strings.TrimSpace(scope))
	if scope == "" || scope == "all" || scope == "done" {
		scope = "finished"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.storeReady {
		return nil, fmt.Errorf("创作任务或统计账本数据未成功加载，已拒绝清理")
	}
	removed := 0
	byStatus := map[string]int{}
	for key, task := range s.tasks {
		status := util.Clean(task.Status)
		if isActiveTaskStatus(status) {
			continue
		}
		match := false
		switch scope {
		case "finished":
			match = status == TaskStatusSuccess || status == TaskStatusError || status == TaskStatusCancelled
		case "failed", "error":
			match = status == TaskStatusError
		case "success":
			match = status == TaskStatusSuccess
		case "cancelled":
			match = status == TaskStatusCancelled
		default:
			match = status == TaskStatusSuccess || status == TaskStatusError || status == TaskStatusCancelled
		}
		if !match {
			continue
		}
		delete(s.tasks, key)
		delete(s.cancels, key)
		s.markTaskRemovedLocked(key)
		removed++
		byStatus[status]++
	}
	if removed > 0 {
		if err := s.saveLocked(); err != nil {
			return nil, &ImageTaskPersistenceError{Operation: "任务已从内存队列清理，但持久化", Err: err}
		}
		s.notifySubscribersLocked()
	}
	return map[string]any{
		"removed":   removed,
		"remaining": len(s.tasks),
		"scope":     scope,
		"by_status": byStatus,
	}, nil
}

// TouchNotify forces a queue SSE broadcast (e.g. after external pool ops).
func (s *ImageTaskService) TouchNotify() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notifySubscribersLocked()
}
