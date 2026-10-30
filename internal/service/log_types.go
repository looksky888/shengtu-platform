package service

import "chatgpt2api/internal/storage"

const (
	logSearchCursorBatchSize = 500
	logSearchMaxScannedRows  = 50000
)

// LogEntryPublic is a typed view of public log rows for API boundaries.
// Internal rows are LogEntry; convert with these helpers at list edges.
// Wire shape matches publicLogItem (type field stripped): time, summary, detail.
type LogEntryPublic struct {
	Time    string         `json:"time,omitempty"`
	Summary string         `json:"summary,omitempty"`
	Detail  map[string]any `json:"detail,omitempty"`
}

// LogListResponse is the typed list payload for GET /api/logs.
type LogListResponse struct {
	Items    []LogEntryPublic `json:"items"`
	Total    int              `json:"total"`
	PageSize int              `json:"page_size"`
}

// LogEntryPublicFromRecord converts an internal log entry for API responses (no map hop).
func LogEntryPublicFromRecord(item LogEntry) LogEntryPublic {
	detail := item.Detail
	if detail == nil {
		detail = map[string]any{}
	}
	return LogEntryPublic{
		Time:    item.Time,
		Summary: item.Summary,
		Detail:  detail,
	}
}

// SearchTyped returns typed public log entries for the query (no map intermediate).
func (s *LogService) SearchTyped(query LogQuery) []LogEntryPublic {
	limit := normalizedLogLimit(query.Limit)
	startDate, endDate := logQueryDateBounds(query)
	if s.store != nil {
		if !hasInMemoryLogFilters(query) {
			rawItems, err := s.store.QueryLogs(startDate, endDate, limit)
			if err == nil {
				entries := logEntriesFromMaps(rawItems)
				out := make([]LogEntryPublic, 0, min(limit, len(entries)))
				for _, item := range entries {
					if !matchLogQuery(item, query) {
						continue
					}
					out = append(out, LogEntryPublicFromRecord(item))
					if len(out) >= limit {
						break
					}
				}
				return out
			}
		} else if cursorStore, ok := s.store.(storage.LogCursorBackend); ok {
			if out, cursorOK := searchLogsWithCursor(cursorStore, startDate, endDate, query, limit); cursorOK {
				return out
			}
		}
	}
	items, ok := s.loadLogItems(startDate, endDate)
	if !ok {
		return []LogEntryPublic{}
	}
	out := make([]LogEntryPublic, 0, min(limit, len(items)))
	for _, item := range items {
		if !matchLogQuery(item, query) {
			continue
		}
		out = append(out, LogEntryPublicFromRecord(item))
		if len(out) >= limit {
			break
		}
	}
	return out
}

func searchLogsWithCursor(cursorStore storage.LogCursorBackend, startDate, endDate string, query LogQuery, limit int) ([]LogEntryPublic, bool) {
	batchSize := max(logSearchCursorBatchSize, limit*2)
	if batchSize > 1000 {
		batchSize = 1000
	}
	out := make([]LogEntryPublic, 0, limit)
	var beforeID int64
	scanned := 0
	for scanned < logSearchMaxScannedRows && len(out) < limit {
		remainingBudget := logSearchMaxScannedRows - scanned
		fetchLimit := min(batchSize, remainingBudget)
		batch, err := cursorStore.QueryLogsBefore(startDate, endDate, beforeID, fetchLimit)
		if err != nil {
			return nil, false
		}
		if len(batch) == 0 {
			break
		}
		scanned += len(batch)
		for _, row := range batch {
			if row.ID > 0 && (beforeID == 0 || row.ID < beforeID) {
				beforeID = row.ID
			}
			entry, ok := logEntryFromMap(row.Item)
			if !ok || !matchLogQuery(entry, query) {
				continue
			}
			out = append(out, LogEntryPublicFromRecord(entry))
			if len(out) >= limit {
				break
			}
		}
		if len(batch) < fetchLimit {
			break
		}
	}
	return out, true
}

// Search remains a map bridge for residual callers; prefer SearchTyped.
func (s *LogService) Search(query LogQuery) []map[string]any {
	typed := s.SearchTyped(query)
	out := make([]map[string]any, 0, len(typed))
	for _, item := range typed {
		out = append(out, publicLogItem(LogEntry{Time: item.Time, Summary: item.Summary, Detail: item.Detail}))
	}
	return out
}
