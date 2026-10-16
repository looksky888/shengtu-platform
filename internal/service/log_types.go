package service

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

// Search remains a map bridge for residual callers; prefer SearchTyped.
func (s *LogService) Search(query LogQuery) []map[string]any {
	typed := s.SearchTyped(query)
	out := make([]map[string]any, 0, len(typed))
	for _, item := range typed {
		out = append(out, publicLogItem(LogEntry{Time: item.Time, Summary: item.Summary, Detail: item.Detail}))
	}
	return out
}
