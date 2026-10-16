package service

import (
	"chatgpt2api/internal/util"
	"strings"
)

func normalizedLogLimit(limit int) int {
	if limit <= 0 {
		return 200
	}
	if limit > 500 {
		return 500
	}
	return limit
}

func logQueryDateBounds(query LogQuery) (string, string) {
	startDate := strings.TrimSpace(query.StartDate)
	endDate := strings.TrimSpace(query.EndDate)
	if start := normalizeLogTimeFilter(query.StartTime, false); len(start) >= 10 {
		startDate = start[:10]
	}
	if end := normalizeLogTimeFilter(query.EndTime, true); len(end) >= 10 {
		endDate = end[:10]
	}
	return startDate, endDate
}

func matchLogQuery(item LogEntry, query LogQuery) bool {
	if !matchLogDate(item, strings.TrimSpace(query.StartDate), strings.TrimSpace(query.EndDate)) {
		return false
	}
	logTime := util.Clean(item.Time)
	if start := normalizeLogTimeFilter(query.StartTime, false); start != "" && logTime < start {
		return false
	}
	if end := normalizeLogTimeFilter(query.EndTime, true); end != "" && logTime > end {
		return false
	}
	if !containsFold(logActor(item), query.Username) {
		return false
	}
	if !containsFold(logModule(item), query.Module) {
		return false
	}
	if !containsFold(util.Clean(item.Summary), query.Summary) {
		return false
	}
	if method := strings.TrimSpace(query.Method); method != "" && !strings.EqualFold(item.detailString("method"), method) {
		return false
	}
	if status := strings.TrimSpace(query.Status); status != "" && logStatus(item) != status {
		return false
	}
	if !containsFold(item.detailString("ip_address"), query.IPAddress) {
		return false
	}
	if !containsFold(logOperationType(item), query.OperationType) {
		return false
	}
	if level := strings.TrimSpace(query.LogLevel); level != "" && logLevel(item) != strings.ToLower(level) {
		return false
	}
	return true
}

func matchLogDate(item LogEntry, startDate, endDate string) bool {
	day := item.day()
	if strings.TrimSpace(startDate) != "" && day < strings.TrimSpace(startDate) {
		return false
	}
	if strings.TrimSpace(endDate) != "" && day > strings.TrimSpace(endDate) {
		return false
	}
	return true
}

func normalizeLogTimeFilter(value string, endOfDay bool) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "T", " "))
	if value == "" {
		return ""
	}
	if len(value) == len("2006-01-02") {
		if endOfDay {
			return value + " 23:59:59"
		}
		return value + " 00:00:00"
	}
	if len(value) == len("2006-01-02 15:04") {
		if endOfDay {
			return value + ":59"
		}
		return value + ":00"
	}
	if len(value) > len("2006-01-02 15:04:05") {
		return value[:len("2006-01-02 15:04:05")]
	}
	return value
}

func logActor(item LogEntry) string {
	var parts []string
	for _, key := range []string{"username", "key_name", "subject_id", "key_id"} {
		if value := item.detailString(key); value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(parts, " ")
}

func logModule(item LogEntry) string {
	if value := item.detailString("module"); value != "" {
		return value
	}
	return "系统日志"
}

func logOperationType(item LogEntry) string {
	return item.detailString("operation_type")
}

func logLevel(item LogEntry) string {
	if value := item.detailString("log_level"); value != "" {
		return strings.ToLower(value)
	}
	if logOutcome(item) == "failed" {
		return "warning"
	}
	return "info"
}

func logStatus(item LogEntry) string {
	return util.Clean(item.Detail["status"])
}

func logOutcome(item LogEntry) string {
	detail := item.Detail
	if outcome := util.Clean(detail["outcome"]); outcome != "" {
		return outcome
	}
	status := util.Clean(detail["status"])
	switch status {
	case "success", "failed":
		return status
	}
	code := util.ToInt(detail["status"], 0)
	if code >= 400 {
		return "failed"
	}
	if code > 0 {
		return "success"
	}
	return ""
}

func containsFold(value, filter string) bool {
	filter = strings.TrimSpace(filter)
	if filter == "" {
		return true
	}
	return strings.Contains(strings.ToLower(value), strings.ToLower(filter))
}

func publicLogItem(item LogEntry) map[string]any {
	out := map[string]any{
		"time":    item.Time,
		"summary": item.Summary,
	}
	if item.Detail != nil {
		out["detail"] = item.Detail
	} else {
		out["detail"] = map[string]any{}
	}
	return out
}
