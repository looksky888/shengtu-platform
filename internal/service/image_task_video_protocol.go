package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

// VideoTaskPage is the stable cursor page used by the public video protocol.
// The page contains only video tasks owned by the current API identity.
type VideoTaskPage struct {
	Items      []ImageTaskPublic
	Total      int
	HasMore    bool
	NextCursor string
}

type videoTaskCursor struct {
	CreatedAt string `json:"created_at"`
	ID        string `json:"id"`
}

// ListVideoTasksPage returns newest-first video tasks. Cursor values are opaque
// base64 JSON and are tied to the created_at/id ordering, so clients can safely
// resume a page after refresh without relying on numeric offsets.
func (s *ImageTaskService) ListVideoTasksPage(identity Identity, limit int, cursor, status string) (VideoTaskPage, error) {
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	var after videoTaskCursor
	if strings.TrimSpace(cursor) != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(cursor))
		if err != nil {
			return VideoTaskPage{}, fmt.Errorf("视频分页游标无效")
		}
		if err := json.Unmarshal(decoded, &after); err != nil || after.ID == "" {
			return VideoTaskPage{}, fmt.Errorf("视频分页游标无效")
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cleanupLocked() {
		if err := s.saveLocked(); err != nil {
			return VideoTaskPage{}, &ImageTaskPersistenceError{Operation: "视频列表清理持久化", Err: err}
		}
	}
	tasks := make([]*ImageTask, 0)
	for _, task := range s.tasks {
		if task == nil || task.Mode != "video" {
			continue
		}
		if task.OwnerID != ownerID(identity) {
			continue
		}
		if status != "" && task.Status != status {
			continue
		}
		tasks = append(tasks, task)
	}
	sortImageTasksNewestFirst(tasks)
	total := len(tasks)
	start := 0
	if after.ID != "" {
		found := false
		for index, task := range tasks {
			if task.CreatedAt == after.CreatedAt && task.ID == after.ID {
				start = index + 1
				found = true
				break
			}
		}
		if !found {
			return VideoTaskPage{}, fmt.Errorf("视频分页游标已失效")
		}
	}
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}
	items := make([]ImageTaskPublic, 0, end-start)
	for _, task := range tasks[start:end] {
		items = append(items, ImageTaskPublicFromMap(publicTask(task)))
	}
	page := VideoTaskPage{Items: items, Total: total, HasMore: end < total}
	if page.HasMore {
		last := tasks[end-1]
		encoded, err := json.Marshal(videoTaskCursor{CreatedAt: last.CreatedAt, ID: last.ID})
		if err != nil {
			return VideoTaskPage{}, fmt.Errorf("生成视频分页游标失败: %w", err)
		}
		page.NextCursor = base64.RawURLEncoding.EncodeToString(encoded)
	}
	return page, nil
}

// FindOwnedVideoTask returns a video task only when it belongs to the caller.
// Administrator cross-user inspection stays on the dedicated admin task API.
func (s *ImageTaskService) FindOwnedVideoTask(identity Identity, id string) (ImageTaskPublic, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return ImageTaskPublic{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cleanupLocked() {
		if err := s.saveLocked(); err != nil {
			return ImageTaskPublic{}, false
		}
	}
	task := s.tasks[taskKey(ownerID(identity), id)]
	if task == nil || task.Mode != "video" {
		return ImageTaskPublic{}, false
	}
	return ImageTaskPublicFromMap(publicTask(task)), true
}
