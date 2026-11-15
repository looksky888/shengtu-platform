package service

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const imageTaskStatsLedgerDocName = "image_task_stats_ledger.json"

const (
	imageTaskStatsSaveDelay  = time.Second
	imageTaskStatsRetryDelay = 5 * time.Second
)

// imageTaskStatsDayBucket is one China calendar day of aggregated image-task stats.
// Independent from the task list so AdminClearTasks cannot erase historical counts.
type imageTaskStatsDayBucket struct {
	Date              string `json:"date"`
	SuccessTasks      int    `json:"success_tasks"`
	FailedTasks       int    `json:"failed_tasks"`
	SuccessImages     int    `json:"success_images"`
	FailedImages      int    `json:"failed_images"`
	SuccessVideoTasks int    `json:"success_video_tasks,omitempty"`
	FailedVideoTasks  int    `json:"failed_video_tasks,omitempty"`
	SuccessVideos     int    `json:"success_videos,omitempty"`
	FailedVideos      int    `json:"failed_videos,omitempty"`
}

// ClassifyTaskCapability classifies a creation task mode into "image", "video", or "" (e.g. "chat").
func ClassifyTaskCapability(mode string) string {
	switch strings.ToLower(util.Clean(mode)) {
	case "chat":
		return ""
	case "video":
		return "video"
	default:
		return "image"
	}
}

// imageTaskStatsLedger is the durable stats book.
// Recorded maps taskKey(owner,id) -> true so each terminal task is counted once.
type imageTaskStatsLedger struct {
	Days     map[string]*imageTaskStatsDayBucket `json:"days"`
	Recorded map[string]bool                     `json:"recorded"`
}

func emptyImageTaskStatsLedger() *imageTaskStatsLedger {
	return &imageTaskStatsLedger{
		Days:     map[string]*imageTaskStatsDayBucket{},
		Recorded: map[string]bool{},
	}
}

func (s *ImageTaskService) statsLedgerPath() string {
	if s.path == "" {
		return imageTaskStatsLedgerDocName
	}
	return filepath.Join(filepath.Dir(s.path), imageTaskStatsLedgerDocName)
}

func (s *ImageTaskService) loadStatsLedgerLocked() (*imageTaskStatsLedger, bool) {
	path := s.statsLedgerPath()
	raw, err := loadStoredJSONWithError(s.store, imageTaskStatsLedgerDocName, path)
	if err != nil {
		log.Printf("image task stats ledger load failed (writes disabled): %v", err)
		return nil, false
	}
	ledger := emptyImageTaskStatsLedger()
	if raw == nil {
		return ledger, true
	}
	root := util.StringMap(raw)
	if root == nil {
		log.Printf("image task stats ledger corrupt (writes disabled)")
		return nil, false
	}
	for key, value := range util.StringMap(root["days"]) {
		item := util.StringMap(value)
		date := firstNonEmpty(util.Clean(item["date"]), util.Clean(key))
		if date == "" {
			continue
		}
		ledger.Days[date] = &imageTaskStatsDayBucket{
			Date:              date,
			SuccessTasks:      util.ToInt(item["success_tasks"], 0),
			FailedTasks:       util.ToInt(item["failed_tasks"], 0),
			SuccessImages:     util.ToInt(item["success_images"], 0),
			FailedImages:      util.ToInt(item["failed_images"], 0),
			SuccessVideoTasks: util.ToInt(item["success_video_tasks"], 0),
			FailedVideoTasks:  util.ToInt(item["failed_video_tasks"], 0),
			SuccessVideos:     util.ToInt(item["success_videos"], 0),
			FailedVideos:      util.ToInt(item["failed_videos"], 0),
		}
	}
	// Also accept days as array of objects.
	for _, item := range util.AsMapSlice(root["days"]) {
		date := util.Clean(item["date"])
		if date == "" {
			continue
		}
		ledger.Days[date] = &imageTaskStatsDayBucket{
			Date:              date,
			SuccessTasks:      util.ToInt(item["success_tasks"], 0),
			FailedTasks:       util.ToInt(item["failed_tasks"], 0),
			SuccessImages:     util.ToInt(item["success_images"], 0),
			FailedImages:      util.ToInt(item["failed_images"], 0),
			SuccessVideoTasks: util.ToInt(item["success_video_tasks"], 0),
			FailedVideoTasks:  util.ToInt(item["failed_video_tasks"], 0),
			SuccessVideos:     util.ToInt(item["success_videos"], 0),
			FailedVideos:      util.ToInt(item["failed_videos"], 0),
		}
	}
	for key, value := range util.StringMap(root["recorded"]) {
		if util.ToBool(value) {
			ledger.Recorded[key] = true
		}
	}
	for _, key := range util.AsStringSlice(root["recorded_keys"]) {
		if key = util.Clean(key); key != "" {
			ledger.Recorded[key] = true
		}
	}
	return ledger, true
}

func (s *ImageTaskService) saveStatsLedgerLocked() error {
	if s.statsLedgerSaveTimer != nil {
		s.statsLedgerSaveTimer.Stop()
		s.statsLedgerSaveTimer = nil
	}
	if s.statsLedger == nil {
		s.statsLedger = emptyImageTaskStatsLedger()
	}
	daysOut := make(map[string]any, len(s.statsLedger.Days))
	for date, bucket := range s.statsLedger.Days {
		if bucket == nil {
			continue
		}
		daysOut[date] = map[string]any{
			"date":                bucket.Date,
			"success_tasks":       bucket.SuccessTasks,
			"failed_tasks":        bucket.FailedTasks,
			"success_images":      bucket.SuccessImages,
			"failed_images":       bucket.FailedImages,
			"success_video_tasks": bucket.SuccessVideoTasks,
			"failed_video_tasks":  bucket.FailedVideoTasks,
			"success_videos":      bucket.SuccessVideos,
			"failed_videos":       bucket.FailedVideos,
		}
	}
	value := map[string]any{
		"days":     daysOut,
		"recorded": s.statsLedger.Recorded,
	}
	path := s.statsLedgerPath()
	if s.store != nil {
		if err := s.store.SaveJSONDocument(imageTaskStatsLedgerDocName, value); err != nil {
			s.statsLedgerDirty = true
			return err
		}
		s.statsLedgerDirty = false
		return nil
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := storage.AtomicWriteFile(path, append(data, '\n'), 0o644); err != nil {
		s.statsLedgerDirty = true
		return err
	}
	s.statsLedgerDirty = false
	return nil
}

// markStatsLedgerDirtyLocked coalesces terminal events into one durable write.
// Caller must hold s.mu.
func (s *ImageTaskService) markStatsLedgerDirtyLocked() {
	s.statsLedgerDirty = true
	s.scheduleStatsLedgerSaveLocked(imageTaskStatsSaveDelay)
}

func (s *ImageTaskService) scheduleStatsLedgerSaveLocked(delay time.Duration) {
	if s.closing || !s.statsLedgerDirty || s.statsLedgerSaveTimer != nil {
		return
	}
	s.statsLedgerSaveTimer = time.AfterFunc(delay, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.statsLedgerSaveTimer = nil
		if s.closing {
			return
		}
		hadPersistenceError := s.persistenceError != ""
		if err := s.flushStatsLedgerSaveLocked(); err != nil {
			log.Printf("image task scheduled stats retry failed: %v", err)
		} else if hadPersistenceError {
			s.notifySubscribersLocked()
		}
	})
}

func (s *ImageTaskService) flushStatsLedgerSaveLocked() error {
	if s.statsLedgerSaveTimer != nil {
		s.statsLedgerSaveTimer.Stop()
		s.statsLedgerSaveTimer = nil
	}
	if !s.statsLedgerDirty {
		return nil
	}
	if err := s.saveStatsLedgerLocked(); err != nil {
		log.Printf("image task stats ledger save failed: %v", err)
		s.persistenceError = err.Error()
		s.scheduleStatsLedgerSaveLocked(imageTaskStatsRetryDelay)
		return err
	}
	if !s.dirty {
		s.persistenceError = ""
	}
	return nil
}

// pruneStatsLedgerRecordedLocked keeps idempotency keys only for retained task rows.
// Day buckets remain untouched, so clearing the task queue cannot erase statistics.
func (s *ImageTaskService) pruneStatsLedgerRecordedLocked() int {
	if s.statsLedger == nil || len(s.statsLedger.Recorded) == 0 {
		return 0
	}
	removed := 0
	for key := range s.statsLedger.Recorded {
		if s.tasks[key] != nil {
			continue
		}
		delete(s.statsLedger.Recorded, key)
		removed++
	}
	if removed > 0 {
		s.markStatsLedgerDirtyLocked()
	}
	return removed
}

// ExternalImageOutcome describes one completed synchronous protocol image call
// (such as /v1/images/generations, /v1/images/edits, /v1/chat/completions, or
// /v1/responses image_generation) so custom relay and protocol requests count
// into the daily stats ledger consistently with /api/creation-tasks.
type ExternalImageOutcome struct {
	RecordKey      string
	Mode           string
	Status         string
	RequestedCount int
	SuccessImages  int
	FinishedAt     time.Time
}

// RecordExternalImageOutcome appends one completed synchronous image call into
// the durable stats ledger in a thread-safe way. If RecordKey is provided, it
// is deduplicated in Recorded (capped against unbounded growth); empty RecordKey
// records once directly without retaining an ephemeral UUID key in Recorded.
func (s *ImageTaskService) RecordExternalImageOutcome(outcome ExternalImageOutcome) bool {
	if s == nil {
		return false
	}
	if ClassifyTaskCapability(outcome.Mode) != "image" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.statsLedger == nil {
		return false
	}
	key := util.Clean(outcome.RecordKey)
	when := outcome.FinishedAt
	if when.IsZero() {
		when = time.Now()
	}
	if !s.recordStatsOutcomeLocked(key, key != "", outcome.Mode, outcome.Status, outcome.RequestedCount, outcome.SuccessImages, when, true) {
		return false
	}
	s.notifySubscribersLocked()
	return true
}

// recordTerminalStatsLocked appends one terminal task into the durable ledger (idempotent).
// Caller must hold s.mu.
func (s *ImageTaskService) recordTerminalStatsLocked(task *ImageTask) {
	s.recordTerminalStatsWithPruneLocked(task, true)
}

func (s *ImageTaskService) recordTerminalStatsWithPruneLocked(task *ImageTask, allowPrune bool) {
	if task == nil || s.statsLedger == nil {
		return
	}
	key := taskKey(task.OwnerID, task.ID)
	if key == ":" || strings.Trim(key, ":") == "" {
		key = firstNonEmpty(util.Clean(task.ID), util.NewUUID())
	}
	loc := imageTaskStatsLocation()
	when := parseTaskTimeInLocation(firstNonEmpty(util.Clean(task.FinishedAt), util.Clean(task.UpdatedAt), util.Clean(task.CreatedAt)), loc)
	if when.IsZero() {
		when = time.Now().In(loc)
	}
	s.recordStatsOutcomeLocked(key, true, task.Mode, task.Status, task.Count, len(task.Data), when, allowPrune)
}

func (s *ImageTaskService) recordStatsOutcomeLocked(key string, dedupe bool, mode, rawStatus string, requestedCount, successOutputs int, when time.Time, allowPrune bool) bool {
	if s.statsLedger == nil {
		return false
	}
	capability := ClassifyTaskCapability(mode)
	if capability == "" {
		return false
	}
	status := util.Clean(rawStatus)
	if status != TaskStatusSuccess && status != TaskStatusError {
		return false
	}
	if dedupe && key != "" && s.statsLedger.Recorded[key] {
		return false
	}
	loc := imageTaskStatsLocation()
	if when.IsZero() {
		when = time.Now().In(loc)
	}
	date := when.In(loc).Format("2006-01-02")
	bucket := s.statsLedger.Days[date]
	if bucket == nil {
		bucket = &imageTaskStatsDayBucket{Date: date}
		s.statsLedger.Days[date] = bucket
	}
	count := requestedCount
	if count < 1 {
		count = 1
	}
	if successOutputs < 0 {
		successOutputs = 0
	}
	if capability == "video" {
		switch status {
		case TaskStatusSuccess:
			bucket.SuccessVideoTasks++
			if successOutputs > 0 {
				bucket.SuccessVideos += successOutputs
			} else {
				bucket.SuccessVideos += count
			}
			if successOutputs > 0 && successOutputs < count {
				bucket.FailedVideos += count - successOutputs
			}
		case TaskStatusError:
			bucket.FailedVideoTasks++
			if successOutputs > 0 {
				bucket.SuccessVideos += successOutputs
			}
			failedVideos := count - successOutputs
			if failedVideos < 0 {
				failedVideos = 0
			}
			bucket.FailedVideos += failedVideos
		}
	} else {
		switch status {
		case TaskStatusSuccess:
			bucket.SuccessTasks++
			if successOutputs > 0 {
				bucket.SuccessImages += successOutputs
			} else {
				bucket.SuccessImages += count
			}
			if successOutputs > 0 && successOutputs < count {
				bucket.FailedImages += count - successOutputs
			}
		case TaskStatusError:
			bucket.FailedTasks++
			if successOutputs > 0 {
				bucket.SuccessImages += successOutputs
			}
			failedImages := count - successOutputs
			if failedImages < 0 {
				failedImages = 0
			}
			bucket.FailedImages += failedImages
		}
	}
	if dedupe && key != "" {
		s.statsLedger.Recorded[key] = true
		pruneThreshold := max(4096, len(s.tasks)+1024)
		if allowPrune && len(s.statsLedger.Recorded) > pruneThreshold {
			s.pruneStatsLedgerRecordedLocked()
		}
	}
	s.markStatsLedgerDirtyLocked()
	return true
}

// backfillStatsLedgerFromTasksLocked seeds the ledger from existing terminal tasks once.
// Safe to run on every boot: already-recorded keys are skipped.
func (s *ImageTaskService) backfillStatsLedgerFromTasksLocked() (added int) {
	if s.statsLedger == nil {
		s.statsLedger = emptyImageTaskStatsLedger()
	}
	for _, task := range s.tasks {
		before := len(s.statsLedger.Recorded)
		s.recordTerminalStatsWithPruneLocked(task, false)
		if len(s.statsLedger.Recorded) > before {
			added++
		}
	}
	return added
}
