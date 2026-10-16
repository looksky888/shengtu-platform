package service

import (
	"encoding/json"
	"log"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (s *LogService) persistUsageAggLocked() error {
	if s.usageStore != nil {
		return nil
	}
	path := s.usageAggregatePath()
	if path == "" {
		return nil
	}
	if err := s.ensureUsageAggLoadedLocked(); err != nil {
		return err
	}
	if s.usageAgg == nil {
		s.usageAgg = map[string]map[string]*userUsageDay{}
	}
	s.pruneUsageAggLocked(util.NowChina())
	file := usageAggregateFile{
		Version: 1,
		Users:   make(map[string]map[string]usageDayPublic, len(s.usageAgg)),
	}
	for userID, days := range s.usageAgg {
		if len(days) == 0 {
			continue
		}
		pub := make(map[string]usageDayPublic, len(days))
		for day, c := range days {
			if c == nil {
				continue
			}
			pub[day] = usageDayPublic{
				Calls: c.Calls, Success: c.Success, Failure: c.Failure, QuotaUsed: c.QuotaUsed,
			}
		}
		if len(pub) > 0 {
			file.Users[userID] = pub
		}
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if err := storage.AtomicWriteFile(path, append(data, '\n'), 0o600); err != nil {
		return err
	}
	s.usageAggHasFile = true
	return nil
}

func (s *LogService) markUsageAggDirtyLocked() {
	if s.usageStore != nil {
		return
	}
	s.usageAggDirty = true
	s.scheduleUsageAggSaveLocked(userUsageAggregateSaveDelay)
}

func (s *LogService) scheduleUsageAggSaveLocked(delay time.Duration) {
	if s.closing || !s.usageAggDirty || s.usageAggSaveTimer != nil {
		return
	}
	s.usageAggSaveTimer = time.AfterFunc(delay, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.usageAggSaveTimer = nil
		if s.closing || !s.usageAggDirty {
			return
		}
		if err := s.flushUsageAggLocked(); err != nil {
			log.Printf("user usage aggregate save failed: %v", err)
		}
	})
}

func (s *LogService) flushUsageAggLocked() error {
	if s.usageAggSaveTimer != nil {
		s.usageAggSaveTimer.Stop()
		s.usageAggSaveTimer = nil
	}
	if !s.usageAggDirty {
		return nil
	}
	if err := s.persistUsageAggLocked(); err != nil {
		s.usageAggLastError = err
		s.scheduleUsageAggSaveLocked(userUsageAggregateRetryDelay)
		return err
	}
	s.usageAggDirty = false
	s.usageAggLastError = nil
	return nil
}
