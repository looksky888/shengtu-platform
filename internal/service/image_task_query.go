package service

import (
	"chatgpt2api/internal/util"
	"log"
	"strings"
)

func (s *ImageTaskService) ListTasks(identity Identity, taskIDs []string) map[string]any {
	owner := ownerID(identity)
	requested := make([]string, 0, len(taskIDs))
	for _, id := range taskIDs {
		if id = strings.TrimSpace(id); id != "" {
			requested = append(requested, id)
		}
	}
	s.mu.Lock()
	if s.cleanupLocked() {
		if err := s.saveLocked(); err != nil {
			log.Printf("image task list cleanup persistence failed: %v", err)
		}
	}
	items := make([]map[string]any, 0)
	missing := make([]string, 0)
	if len(requested) == 0 {
		for _, task := range s.tasks {
			if task.OwnerID == owner {
				items = append(items, publicTask(task))
			}
		}
		sortTasksNewestFirst(items)
	} else {
		for _, id := range requested {
			task := s.tasks[taskKey(owner, id)]
			if task == nil {
				missing = append(missing, id)
			} else {
				items = append(items, publicTask(task))
			}
		}
	}
	s.mu.Unlock()
	return map[string]any{"items": items, "missing_ids": missing}
}

func (s *ImageTaskService) ListRecentTasks(identity Identity, limit int, status string) map[string]any {
	owner := ownerID(identity)
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	status = strings.TrimSpace(status)
	s.mu.Lock()
	if s.cleanupLocked() {
		if err := s.saveLocked(); err != nil {
			log.Printf("image task recent-list cleanup persistence failed: %v", err)
		}
	}
	active := make([]map[string]any, 0)
	recent := make([]map[string]any, 0, limit)
	for _, task := range s.tasks {
		if task.OwnerID != owner {
			continue
		}
		taskStatus := util.Clean(task.Status)
		if status != "" && status != "all" && status != taskStatus {
			if status != "active" || !isActiveTaskStatus(taskStatus) {
				continue
			}
		}
		item := publicTaskSummary(task)
		if isActiveTaskStatus(taskStatus) {
			active = append(active, item)
		} else {
			recent = append(recent, item)
		}
	}
	s.mu.Unlock()
	sortTasksNewestFirst(active)
	sortTasksNewestFirst(recent)
	items := make([]map[string]any, 0, len(active)+limit)
	items = append(items, active...)
	if len(recent) > limit {
		recent = recent[:limit]
	}
	items = append(items, recent...)
	return map[string]any{"items": items, "missing_ids": []string{}, "limited": true}
}

// VideoAssetSeeds returns completed video task ownership for one-time media-index backfill.
// The video asset index remains authoritative after this migration.
func (s *ImageTaskService) VideoAssetSeeds() []VideoAsset {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]VideoAsset, 0)
	for _, task := range s.tasks {
		if task == nil || util.Clean(task.Mode) != "video" || util.Clean(task.Status) != TaskStatusSuccess {
			continue
		}
		items = append(items, VideoAsset{
			TaskID: task.ID, OwnerID: task.OwnerID, OwnerName: task.OwnerName,
			Model: task.Model, Size: task.Size, CreatedAt: task.CreatedAt,
		})
	}
	return items
}

// TerminalVideoTasksSince returns snapshots used to repair the narrow gap
// between terminal task persistence and webhook enqueue after a process crash.
func (s *ImageTaskService) TerminalVideoTasksSince(startedAt string) []*ImageTask {
	cutoff := parseTaskTime(startedAt)
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]*ImageTask, 0)
	for _, task := range s.tasks {
		if task == nil || task.Mode != "video" || !isTerminalTaskStatus(task.Status) {
			continue
		}
		finished := parseTaskTime(firstNonEmpty(task.FinishedAt, task.UpdatedAt))
		if !cutoff.IsZero() && finished.Before(cutoff) {
			continue
		}
		copy := *task
		copy.Data = append([]map[string]any(nil), task.Data...)
		copy.Events = append([]map[string]any(nil), task.Events...)
		items = append(items, &copy)
	}
	return items
}

func (s *ImageTaskService) ListTaskLogs(filters map[string]string) map[string]any {
	s.mu.Lock()
	if s.cleanupLocked() {
		if err := s.saveLocked(); err != nil {
			log.Printf("image task log cleanup persistence failed: %v", err)
		}
	}
	summary := strings.EqualFold(strings.TrimSpace(filters["summary"]), "true") || strings.TrimSpace(filters["summary"]) == "1"
	items := make([]map[string]any, 0, len(s.tasks))
	for _, task := range s.tasks {
		if !matchTaskLogFilter(task, filters) {
			continue
		}
		if summary {
			items = append(items, publicTaskSummary(task))
		} else {
			items = append(items, publicTask(task))
		}
	}
	s.mu.Unlock()
	// 创建时间新→旧；分页第 1 页始终是最新任务
	sortTasksNewestFirst(items)
	total := len(items)
	limit := util.ToInt(filters["limit"], 200)
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	offset := util.ToInt(filters["offset"], 0)
	if offset < 0 {
		offset = 0
	}
	if offset >= len(items) {
		items = []map[string]any{}
	} else {
		items = items[offset:]
		if len(items) > limit {
			items = items[:limit]
		}
	}
	return map[string]any{"items": items, "total": total}
}

func matchTaskLogFilter(task *ImageTask, filters map[string]string) bool {
	if task == nil {
		return false
	}
	if value := strings.TrimSpace(filters["status"]); value != "" && value != "all" && util.Clean(task.Status) != value {
		return false
	}
	if value := strings.TrimSpace(filters["model"]); value != "" && !strings.Contains(strings.ToLower(util.Clean(task.Model)), strings.ToLower(value)) {
		return false
	}
	if value := strings.TrimSpace(filters["size"]); value != "" && !strings.Contains(strings.ToLower(util.Clean(task.Size)), strings.ToLower(value)) {
		return false
	}
	if value := strings.TrimSpace(filters["user"]); value != "" {
		needle := strings.ToLower(value)
		haystack := strings.ToLower(strings.Join([]string{util.Clean(task.OwnerID), util.Clean(task.OwnerName)}, " "))
		if !strings.Contains(haystack, needle) {
			return false
		}
	}
	if value := strings.TrimSpace(filters["q"]); value != "" {
		needle := strings.ToLower(value)
		haystack := strings.ToLower(strings.Join([]string{util.Clean(task.ID), util.Clean(task.OwnerID), util.Clean(task.OwnerName), util.Clean(task.Model), util.Clean(task.Size), util.Clean(task.Status), util.Clean(task.Error), util.Clean(task.ErrorCode), util.Clean(task.UpstreamRequestID)}, " "))
		if !strings.Contains(haystack, needle) {
			return false
		}
	}
	return true
}
