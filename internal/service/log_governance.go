package service

import (
	"bufio"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
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

// deleteFileLogsBeforeLocked rewrites the JSONL event log without the entries
// older than day. It streams line by line into a temporary file and only swaps
// the file after the new content is durable, so a multi-GB log no longer has to
// be held in memory as whole-file copies.
func (s *LogService) deleteFileLogsBeforeLocked(day string) (int, error) {
	day = strings.TrimSpace(day)
	if day == "" {
		return 0, nil
	}
	source, err := os.Open(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	defer source.Close()

	dir := filepath.Dir(s.path)
	temp, err := os.CreateTemp(dir, filepath.Base(s.path)+".cleanup-*")
	if err != nil {
		return 0, err
	}
	tempPath := temp.Name()
	defer func() {
		_ = temp.Close()
		_ = os.Remove(tempPath)
	}()

	removed, keptBytes, err := streamLogsKeptAfter(source, temp, day)
	if err != nil {
		return 0, err
	}
	if removed == 0 {
		return 0, nil
	}
	if err := temp.Sync(); err != nil {
		return 0, err
	}
	if err := temp.Close(); err != nil {
		return 0, err
	}
	kept, err := os.Open(tempPath)
	if err != nil {
		return 0, err
	}
	defer kept.Close()
	if _, err := storage.AtomicWriteFromReader(s.path, kept, keptBytes+1, 0o644); err != nil {
		return 0, err
	}
	return removed, nil
}

// streamLogsKeptAfter copies every line that is not older than day into dest and
// reports how many lines were dropped plus how many bytes were kept.
func streamLogsKeptAfter(source io.Reader, dest io.Writer, day string) (int, int64, error) {
	reader := bufio.NewReaderSize(source, 64*1024)
	writer := bufio.NewWriterSize(dest, 64*1024)
	removed := 0
	var kept int64
	for {
		line, readErr := reader.ReadString('\n')
		trimmed := strings.TrimRight(line, "\r\n")
		keep := strings.TrimSpace(trimmed) != ""
		if keep {
			var raw map[string]any
			if json.Unmarshal([]byte(trimmed), &raw) == nil {
				if entry, ok := logEntryFromMap(raw); ok {
					if itemDay := entry.day(); itemDay != "" && itemDay < day {
						keep = false
						removed++
					}
				}
			}
		}
		if keep {
			written, err := writer.WriteString(trimmed + "\n")
			kept += int64(written)
			if err != nil {
				return removed, kept, err
			}
		}
		if readErr != nil {
			if !errors.Is(readErr, io.EOF) {
				return removed, kept, readErr
			}
			break
		}
	}
	if err := writer.Flush(); err != nil {
		return removed, kept, err
	}
	return removed, kept, nil
}
