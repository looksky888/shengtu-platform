package service

import "chatgpt2api/internal/util"

// LogEntry is the internal log row (jsonl / LogBackend documents).
type LogEntry struct {
	Time    string         `json:"time"`
	Type    string         `json:"type,omitempty"`
	Summary string         `json:"summary"`
	Detail  map[string]any `json:"detail,omitempty"`
}

func logEntryFromMap(raw map[string]any) (LogEntry, bool) {
	if raw == nil {
		return LogEntry{}, false
	}
	timeText := util.Clean(raw["time"])
	summary := util.Clean(raw["summary"])
	if timeText == "" && summary == "" {
		return LogEntry{}, false
	}
	detail := util.StringMap(raw["detail"])
	if detail == nil {
		detail = map[string]any{}
	}
	typ := util.Clean(raw["type"])
	if typ == "" {
		typ = LogTypeEvent
	}
	return LogEntry{
		Time:    timeText,
		Type:    typ,
		Summary: summary,
		Detail:  detail,
	}, true
}

func (e LogEntry) toMap() map[string]any {
	detail := e.Detail
	if detail == nil {
		detail = map[string]any{}
	}
	return map[string]any{
		"time":    e.Time,
		"type":    firstNonEmpty(e.Type, LogTypeEvent),
		"summary": e.Summary,
		"detail":  detail,
	}
}

func logEntriesFromMaps(items []map[string]any) []LogEntry {
	out := make([]LogEntry, 0, len(items))
	for _, item := range items {
		if entry, ok := logEntryFromMap(item); ok {
			out = append(out, entry)
		}
	}
	return out
}

func (e LogEntry) detailString(key string) string {
	return util.Clean(e.Detail[key])
}

func (e LogEntry) day() string {
	if len(e.Time) < 10 {
		return ""
	}
	return e.Time[:10]
}
