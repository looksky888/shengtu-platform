package service

import (
	"log"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (s *LogService) loadUsageAggregateRowsLocked(rows []storage.UserUsageAggregateRow) {
	for _, row := range rows {
		if row.UserID == "" || row.Day == "" {
			continue
		}
		days := s.usageAgg[row.UserID]
		if days == nil {
			days = make(map[string]*userUsageDay)
			s.usageAgg[row.UserID] = days
		}
		days[row.Day] = &userUsageDay{
			Calls: row.Calls, Success: row.Success, Failure: row.Failure, QuotaUsed: row.QuotaUsed,
		}
	}
}

func (s *LogService) usageAggregateRowsLocked() []storage.UserUsageAggregateRow {
	rows := make([]storage.UserUsageAggregateRow, 0)
	for userID, days := range s.usageAgg {
		for day, value := range days {
			if value == nil || userID == "" || day == "" {
				continue
			}
			rows = append(rows, storage.UserUsageAggregateRow{
				UserID: userID, Day: day, Calls: value.Calls, Success: value.Success,
				Failure: value.Failure, QuotaUsed: value.QuotaUsed,
			})
		}
	}
	return rows
}

func usageAggregateRowFromLog(item LogEntry) (storage.UserUsageAggregateRow, bool) {
	if !isUsageLog(item) {
		return storage.UserUsageAggregateRow{}, false
	}
	userID := util.Clean(item.Detail["subject_id"])
	if userID == "" {
		userID = util.Clean(item.Detail["key_id"])
	}
	day := item.day()
	if userID == "" || day == "" {
		return storage.UserUsageAggregateRow{}, false
	}
	row := storage.UserUsageAggregateRow{UserID: userID, Day: day, Calls: 1}
	switch logOutcome(item) {
	case "success":
		row.Success = 1
	case "failed":
		row.Failure = 1
	}
	row.QuotaUsed = logQuotaUsed(item.Detail, logOutcome(item))
	return row, true
}

func (s *LogService) pruneUsageAggregateStoreLocked() {
	if s.usageStore == nil {
		return
	}
	now := util.NowChina()
	today := now.In(util.ChinaLocation()).Format("2006-01-02")
	if s.usageAggPrunedDay == today {
		return
	}
	s.pruneUsageAggLocked(now)
	cutoff := now.In(util.ChinaLocation()).AddDate(0, 0, -userUsageAggregateRetainDays).Format("2006-01-02")
	if err := s.usageStore.DeleteUserUsageAggregateBefore(cutoff); err != nil {
		log.Printf("user usage aggregate prune failed: %v", err)
	}
	s.usageAggPrunedDay = today
}
