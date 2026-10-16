package service

import (
	"bufio"
	"chatgpt2api/internal/util"
	"encoding/json"
	"os"
	"strings"
	"time"
)

type userUsageDay struct {
	Calls     int
	Success   int
	Failure   int
	QuotaUsed int
}

type userUsageAccumulator struct {
	Calls     int
	Success   int
	Failure   int
	QuotaUsed int
	Daily     map[string]*userUsageDay
}

// UsageDayPoint is one day in a 14-day admin usage sparkline.
type UsageDayPoint struct {
	Date      string `json:"date"`
	Calls     int    `json:"calls"`
	Success   int    `json:"success"`
	Failure   int    `json:"failure"`
	QuotaUsed int    `json:"quota_used"`
}

// UserUsageSummary is the typed aggregation for on-demand admin usage.
type UserUsageSummary struct {
	CallCount    int             `json:"call_count"`
	SuccessCount int             `json:"success_count"`
	FailureCount int             `json:"failure_count"`
	QuotaUsed    int             `json:"quota_used"`
	UsageCurve   []UsageDayPoint `json:"usage_curve"`
}

// UserUsageStats returns usage for all users in the window from pre-aggregation
// (scheme A). Falls back to one-time log rebuild when aggregate file is absent.
func (s *LogService) UserUsageStats(days int) map[string]UserUsageSummary {
	days = normalizeUsageStatsDays(days)
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.userUsageFromAggregateLocked(days, nil)
}

// UserUsageStatsForIDs returns usage for the given user ids from pre-aggregation
// (scheme A + scheme B list/usage split). Synchronous; list endpoints never call this.
func (s *LogService) UserUsageStatsForIDs(days int, ids []string) map[string]UserUsageSummary {
	days = normalizeUsageStatsDays(days)
	want := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			want[id] = struct{}{}
		}
	}
	if len(want) == 0 {
		return map[string]UserUsageSummary{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.userUsageFromAggregateLocked(days, want)
}

func normalizeUsageStatsDays(days int) int {
	if days <= 0 {
		return 14
	}
	if days > 90 {
		return 90
	}
	return days
}

// userUsageStatsUncached scans logs. If want is non-nil, only those user ids are accumulated.
func (s *LogService) userUsageStatsUncached(days int, want map[string]struct{}) (map[string]UserUsageSummary, error) {
	dates := usageDates(days)
	out := map[string]UserUsageSummary{}
	if len(dates) == 0 {
		return out, nil
	}
	startDate := dates[0]
	endDate := dates[len(dates)-1]
	byUser := map[string]*userUsageAccumulator{}
	if s.store != nil {
		items, err := s.store.QueryLogs(startDate, endDate, 0)
		if err != nil {
			return nil, err
		}
		for _, raw := range items {
			if item, ok := logEntryFromMap(raw); ok {
				accumulateUserUsageLog(byUser, item, startDate, endDate, want)
			}
		}
		return finalizeUserUsage(byUser, dates, want), nil
	}
	file, err := os.Open(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return finalizeUserUsage(byUser, dates, want), nil
		}
		return nil, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		var raw map[string]any
		if json.Unmarshal([]byte(scanner.Text()), &raw) != nil {
			continue
		}
		item, ok := logEntryFromMap(raw)
		if !ok {
			continue
		}
		accumulateUserUsageLog(byUser, item, startDate, endDate, want)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return finalizeUserUsage(byUser, dates, want), nil
}

func finalizeUserUsage(byUser map[string]*userUsageAccumulator, dates []string, want map[string]struct{}) map[string]UserUsageSummary {
	out := make(map[string]UserUsageSummary, len(byUser))
	for userID, acc := range byUser {
		out[userID] = userUsageSummaryFromAcc(acc, dates)
	}
	if want != nil {
		zero := userUsageSummaryFromAcc(newUserUsageAccumulator(), dates)
		for id := range want {
			if _, ok := out[id]; !ok {
				out[id] = zero
			}
		}
	}
	return out
}

func accumulateUserUsageLog(byUser map[string]*userUsageAccumulator, item LogEntry, startDate, endDate string, want map[string]struct{}) {
	if !isUsageLog(item) {
		return
	}
	day := item.day()
	if day == "" || day < startDate || day > endDate {
		return
	}
	detail := item.Detail
	userID := util.Clean(detail["subject_id"])
	if userID == "" {
		userID = util.Clean(detail["key_id"])
	}
	if userID == "" {
		return
	}
	if want != nil {
		if _, ok := want[userID]; !ok {
			return
		}
	}
	acc := byUser[userID]
	if acc == nil {
		acc = newUserUsageAccumulator()
		byUser[userID] = acc
	}
	outcome := logOutcome(item)
	quotaUsed := logQuotaUsed(detail, outcome)
	acc.Calls++
	acc.QuotaUsed += quotaUsed
	if outcome == "success" {
		acc.Success++
	} else if outcome == "failed" {
		acc.Failure++
	}
	daily := acc.Daily[day]
	if daily == nil {
		daily = &userUsageDay{}
		acc.Daily[day] = daily
	}
	daily.Calls++
	daily.QuotaUsed += quotaUsed
	if outcome == "success" {
		daily.Success++
	} else if outcome == "failed" {
		daily.Failure++
	}
}

func isUsageLog(item LogEntry) bool {
	if item.detailString("endpoint") == "" {
		return false
	}
	return logOutcome(item) != ""
}

func ZeroUserUsageStats(days int) UserUsageSummary {
	return userUsageSummaryFromAcc(newUserUsageAccumulator(), usageDates(normalizeUsageStatsDays(days)))
}

func usageDates(days int) []string {
	return usageDatesAt(days, util.NowChina())
}

func usageDatesAt(days int, now time.Time) []string {
	days = normalizeUsageStatsDays(days)
	start := now.In(util.ChinaLocation()).AddDate(0, 0, -days+1)
	dates := make([]string, 0, days)
	for i := 0; i < days; i++ {
		dates = append(dates, start.AddDate(0, 0, i).Format("2006-01-02"))
	}
	return dates
}

func newUserUsageAccumulator() *userUsageAccumulator {
	return &userUsageAccumulator{Daily: map[string]*userUsageDay{}}
}

func userUsageSummaryFromAcc(acc *userUsageAccumulator, dates []string) UserUsageSummary {
	if acc == nil {
		acc = newUserUsageAccumulator()
	}
	curve := make([]UsageDayPoint, 0, len(dates))
	for _, date := range dates {
		day := acc.Daily[date]
		if day == nil {
			day = &userUsageDay{}
		}
		curve = append(curve, UsageDayPoint{
			Date:      date,
			Calls:     day.Calls,
			Success:   day.Success,
			Failure:   day.Failure,
			QuotaUsed: day.QuotaUsed,
		})
	}
	return UserUsageSummary{
		CallCount:    acc.Calls,
		SuccessCount: acc.Success,
		FailureCount: acc.Failure,
		QuotaUsed:    acc.QuotaUsed,
		UsageCurve:   curve,
	}
}

func logQuotaUsed(detail map[string]any, outcome string) int {
	if outcome != "success" {
		return 0
	}
	if urls := util.AsStringSlice(detail["urls"]); len(urls) > 0 {
		return len(urls)
	}
	endpoint := util.Clean(detail["endpoint"])
	switch endpoint {
	case "/v1/images/generations", "/v1/images/edits", "/api/creation-tasks/image-generations", "/api/creation-tasks/image-edits":
		return 1
	default:
		return 0
	}
}
