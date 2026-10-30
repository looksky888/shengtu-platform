package service

import (
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"os"
	"path/filepath"
	"testing"
)

func TestLogServiceUsesUnifiedLogsDirectory(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)

	if err := logs.Add("新增账号", map[string]any{"module": "accounts", "operation_type": "新增", "added": 1}); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "logs", "events.jsonl")); err != nil {
		t.Fatalf("expected unified log file under data/logs: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "logs.jsonl")); !os.IsNotExist(err) {
		t.Fatalf("root logs.jsonl should not be used, stat error = %v", err)
	}

	items := logs.List("", "", 10)
	if len(items) != 1 {
		t.Fatalf("List() length = %d, want 1", len(items))
	}
	if items[0]["summary"] != "新增账号" {
		t.Fatalf("List()[0] = %#v", items[0])
	}
	if _, ok := items[0]["type"]; ok {
		t.Fatalf("List()[0] should not expose log type: %#v", items[0])
	}
}

func TestLogServiceSearchFiltersUnifiedLogs(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)

	if err := logs.Add("新增账号", map[string]any{"module": "accounts", "operation_type": "新增", "added": 1}); err != nil {
		t.Fatalf("Add(account event) error = %v", err)
	}
	if err := logs.Add("文生图调用完成", map[string]any{
		"key_name":    "alice",
		"key_id":      "alice-key",
		"method":      "POST",
		"path":        "/v1/images/generations",
		"module":      "images",
		"endpoint":    "/v1/images/generations",
		"duration_ms": 120,
		"status":      200,
		"outcome":     "success",
		"log_level":   "info",
	}); err != nil {
		t.Fatalf("Add(call event) error = %v", err)
	}
	if err := logs.Add("GET /api/settings", map[string]any{
		"username":       "admin",
		"module":         "settings",
		"method":         "GET",
		"path":           "/api/settings",
		"status":         403,
		"ip_address":     "127.0.0.1",
		"operation_type": "查询",
		"log_level":      "warning",
	}); err != nil {
		t.Fatalf("Add(audit event) error = %v", err)
	}

	all := logs.Search(LogQuery{Limit: 10})
	if len(all) != 3 {
		t.Fatalf("Search(all) length = %d, want 3: %#v", len(all), all)
	}
	for _, item := range all {
		if _, ok := item["type"]; ok {
			t.Fatalf("Search(all) should not expose log type: %#v", all)
		}
	}

	filtered := logs.Search(LogQuery{
		Username:      "admin",
		Module:        "settings",
		Method:        "GET",
		Summary:       "/api/settings",
		Status:        "403",
		IPAddress:     "127.0.0.1",
		OperationType: "查询",
		LogLevel:      "warning",
		Limit:         10,
	})
	if len(filtered) != 1 || filtered[0]["summary"] != "GET /api/settings" {
		t.Fatalf("Search(filtered) = %#v", filtered)
	}

	callLogs := logs.Search(LogQuery{Username: "alice", Module: "images", Method: "POST", Status: "200", LogLevel: "info", Limit: 10})
	if len(callLogs) != 1 || callLogs[0]["summary"] != "文生图调用完成" {
		t.Fatalf("Search(call) = %#v", callLogs)
	}
	if _, ok := callLogs[0]["type"]; ok {
		t.Fatalf("Search(call) should not expose log type: %#v", callLogs)
	}
	usage, ok := logs.UserUsageStats(1)["alice-key"]
	if !ok || usage.CallCount != 1 || usage.SuccessCount != 1 || usage.QuotaUsed != 1 {
		t.Fatalf("UserUsageStats(new call log shape) = %#v ok=%v", usage, ok)
	}
}

func TestSanitizeLogValueMasksPluralTokenKeys(t *testing.T) {
	const token = "abcdefghijklmnopqrstuvwxyz"
	out, _ := SanitizeLogValue(map[string]any{
		"tokens":         []any{token},
		"access_tokens":  []string{token},
		"refresh_tokens": []any{token},
	}).(map[string]any)

	for _, key := range []string{"tokens", "access_tokens", "refresh_tokens"} {
		items, _ := out[key].([]any)
		if len(items) != 1 {
			t.Fatalf("%s not preserved as one-item list: %#v", key, out[key])
		}
		if items[0] == token {
			t.Fatalf("%s leaked full token: %#v", key, items[0])
		}
		if items[0] != "abcdefghij..." {
			t.Fatalf("%s masked token = %#v, want prefix mask", key, items[0])
		}
	}
}

func TestLogServiceCleansOldLogs(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)

	if err := logs.Add("旧调用", map[string]any{"status": "success"}); err != nil {
		t.Fatalf("Add(old) error = %v", err)
	}
	if err := logs.Add("新日志", map[string]any{"status": 200}); err != nil {
		t.Fatalf("Add(new) error = %v", err)
	}

	path := filepath.Join(dir, "logs", "events.jsonl")
	data := []byte(`{"time":"2000-01-01 00:00:00","type":"event","summary":"旧调用","detail":{"status":"success"}}` + "\n" +
		`{"time":"` + util.NowLocal() + `","type":"event","summary":"新日志","detail":{"status":200}}` + "\n")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("rewrite logs: %v", err)
	}

	result, err := logs.CleanupOlderThan(1)
	if err != nil {
		t.Fatalf("CleanupOlderThan() error = %v", err)
	}
	if result.Deleted != 1 || result.Remaining != 1 {
		t.Fatalf("CleanupOlderThan() = %#v, want deleted 1 remaining 1", result)
	}
	items := logs.Search(LogQuery{Limit: 10})
	if len(items) != 1 || items[0]["summary"] != "新日志" {
		t.Fatalf("remaining logs = %#v", items)
	}
}


type countingLogCursorBackend struct {
	queryLogsLimitCalls []int
	cursorBatchCalls    []int
	rows                []map[string]any
}

func (b *countingLogCursorBackend) LoadAccounts() ([]map[string]any, error)   { return nil, nil }
func (b *countingLogCursorBackend) SaveAccounts([]map[string]any) error       { return nil }
func (b *countingLogCursorBackend) LoadAuthKeys() ([]map[string]any, error)   { return nil, nil }
func (b *countingLogCursorBackend) SaveAuthKeys([]map[string]any) error       { return nil }
func (b *countingLogCursorBackend) HealthCheck() storage.BackendHealth        { return storage.BackendHealth{Status: "ok"} }
func (b *countingLogCursorBackend) Info() storage.BackendInfo                 { return storage.BackendInfo{Type: "sqlite"} }
func (b *countingLogCursorBackend) AppendLog(item map[string]any) error {
	b.rows = append(b.rows, item)
	return nil
}

func (b *countingLogCursorBackend) QueryLogs(startDate, endDate string, limit int) ([]map[string]any, error) {
	b.queryLogsLimitCalls = append(b.queryLogsLimitCalls, limit)
	out := make([]map[string]any, 0, min(max(limit, 0), len(b.rows)))
	for i := len(b.rows) - 1; i >= 0; i-- {
		out = append(out, b.rows[i])
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (b *countingLogCursorBackend) QueryLogsBefore(startDate, endDate string, beforeID int64, limit int) ([]storage.PagedLogRecord, error) {
	b.cursorBatchCalls = append(b.cursorBatchCalls, limit)
	out := make([]storage.PagedLogRecord, 0, limit)
	for i := len(b.rows) - 1; i >= 0; i-- {
		id := int64(i + 1)
		if beforeID > 0 && id >= beforeID {
			continue
		}
		out = append(out, storage.PagedLogRecord{ID: id, Item: b.rows[i]})
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out, nil
}

func TestLogServicePushesDownSQLLimitAndPagesFilteredQueries(t *testing.T) {
	dir := t.TempDir()
	backend := &countingLogCursorBackend{}
	logs := NewLogService(dir, backend)

	for i := 0; i < 650; i++ {
		module := "images"
		if i == 5 {
			module = "rare-audit"
		}
		if err := logs.Add("event", map[string]any{"module": module}); err != nil {
			t.Fatalf("Add(%d) error = %v", i, err)
		}
	}

	unfiltered := logs.SearchTyped(LogQuery{Limit: 25})
	if len(unfiltered) != 25 {
		t.Fatalf("unfiltered len = %d, want 25", len(unfiltered))
	}
	if len(backend.queryLogsLimitCalls) != 1 || backend.queryLogsLimitCalls[0] != 25 {
		t.Fatalf("expected single QueryLogs call with limit=25, got %v", backend.queryLogsLimitCalls)
	}

	filtered := logs.SearchTyped(LogQuery{Module: "rare-audit", Limit: 10})
	if len(filtered) != 1 {
		t.Fatalf("filtered len = %d, want 1", len(filtered))
	}
	if len(backend.cursorBatchCalls) != 2 {
		t.Fatalf("expected cursor batch paging (2 batches for 650 rows), got %v", backend.cursorBatchCalls)
	}
}
