package service

import (
	"bufio"
	"encoding/json"
	"os"
)

func (s *LogService) loadLogItems(startDate, endDate string) ([]LogEntry, bool) {
	// Prefer LogBackend (SQLite/etc.): date-filtered queries scale better than full jsonl scans.
	if s.store != nil {
		items, err := s.store.QueryLogs(startDate, endDate, 0)
		if err == nil {
			return logEntriesFromMaps(items), true
		}
	}
	file, err := os.Open(s.path)
	if err != nil {
		return nil, false
	}
	defer file.Close()
	var lines []string
	scanner := bufio.NewScanner(file)
	// Default 64KB max token is too small for verbose audit lines; raise buffer.
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	out := make([]LogEntry, 0, len(lines))
	for i := len(lines) - 1; i >= 0; i-- {
		var raw map[string]any
		if json.Unmarshal([]byte(lines[i]), &raw) != nil {
			continue
		}
		item, ok := logEntryFromMap(raw)
		if !ok {
			continue
		}
		if !matchLogDate(item, startDate, endDate) {
			continue
		}
		out = append(out, item)
	}
	return out, true
}
