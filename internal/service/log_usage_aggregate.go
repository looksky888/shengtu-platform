package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"chatgpt2api/internal/util"
)

const (
	userUsageAggregateFileName = "user_usage_aggregate.json"
	// Keep a bit more than the max query window so cold reads stay complete.
	userUsageAggregateRetainDays = 120
	userUsageAggregateSaveDelay  = time.Second
	userUsageAggregateRetryDelay = 5 * time.Second
)

// usageAggregateFile is the on-disk shape: users[userID][YYYY-MM-DD] counters.
type usageAggregateFile struct {
	Version int                                  `json:"version"`
	Users   map[string]map[string]usageDayPublic `json:"users"`
}

type usageDayPublic struct {
	Calls     int `json:"calls"`
	Success   int `json:"success"`
	Failure   int `json:"failure"`
	QuotaUsed int `json:"quota_used"`
}

func (s *LogService) usageAggregatePath() string {
	if s == nil {
		return ""
	}
	// Prefer data root so aggregate sits next to other json docs, not under logs/.
	if s.dataDir != "" {
		return filepath.Join(s.dataDir, userUsageAggregateFileName)
	}
	if s.path == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(s.path), userUsageAggregateFileName)
}

// ensureUsageAggLoadedLocked loads aggregate from disk once (empty if no file).
// Does not scan logs — that is only for one-time migration on query.
func (s *LogService) ensureUsageAggLoadedLocked() error {
	if s.usageAggLoaded {
		return nil
	}
	s.usageAgg = map[string]map[string]*userUsageDay{}
	if s.usageStore != nil {
		rows, initialized, err := s.usageStore.LoadUserUsageAggregate()
		if err != nil {
			return err
		}
		if initialized {
			s.loadUsageAggregateRowsLocked(rows)
			s.usageAggLoaded = true
			s.usageAggHasFile = true
			return nil
		}
		s.usageAggNeedsMigration = true
	}
	path := s.usageAggregatePath()
	if path == "" {
		s.usageAggLoaded = true
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		s.usageAggLoaded = true
		return nil
	}
	var file usageAggregateFile
	if json.Unmarshal(data, &file) != nil || file.Users == nil {
		s.usageAggLoaded = true
		return nil
	}
	s.usageAggLoaded = true
	s.usageAggHasFile = true
	for userID, days := range file.Users {
		if userID == "" || days == nil {
			continue
		}
		inner := make(map[string]*userUsageDay, len(days))
		for day, c := range days {
			inner[day] = &userUsageDay{
				Calls:     c.Calls,
				Success:   c.Success,
				Failure:   c.Failure,
				QuotaUsed: c.QuotaUsed,
			}
		}
		s.usageAgg[userID] = inner
	}
	return nil
}

// ensureUsageAggReadyForQueryLocked loads aggregate; if no file existed, rebuilds once from logs.
func (s *LogService) ensureUsageAggReadyForQueryLocked() error {
	if err := s.ensureUsageAggLoadedLocked(); err != nil {
		return err
	}
	if !s.usageAggHasFile {
		// No aggregate file yet (upgrade / first run with legacy logs only).
		if err := s.rebuildUsageAggFromLogsLocked(); err != nil {
			return err
		}
		s.usageAggHasFile = true
		if s.usageStore == nil {
			s.markUsageAggDirtyLocked()
		}
	}
	if s.usageStore != nil && s.usageAggNeedsMigration {
		if err := s.usageStore.ReplaceUserUsageAggregate(s.usageAggregateRowsLocked()); err != nil {
			return err
		}
		s.usageAggNeedsMigration = false
	}
	return nil
}

// rebuildUsageAggFromLogsLocked scans existing logs into the in-memory aggregate.
// Caller holds s.mu. Does not persist.
func (s *LogService) rebuildUsageAggFromLogsLocked() error {
	full, err := s.userUsageStatsUncached(userUsageAggregateRetainDays, nil)
	if err != nil {
		return err
	}
	next := map[string]map[string]*userUsageDay{}
	for userID, summary := range full {
		if userID == "" {
			continue
		}
		inner := make(map[string]*userUsageDay, len(summary.UsageCurve))
		for _, pt := range summary.UsageCurve {
			if pt.Date == "" || (pt.Calls == 0 && pt.QuotaUsed == 0 && pt.Success == 0 && pt.Failure == 0) {
				continue
			}
			inner[pt.Date] = &userUsageDay{
				Calls:     pt.Calls,
				Success:   pt.Success,
				Failure:   pt.Failure,
				QuotaUsed: pt.QuotaUsed,
			}
		}
		if len(inner) > 0 {
			next[userID] = inner
		}
	}
	s.usageAgg = next
	return nil
}

func (s *LogService) pruneUsageAggLocked(now time.Time) {
	if s.usageAgg == nil {
		return
	}
	cutoff := now.In(util.ChinaLocation()).AddDate(0, 0, -userUsageAggregateRetainDays).Format("2006-01-02")
	for userID, days := range s.usageAgg {
		for day := range days {
			if day < cutoff {
				delete(days, day)
			}
		}
		if len(days) == 0 {
			delete(s.usageAgg, userID)
		}
	}
}

// applyUsageLogLocked increments pre-aggregation for one usage-shaped log entry.
// Caller holds s.mu. Returns true when counters changed.
func (s *LogService) applyUsageLogLocked(item LogEntry) bool {
	if !isUsageLog(item) {
		return false
	}
	day := item.day()
	if day == "" {
		return false
	}
	detail := item.Detail
	userID := util.Clean(detail["subject_id"])
	if userID == "" {
		userID = util.Clean(detail["key_id"])
	}
	if userID == "" {
		return false
	}
	if err := s.ensureUsageAggLoadedLocked(); err != nil {
		return false
	}
	if s.usageAgg == nil {
		s.usageAgg = map[string]map[string]*userUsageDay{}
	}
	days := s.usageAgg[userID]
	if days == nil {
		days = map[string]*userUsageDay{}
		s.usageAgg[userID] = days
	}
	bucket := days[day]
	if bucket == nil {
		bucket = &userUsageDay{}
		days[day] = bucket
	}
	outcome := logOutcome(item)
	quotaUsed := logQuotaUsed(detail, outcome)
	bucket.Calls++
	bucket.QuotaUsed += quotaUsed
	if outcome == "success" {
		bucket.Success++
	} else if outcome == "failed" {
		bucket.Failure++
	}
	return true
}

// userUsageFromAggregateLocked builds summaries from pre-aggregation.
// Caller holds s.mu.
func (s *LogService) userUsageFromAggregateLocked(days int, want map[string]struct{}) map[string]UserUsageSummary {
	if err := s.ensureUsageAggReadyForQueryLocked(); err != nil {
		s.usageAggLastError = err
	}
	dates := usageDates(days)
	zero := userUsageSummaryFromAcc(newUserUsageAccumulator(), dates)
	if len(want) == 0 {
		out := make(map[string]UserUsageSummary, len(s.usageAgg))
		for userID, dayMap := range s.usageAgg {
			out[userID] = userUsageSummaryFromAcc(accFromDayMap(dayMap, dates), dates)
		}
		return out
	}
	out := make(map[string]UserUsageSummary, len(want))
	for id := range want {
		dayMap := s.usageAgg[id]
		if dayMap == nil {
			out[id] = zero
			continue
		}
		out[id] = userUsageSummaryFromAcc(accFromDayMap(dayMap, dates), dates)
	}
	return out
}

func accFromDayMap(dayMap map[string]*userUsageDay, dates []string) *userUsageAccumulator {
	acc := newUserUsageAccumulator()
	if dayMap == nil {
		return acc
	}
	for _, date := range dates {
		src := dayMap[date]
		if src == nil {
			continue
		}
		acc.Calls += src.Calls
		acc.Success += src.Success
		acc.Failure += src.Failure
		acc.QuotaUsed += src.QuotaUsed
		cp := *src
		acc.Daily[date] = &cp
	}
	return acc
}
