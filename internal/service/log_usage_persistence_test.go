package service

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestPruneUsageAggregateUsesChinaCalendarDay(t *testing.T) {
	logs := NewLogService(t.TempDir())
	logs.usageAgg = map[string]map[string]*userUsageDay{
		"user:timezone": {
			"2026-04-05": {Calls: 1},
			"2026-04-06": {Calls: 1},
		},
	}
	// 2026-08-03 16:30 UTC is 2026-08-04 in China, so cutoff is 2026-04-06.
	logs.pruneUsageAggLocked(time.Date(2026, 8, 3, 16, 30, 0, 0, time.UTC))
	days := logs.usageAgg["user:timezone"]
	if _, ok := days["2026-04-05"]; ok {
		t.Fatal("pruneUsageAggLocked() kept day before China-time cutoff")
	}
	if _, ok := days["2026-04-06"]; !ok {
		t.Fatal("pruneUsageAggLocked() removed China-time cutoff day")
	}
}

func TestUsageAggregateCoalescesWritesUntilFlush(t *testing.T) {
	logs := NewLogService(t.TempDir())
	t.Cleanup(func() { _ = logs.Close() })

	addUsageTestLog(t, logs, "user:coalesced")
	logs.mu.Lock()
	firstTimer := logs.usageAggSaveTimer
	logs.mu.Unlock()
	addUsageTestLog(t, logs, "user:coalesced")

	logs.mu.Lock()
	dirty := logs.usageAggDirty
	secondTimer := logs.usageAggSaveTimer
	logs.mu.Unlock()
	if !dirty || firstTimer == nil || secondTimer != firstTimer {
		t.Fatalf("coalesced state dirty=%v first=%p second=%p", dirty, firstTimer, secondTimer)
	}
	if err := logs.FlushUsageAggregate(); err != nil {
		t.Fatalf("FlushUsageAggregate() error = %v", err)
	}
	stats := logs.UserUsageStatsForIDs(14, []string{"user:coalesced"})
	if got := stats["user:coalesced"]; got.CallCount != 2 || got.QuotaUsed != 2 {
		t.Fatalf("stats = %#v, want 2 calls and quota", got)
	}
}

func TestUsageAggregateFlushFailureKeepsDirtyAndRecovers(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)
	addUsageTestLog(t, logs, "user:retry")

	blocker := filepath.Join(dir, "not-a-directory")
	if err := os.WriteFile(blocker, []byte("block"), 0o600); err != nil {
		t.Fatal(err)
	}
	logs.mu.Lock()
	logs.dataDir = filepath.Join(blocker, "child")
	logs.mu.Unlock()
	if err := logs.FlushUsageAggregate(); err == nil {
		t.Fatal("FlushUsageAggregate() error = nil, want write failure")
	}
	logs.mu.Lock()
	dirty := logs.usageAggDirty
	lastErr := logs.usageAggLastError
	retryTimer := logs.usageAggSaveTimer
	logs.dataDir = dir
	logs.mu.Unlock()
	if !dirty || lastErr == nil || retryTimer == nil {
		t.Fatalf("failure state dirty=%v lastErr=%v retryTimer=%p", dirty, lastErr, retryTimer)
	}
	if _, err := os.Stat(logs.path); err != nil {
		t.Fatalf("original log missing after aggregate failure: %v", err)
	}
	if err := logs.FlushUsageAggregate(); err != nil {
		t.Fatalf("recovery flush error = %v", err)
	}
	logs.mu.Lock()
	dirty = logs.usageAggDirty
	lastErr = logs.usageAggLastError
	logs.mu.Unlock()
	if dirty || lastErr != nil {
		t.Fatalf("recovered state dirty=%v lastErr=%v", dirty, lastErr)
	}
	if err := logs.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	reloaded := NewLogService(dir)
	t.Cleanup(func() { _ = reloaded.Close() })
	got := reloaded.UserUsageStatsForIDs(14, []string{"user:retry"})["user:retry"]
	if got.CallCount != 1 || got.QuotaUsed != 1 {
		t.Fatalf("reloaded stats = %#v", got)
	}
}

func TestLogServiceCloseFlushesAndRejectsAdds(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)
	addUsageTestLog(t, logs, "user:close")
	if err := logs.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := logs.Add("after close", map[string]any{}); !errors.Is(err, errLogServiceClosed) {
		t.Fatalf("Add() error = %v, want %v", err, errLogServiceClosed)
	}
	if err := logs.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}

	reloaded := NewLogService(dir)
	t.Cleanup(func() { _ = reloaded.Close() })
	got := reloaded.UserUsageStatsForIDs(14, []string{"user:close"})["user:close"]
	if got.CallCount != 1 {
		t.Fatalf("reloaded stats = %#v", got)
	}
}

func TestLogServiceCloseReturnsPendingFlushFailure(t *testing.T) {
	dir := t.TempDir()
	logs := NewLogService(dir)
	addUsageTestLog(t, logs, "user:close-failure")

	blocker := filepath.Join(dir, "not-a-directory")
	if err := os.WriteFile(blocker, []byte("block"), 0o600); err != nil {
		t.Fatal(err)
	}
	logs.mu.Lock()
	logs.dataDir = filepath.Join(blocker, "child")
	logs.mu.Unlock()
	if err := logs.Close(); err == nil {
		t.Fatal("Close() error = nil, want pending flush failure")
	}
	logs.mu.Lock()
	dirty := logs.usageAggDirty
	retryTimer := logs.usageAggSaveTimer
	logs.dataDir = dir
	logs.mu.Unlock()
	if !dirty || retryTimer != nil {
		t.Fatalf("closed failure state dirty=%v retryTimer=%p", dirty, retryTimer)
	}
	if err := logs.Add("after close", map[string]any{}); !errors.Is(err, errLogServiceClosed) {
		t.Fatalf("Add() error = %v, want %v", err, errLogServiceClosed)
	}
	if err := logs.Close(); err != nil {
		t.Fatalf("recovery Close() error = %v", err)
	}
}

func TestUsageAggregateConcurrentAddsPersistExactlyOnce(t *testing.T) {
	const count = 64
	dir := t.TempDir()
	logs := NewLogService(dir)
	var wg sync.WaitGroup
	errs := make(chan error, count)
	for range count {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- logs.Add("usage", usageTestDetail("user:concurrent"))
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("Add() error = %v", err)
		}
	}
	if err := logs.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	reloaded := NewLogService(dir)
	t.Cleanup(func() { _ = reloaded.Close() })
	got := reloaded.UserUsageStatsForIDs(14, []string{"user:concurrent"})["user:concurrent"]
	if got.CallCount != count || got.SuccessCount != count || got.QuotaUsed != count {
		t.Fatalf("reloaded stats = %#v, want %d", got, count)
	}
}

func TestUsageAggregatePreservesLegacyLogsOnFirstNewAdd(t *testing.T) {
	dir := t.TempDir()
	legacy := NewLogService(dir)
	addUsageTestLog(t, legacy, "user:legacy")
	if err := legacy.Close(); err != nil {
		t.Fatalf("legacy Close() error = %v", err)
	}
	if err := os.Remove(filepath.Join(dir, userUsageAggregateFileName)); err != nil {
		t.Fatal(err)
	}

	logs := NewLogService(dir)
	addUsageTestLog(t, logs, "user:new")
	if err := logs.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	reloaded := NewLogService(dir)
	t.Cleanup(func() { _ = reloaded.Close() })
	stats := reloaded.UserUsageStats(14)
	if stats["user:legacy"].CallCount != 1 || stats["user:new"].CallCount != 1 {
		t.Fatalf("stats after migration = %#v", stats)
	}
}

func addUsageTestLog(t *testing.T, logs *LogService, userID string) {
	t.Helper()
	if err := logs.Add("usage", usageTestDetail(userID)); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
}

func usageTestDetail(userID string) map[string]any {
	return map[string]any{
		"subject_id": userID,
		"status":     "success",
		"endpoint":   "/v1/images/generations",
		"urls":       []string{"https://example.test/image.png"},
	}
}
