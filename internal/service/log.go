package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	LogTypeEvent = "event"
)

type LogService struct {
	mu         sync.Mutex
	path       string
	dataDir    string // root for aggregate file (sibling of logs/)
	store      storage.LogBackend
	usageStore storage.UserUsageAggregateBackend

	// Pre-aggregated usage (scheme A): users[userID][YYYY-MM-DD] counters.
	// Loaded lazily; written incrementally on usage-shaped Add.
	usageAgg               map[string]map[string]*userUsageDay
	usageAggLoaded         bool // true after first load attempt from disk
	usageAggHasFile        bool // true when aggregate file existed at load (skip rebuild)
	usageAggDirty          bool
	usageAggSaveTimer      *time.Timer
	usageAggLastError      error
	usageAggNeedsMigration bool
	usageAggPrunedDay      string
	closing                bool
}

var errLogServiceClosed = errors.New("日志服务已关闭")

type LogQuery struct {
	Username      string
	Module        string
	Method        string
	Summary       string
	Status        string
	IPAddress     string
	OperationType string
	LogLevel      string
	StartDate     string
	EndDate       string
	StartTime     string
	EndTime       string
	Limit         int
}

type LogGovernanceSummary struct {
	Total      int    `json:"total"`
	OldestTime string `json:"oldest_time,omitempty"`
	LatestTime string `json:"latest_time,omitempty"`
}

type LogCleanupResult struct {
	RetentionDays int    `json:"retention_days"`
	CutoffDate    string `json:"cutoff_date"`
	Deleted       int    `json:"deleted"`
	Remaining     int    `json:"remaining"`
}

func NewLogService(dataDir string, backend ...storage.Backend) *LogService {
	path := filepath.Join(dataDir, filepath.FromSlash(storage.LogEventsDocumentName))
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	var usageStore storage.UserUsageAggregateBackend
	if len(backend) > 0 {
		usageStore = usageAggregateStoreFromBackend(backend[0])
	}
	return &LogService{path: path, dataDir: dataDir, store: firstLogStore(backend), usageStore: usageStore}
}

func (s *LogService) Add(summary string, detail map[string]any) error {
	if detail == nil {
		detail = map[string]any{}
	}
	item := LogEntry{
		Time:    util.NowLocal(),
		Type:    LogTypeEvent,
		Summary: summary,
		Detail:  detail,
	}
	if s.store != nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.closing {
			return errLogServiceClosed
		}
		if isUsageLog(item) {
			if err := s.ensureUsageAggReadyForQueryLocked(); err != nil {
				s.usageAggLastError = err
				return err
			}
			if s.usageStore != nil {
				if delta, ok := usageAggregateRowFromLog(item); ok {
					if err := s.usageStore.AppendLogWithUserUsage(item.toMap(), delta); err != nil {
						s.usageAggLastError = err
						return err
					}
					s.applyUsageLogLocked(item)
					s.usageAggLastError = nil
					s.pruneUsageAggregateStoreLocked()
					return nil
				}
			}
		}
		if err := s.store.AppendLog(item.toMap()); err != nil {
			return err
		}
		if s.applyUsageLogLocked(item) {
			s.markUsageAggDirtyLocked()
		}
		return nil
	}
	data, err := json.Marshal(item)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return errLogServiceClosed
	}
	if isUsageLog(item) {
		if err := s.ensureUsageAggReadyForQueryLocked(); err != nil {
			s.usageAggLastError = err
			return err
		}
	}
	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	written, writeErr := file.Write(append(data, '\n'))
	if writeErr == nil && written != len(data)+1 {
		writeErr = io.ErrShortWrite
	}
	if err := errors.Join(writeErr, file.Close()); err != nil {
		return err
	}
	if s.applyUsageLogLocked(item) {
		s.markUsageAggDirtyLocked()
	}
	return nil
}

// FlushUsageAggregate persists pending usage counters immediately.
func (s *LogService) FlushUsageAggregate() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.flushUsageAggLocked()
}

// Close stops aggregate retries and flushes pending usage counters.
func (s *LogService) Close() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closing = true
	if s.usageAggSaveTimer != nil {
		s.usageAggSaveTimer.Stop()
		s.usageAggSaveTimer = nil
	}
	return s.flushUsageAggLocked()
}

func (s *LogService) List(startDate, endDate string, limit int) []map[string]any {
	return s.Search(LogQuery{StartDate: startDate, EndDate: endDate, Limit: limit})
}
