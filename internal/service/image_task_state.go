package service

import (
	"chatgpt2api/internal/util"
	"log"
	"time"
)

func (s *ImageTaskService) bumpTaskProgress(key string, progress int, stage, message string, logCount int, extra map[string]any) {
	updates := map[string]any{
		"progress": progress, "progress_stage": stage, "progress_message": message,
	}
	if logCount > 0 {
		updates["log_count"] = logCount
	}
	for k, v := range extra {
		updates[k] = v
	}
	s.updateActiveTask(key, updates)
}

func (s *ImageTaskService) transitionTaskStage(key, stage string) {
	if stage == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil || !isActiveTaskStatus(util.Clean(task.Status)) {
		return
	}
	task.transitionStage(time.Now(), stage)
}

func (s *ImageTaskService) finishActiveTask(key string, updates map[string]any) {
	now := util.NowLocal()
	var observer func(*ImageTask)
	var snapshot *ImageTask
	s.mu.Lock()
	task := s.tasks[key]
	if task == nil || !isActiveTaskStatus(util.Clean(task.Status)) {
		s.mu.Unlock()
		return
	}
	task.finishStage(time.Now())
	task.applyUpdates(updates)
	task.FinishedAt = now
	task.DurationSeconds = taskDurationSeconds(task, now)
	task.durationSecondsSet = true
	task.UpdatedAt = now
	// terminal event
	events := append([]map[string]any(nil), task.Events...)
	events = append(events, map[string]any{
		"time":    now,
		"stage":   util.Clean(task.ProgressStage),
		"message": util.Clean(task.ProgressMessage),
		"status":  util.Clean(task.Status),
	})
	if len(events) > maxTaskEvents {
		events = events[len(events)-maxTaskEvents:]
	}
	task.Events = events
	task.LogCount = len(events)
	task.logCountSet = true
	// Count into durable stats ledger before any later AdminClearTasks can delete the task row.
	s.recordTerminalStatsLocked(task)
	s.markTaskDirtyLocked(key)
	if err := s.flushSaveLocked(); err != nil {
		log.Printf("image task terminal persistence failed: %v", err)
	}
	s.notifySubscribersLocked()
	observer = s.terminalObserver
	if observer != nil {
		copy := *task
		copy.Data = append([]map[string]any(nil), task.Data...)
		copy.Events = append([]map[string]any(nil), task.Events...)
		snapshot = &copy
	}
	s.mu.Unlock()
	if observer != nil && snapshot != nil {
		observer(snapshot)
	}
}

func taskDurationSeconds(task *ImageTask, finishedAt string) float64 {
	if task == nil {
		return 0
	}
	startText := firstNonEmpty(util.Clean(task.StartedAt), util.Clean(task.CreatedAt))
	if startText == "" || finishedAt == "" {
		return 0
	}
	start, err1 := parseTaskTimestamp(startText)
	end, err2 := parseTaskTimestamp(finishedAt)
	if err1 != nil || err2 != nil || end.Before(start) {
		return 0
	}
	return float64(int(end.Sub(start).Seconds()*10)) / 10
}

func parseTaskTimestamp(value string) (time.Time, error) {
	layouts := []string{
		"2006-01-02 15:04:05",
		time.RFC3339Nano,
		time.RFC3339,
	}
	var lastErr error
	for _, layout := range layouts {
		parsed, err := time.ParseInLocation(layout, value, imageTaskStatsLocation())
		if err == nil {
			return parsed, nil
		}
		lastErr = err
	}
	return time.Time{}, lastErr
}
