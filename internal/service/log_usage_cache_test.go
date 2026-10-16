package service

import (
	"chatgpt2api/internal/util"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUsageDatesAtUsesChinaCalendarDay(t *testing.T) {
	// 2026-08-03 16:30 UTC is already 2026-08-04 in China.
	now := time.Date(2026, 8, 3, 16, 30, 0, 0, time.UTC)
	got := usageDatesAt(2, now)
	want := []string{"2026-08-03", "2026-08-04"}
	if len(got) != len(want) {
		t.Fatalf("usageDatesAt() = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("usageDatesAt()[%d] = %q, want %q (zone=%s)", i, got[i], want[i], util.ChinaLocation())
		}
	}
}

func TestUserUsageStatsForIDsOnlyAccumulatesRequested(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)
	logs.Add("文生图调用完成", map[string]any{
		"subject_id": "user:a",
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/a.png"},
	})
	logs.Add("文生图调用完成", map[string]any{
		"subject_id": "user:b",
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/b1.png", "https://example.test/b2.png"},
	})
	stats := logs.UserUsageStatsForIDs(14, []string{"user:a"})
	if len(stats) != 1 {
		t.Fatalf("want only requested id, got %#v", stats)
	}
	a := stats["user:a"]
	if a.CallCount != 1 || a.QuotaUsed != 1 {
		t.Fatalf("user:a stats = %#v", a)
	}
	if _, ok := stats["user:b"]; ok {
		t.Fatalf("user:b must not appear when not requested: %#v", stats)
	}
	// Unknown id still present as zero row.
	stats = logs.UserUsageStatsForIDs(14, []string{"user:missing"})
	if stats["user:missing"].CallCount != 0 {
		t.Fatalf("missing user should be zero: %#v", stats["user:missing"])
	}
}

func TestUserUsageStatsFromAggregate(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)
	t.Cleanup(func() { _ = logs.Close() })
	logs.Add("文生图调用完成", map[string]any{
		"subject_id": "user:b",
		"key_id":     "key-b",
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/b.png"},
	})
	stats := logs.UserUsageStats(14)
	if stats["user:b"].CallCount != 1 || stats["user:b"].QuotaUsed != 1 {
		t.Fatalf("aggregate stats = %#v", stats["user:b"])
	}
	if err := logs.FlushUsageAggregate(); err != nil {
		t.Fatalf("FlushUsageAggregate() error = %v", err)
	}
	// Aggregate file should exist after usage write.
	if _, err := os.Stat(filepath.Join(dir, userUsageAggregateFileName)); err != nil {
		t.Fatalf("expected aggregate file: %v", err)
	}
}

func TestUserUsageAggregateReloadNoDoubleCount(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)
	t.Cleanup(func() { _ = logs.Close() })
	_ = logs.Add("文生图调用完成", map[string]any{
		"subject_id": "user:a",
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/a.png"},
	})
	if err := logs.FlushUsageAggregate(); err != nil {
		t.Fatalf("FlushUsageAggregate() error = %v", err)
	}
	// New process: load aggregate from disk, do not rebuild+double-count.
	logs2 := NewLogService(dir)
	t.Cleanup(func() { _ = logs2.Close() })
	stats := logs2.UserUsageStatsForIDs(14, []string{"user:a"})
	if stats["user:a"].CallCount != 1 || stats["user:a"].QuotaUsed != 1 {
		t.Fatalf("after reload stats = %#v (double-count?)", stats["user:a"])
	}
	_ = logs2.Add("文生图调用完成", map[string]any{
		"subject_id": "user:a",
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/a2.png"},
	})
	stats = logs2.UserUsageStatsForIDs(14, []string{"user:a"})
	if stats["user:a"].CallCount != 2 || stats["user:a"].QuotaUsed != 2 {
		t.Fatalf("after second add stats = %#v", stats["user:a"])
	}
}

func TestUserUsageAggregateRebuildFromLegacyLogs(t *testing.T) {
	dir := t.TempDir()
	// Write logs without going through Add aggregate path: simulate pre-3.6 log file
	// by using Add then deleting aggregate so next query rebuilds.
	logs := NewLogService(dir)
	_ = logs.Add("文生图调用完成", map[string]any{
		"subject_id": "user:legacy",
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/l.png"},
	})
	if err := logs.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	_ = os.Remove(filepath.Join(dir, userUsageAggregateFileName))
	// Fresh service with logs present but no aggregate file.
	logs2 := NewLogService(dir)
	t.Cleanup(func() { _ = logs2.Close() })
	// Clear in-memory so query must rebuild from file scan.
	logs2.mu.Lock()
	logs2.usageAgg = nil
	logs2.usageAggLoaded = false
	logs2.usageAggHasFile = false
	logs2.mu.Unlock()
	stats := logs2.UserUsageStatsForIDs(14, []string{"user:legacy"})
	if stats["user:legacy"].CallCount != 1 {
		t.Fatalf("rebuild stats = %#v", stats["user:legacy"])
	}
}
