package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"encoding/json"
	"errors"
	"os"
	"strings"
)

func (s *LogService) GovernanceSummary() LogGovernanceSummary {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.governanceSummaryLocked()
}

func (s *LogService) CleanupOlderThan(retentionDays int) (LogCleanupResult, error) {
	if retentionDays < 1 || retentionDays > 3650 {
		return LogCleanupResult{}, errors.New("保留天数须在 1–3650 之间")
	}
	cutoffDate := util.NowChina().AddDate(0, 0, -retentionDays+1).Format("2006-01-02")

	s.mu.Lock()
	defer s.mu.Unlock()

	deleted, err := s.deleteLogsBeforeLocked(cutoffDate)
	if err != nil {
		return LogCleanupResult{}, err
	}
	return LogCleanupResult{
		RetentionDays: retentionDays,
		CutoffDate:    cutoffDate,
		Deleted:       deleted,
		Remaining:     s.governanceSummaryLocked().Total,
	}, nil
}

func (s *LogService) governanceSummaryLocked() LogGovernanceSummary {
	if s.store != nil {
		if summaryBackend, ok := s.store.(storage.LogSummaryBackend); ok {
			if summary, err := summaryBackend.LogSummary(); err == nil {
				return LogGovernanceSummary{
					Total:      summary.Total,
					OldestTime: summary.OldestTime,
					LatestTime: summary.LatestTime,
				}
			}
		}
	}
	items, ok := s.loadLogItems("", "")
	summary := LogGovernanceSummary{}
	if !ok {
		return summary
	}
	summary.Total = len(items)
	for _, item := range items {
		logTime := util.Clean(item.Time)
		if logTime == "" {
			continue
		}
		if summary.LatestTime == "" || logTime > summary.LatestTime {
			summary.LatestTime = logTime
		}
		if summary.OldestTime == "" || logTime < summary.OldestTime {
			summary.OldestTime = logTime
		}
	}
	return summary
}

func (s *LogService) deleteLogsBeforeLocked(day string) (int, error) {
	if s.store != nil {
		if maintenance, ok := s.store.(storage.LogMaintenanceBackend); ok {
			return maintenance.DeleteLogsBefore(day)
		}
	}
	return s.deleteFileLogsBeforeLocked(day)
}

func (s *LogService) deleteFileLogsBeforeLocked(day string) (int, error) {
	day = strings.TrimSpace(day)
	if day == "" {
		return 0, nil
	}
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	lines := strings.Split(strings.TrimRight(string(data), "\r\n"), "\n")
	kept := make([]string, 0, len(lines))
	removed := 0
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var raw map[string]any
		if json.Unmarshal([]byte(line), &raw) == nil {
			if entry, ok := logEntryFromMap(raw); ok {
				itemDay := entry.day()
				if itemDay != "" && itemDay < day {
					removed++
					continue
				}
			}
		}
		kept = append(kept, line)
	}
	if removed == 0 {
		return 0, nil
	}
	next := []byte{}
	if len(kept) > 0 {
		next = []byte(strings.Join(kept, "\n") + "\n")
	}
	if err := storage.AtomicWriteFile(s.path, next, 0o644); err != nil {
		return 0, err
	}
	return removed, nil
}
