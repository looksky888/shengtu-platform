package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"encoding/json"
	"log"
	"strings"
	"time"
)

const (
	imageTasksIndexDoc       = "image_tasks/index.json"
	imageTasksShardVer       = 3
	imageTaskSaveMinInterval = time.Second
)

// loadLocked returns tasks and whether the load is trustworthy.
// Missing data → empty map + ready. I/O or parse errors → empty map + not ready.
func (s *ImageTaskService) loadLocked() (map[string]*ImageTask, bool) {
	if s.store != nil {
		return s.loadShardedLocked()
	}
	return s.loadMonolithicLocked()
}

func (s *ImageTaskService) loadMonolithicLocked() (map[string]*ImageTask, bool) {
	raw, err := loadStoredJSONWithError(s.store, s.docName, s.path)
	if err != nil {
		log.Printf("image task load failed (writes disabled): %v", err)
		return map[string]*ImageTask{}, false
	}
	return parseTasksDocument(raw), true
}

func (s *ImageTaskService) loadShardedLocked() (map[string]*ImageTask, bool) {
	// Prefer sharded index when present.
	idxRaw, err := s.store.LoadJSONDocument(imageTasksIndexDoc)
	if err != nil {
		log.Printf("image task index load failed (writes disabled): %v", err)
		return map[string]*ImageTask{}, false
	}
	if idxRaw != nil {
		entries, ok := parseTaskIndex(idxRaw)
		if !ok {
			log.Printf("image task index corrupt (writes disabled)")
			return map[string]*ImageTask{}, false
		}
		tasks := map[string]*ImageTask{}
		for _, e := range entries {
			name := taskEntryDocName(e.OwnerID, e.ID)
			raw, loadErr := s.store.LoadJSONDocument(name)
			if loadErr != nil {
				log.Printf("image task entry load failed %s: %v (writes disabled)", name, loadErr)
				return map[string]*ImageTask{}, false
			}
			legacyName := ""
			if raw == nil {
				legacyName = legacyTaskEntryDocName(e.OwnerID, e.ID)
				raw, loadErr = s.store.LoadJSONDocument(legacyName)
				if loadErr != nil {
					log.Printf("image task legacy entry load failed %s: %v (writes disabled)", legacyName, loadErr)
					return map[string]*ImageTask{}, false
				}
				if raw == nil {
					continue
				}
			}
			taskMap, _ := raw.(map[string]any)
			task := imageTaskFromMap(taskMap)
			if task == nil || task.OwnerID != e.OwnerID || task.ID != e.ID {
				continue
			}
			if legacyName != "" {
				if saveErr := s.store.SaveJSONDocument(name, task.toMap()); saveErr != nil {
					log.Printf("image task legacy entry migrate failed %s: %v (writes disabled)", name, saveErr)
					return map[string]*ImageTask{}, false
				}
			}
			if legacyName != "" && legacyName != name {
				_ = s.store.DeleteJSONDocument(legacyName)
			}
			tasks[taskKey(task.OwnerID, task.ID)] = task
		}
		return tasks, true
	}

	// Legacy monolithic document → migrate once into shards.
	legacy, err := s.store.LoadJSONDocument(s.docName)
	if err != nil {
		log.Printf("image task legacy load failed (writes disabled): %v", err)
		return map[string]*ImageTask{}, false
	}
	tasks := parseTasksDocument(legacy)
	if len(tasks) == 0 {
		return tasks, true
	}
	// Persist shards; refuse ready=false if migration fails so we do not drop legacy.
	if err := s.migrateMonolithicToShardedLocked(tasks); err != nil {
		log.Printf("image task migrate to shards failed (writes disabled): %v", err)
		return map[string]*ImageTask{}, false
	}
	return tasks, true
}

func parseTasksDocument(raw any) map[string]*ImageTask {
	if obj, ok := raw.(map[string]any); ok {
		raw = obj["tasks"]
	}
	tasks := map[string]*ImageTask{}
	for _, item := range anyList(raw) {
		taskMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		task := imageTaskFromMap(taskMap)
		if task == nil {
			continue
		}
		tasks[taskKey(task.OwnerID, task.ID)] = task
	}
	return tasks
}

type taskIndexEntry struct {
	OwnerID string `json:"owner_id"`
	ID      string `json:"id"`
}

func parseTaskIndex(raw any) ([]taskIndexEntry, bool) {
	root, ok := raw.(map[string]any)
	if !ok || root == nil {
		return nil, false
	}
	var out []taskIndexEntry
	for _, item := range anyList(root["entries"]) {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		owner := util.Clean(m["owner_id"])
		id := util.Clean(m["id"])
		if owner == "" || id == "" {
			continue
		}
		out = append(out, taskIndexEntry{OwnerID: owner, ID: id})
	}
	return out, true
}

func (s *ImageTaskService) migrateMonolithicToShardedLocked(tasks map[string]*ImageTask) error {
	for _, task := range tasks {
		if task == nil {
			continue
		}
		if err := s.store.SaveJSONDocument(taskEntryDocName(task.OwnerID, task.ID), task.toMap()); err != nil {
			return err
		}
	}
	if err := s.writeTaskIndexLocked(tasks); err != nil {
		return err
	}
	// Keep legacy document as empty marker so reloads use index.
	return s.store.SaveJSONDocument(s.docName, map[string]any{
		"tasks":              []any{},
		"migrated_to_shards": true,
		"version":            imageTasksShardVer,
	})
}

func (s *ImageTaskService) writeTaskIndexLocked(tasks map[string]*ImageTask) error {
	entries := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		if task == nil {
			continue
		}
		entries = append(entries, map[string]any{
			"owner_id": task.OwnerID,
			"id":       task.ID,
		})
	}
	return s.store.SaveJSONDocument(imageTasksIndexDoc, map[string]any{
		"version": imageTasksShardVer,
		"entries": entries,
	})
}

func (s *ImageTaskService) markTaskDirtyLocked(key string) {
	if s.dirtyKeys == nil {
		s.dirtyKeys = map[string]struct{}{}
	}
	if key != "" {
		s.dirtyKeys[key] = struct{}{}
	}
	s.dirty = true
}

func (s *ImageTaskService) markTaskRemovedLocked(key string) {
	if s.removedKeys == nil {
		s.removedKeys = map[string]struct{}{}
	}
	if key != "" {
		s.removedKeys[key] = struct{}{}
		if s.dirtyKeys != nil {
			delete(s.dirtyKeys, key)
		}
	}
	s.indexDirty = true
	s.dirty = true
}

func (s *ImageTaskService) markAllTasksDirtyLocked() {
	if s.dirtyKeys == nil {
		s.dirtyKeys = map[string]struct{}{}
	}
	for key := range s.tasks {
		s.dirtyKeys[key] = struct{}{}
	}
	s.indexDirty = true
	s.dirty = true
}

func (s *ImageTaskService) saveMonolithicLocked() error {
	items := make([]*ImageTask, 0, len(s.tasks))
	for _, task := range s.tasks {
		items = append(items, task)
	}
	sortImageTasksNewestFirst(items)
	value := map[string]any{"tasks": items}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(s.path, append(data, '\n'), 0o644)
}

func (s *ImageTaskService) saveShardedLocked() error {
	// If nothing tracked dirty (e.g. first save after recover with only index rewrite),
	// fall back to writing all current tasks when index is dirty.
	if len(s.dirtyKeys) == 0 && len(s.removedKeys) == 0 && s.indexDirty {
		// index-only rewrite
		return s.writeTaskIndexLocked(s.tasks)
	}
	if len(s.dirtyKeys) == 0 && len(s.removedKeys) == 0 && !s.indexDirty {
		// Full safety rewrite when save called without dirty marks (Close / tests).
		for key := range s.tasks {
			s.markTaskDirtyLocked(key)
		}
		s.indexDirty = true
	}

	for key := range s.dirtyKeys {
		task := s.tasks[key]
		if task == nil {
			continue
		}
		if err := s.store.SaveJSONDocument(taskEntryDocName(task.OwnerID, task.ID), task.toMap()); err != nil {
			return err
		}
	}
	for key := range s.removedKeys {
		owner, id := splitTaskKey(key)
		if owner == "" || id == "" {
			continue
		}
		if err := s.store.DeleteJSONDocument(taskEntryDocName(owner, id)); err != nil {
			return err
		}
	}
	// Index only when membership changes (create/delete/migrate), not on progress ticks.
	if s.indexDirty {
		if err := s.writeTaskIndexLocked(s.tasks); err != nil {
			return err
		}
	}
	return nil
}

func splitTaskKey(key string) (owner, id string) {
	i := strings.LastIndex(key, ":")
	if i <= 0 || i >= len(key)-1 {
		return "", key
	}
	return key[:i], key[i+1:]
}

// StoreReady reports whether task state was loaded successfully from storage.
func (s *ImageTaskService) StoreReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.storeReady
}

// scheduleSaveLocked coalesces high-frequency progress writes (caller holds s.mu).
// Optional keys mark which task rows are dirty (sharded backends write only those).
func (s *ImageTaskService) scheduleSaveLocked(keys ...string) {
	for _, key := range keys {
		s.markTaskDirtyLocked(key)
	}
	if len(keys) == 0 {
		s.dirty = true
	}
	if time.Since(s.lastSaveAt) >= imageTaskSaveMinInterval {
		if err := s.saveLocked(); err != nil {
			log.Printf("image task coalesced save failed: %v", err)
		}
		return
	}
	if s.saveTimer != nil {
		return
	}
	delay := imageTaskSaveMinInterval - time.Since(s.lastSaveAt)
	if delay < 50*time.Millisecond {
		delay = 50 * time.Millisecond
	}
	s.saveTimer = time.AfterFunc(delay, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.saveTimer = nil
		if s.dirty {
			if err := s.saveLocked(); err != nil {
				log.Printf("image task coalesced retry failed: %v", err)
			}
		}
	})
}

// flushSaveLocked forces a pending dirty write (e.g. before cancel/finish).
func (s *ImageTaskService) flushSaveLocked() error {
	if s.saveTimer != nil {
		s.saveTimer.Stop()
		s.saveTimer = nil
	}
	if s.dirty {
		return s.saveLocked()
	}
	return nil
}

// recoverUnfinishedLocked marks in-flight tasks as error after process restart.
// It writes the same terminal fields finishActiveTask would, so a recovered task
// never reports a running progress percentage or a missing finish time.
// Returns the interrupted tasks so callers can refund open image charges.
func (s *ImageTaskService) recoverUnfinishedLocked() []*ImageTask {
	var interrupted []*ImageTask
	now := util.NowLocal()
	for key, task := range s.tasks {
		if task.Status == TaskStatusQueued || task.Status == TaskStatusRunning {
			task.finishStage(time.Now())
			task.Status = TaskStatusError
			task.Error = "服务已重启，未完成的任务已中断"
			task.Progress = 100
			task.progressSet = true
			task.ProgressStage = "失败"
			task.ProgressMessage = task.Error
			task.FinishedAt = now
			task.DurationSeconds = taskDurationSeconds(task, now)
			task.durationSecondsSet = true
			events := append([]map[string]any(nil), task.Events...)
			events = append(events, map[string]any{
				"time":    now,
				"stage":   task.ProgressStage,
				"message": task.ProgressMessage,
				"status":  task.Status,
			})
			if len(events) > maxTaskEvents {
				events = events[len(events)-maxTaskEvents:]
			}
			task.Events = events
			task.LogCount = len(events)
			task.logCountSet = true
			task.UpdatedAt = now
			s.markTaskDirtyLocked(key)
			interrupted = append(interrupted, task)
		}
	}
	return interrupted
}

func (s *ImageTaskService) cleanupLocked() bool {
	days := 30
	if s.retentionGetter != nil {
		days = s.retentionGetter()
	}
	if days < 1 {
		days = 1
	}
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	removed := false
	for key, task := range s.tasks {
		status := task.Status
		if status != TaskStatusSuccess && status != TaskStatusError && status != TaskStatusCancelled {
			continue
		}
		if parseTaskTime(task.UpdatedAt).Before(cutoff) {
			delete(s.tasks, key)
			s.markTaskRemovedLocked(key)
			removed = true
		}
	}
	return removed
}
