package service

import (
	"chatgpt2api/internal/util"
	"time"
)

func (s *ImageTaskService) TodayStats(now time.Time) ImageTaskDailyStats {
	if now.IsZero() {
		now = time.Now()
	}
	loc := imageTaskStatsLocation()
	localNow := now.In(loc)
	start := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc)
	return s.StatsBetween("today", start, start.AddDate(0, 0, 1))
}

func (s *ImageTaskService) StatsBetween(period string, start, end time.Time) ImageTaskDailyStats {
	loc := imageTaskStatsLocation()
	if start.IsZero() {
		now := time.Now().In(loc)
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	}
	start = start.In(loc)
	if end.IsZero() || !end.After(start) {
		end = start.AddDate(0, 0, 1)
	}
	end = end.In(loc)
	date := start.Format("2006-01-02")
	stats := ImageTaskDailyStats{
		Date:      date,
		Period:    period,
		StartDate: date,
		EndDate:   end.Add(-time.Nanosecond).In(loc).Format("2006-01-02"),
		UpdatedAt: time.Now().In(loc).Format("2006-01-02 15:04:05"),
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.statsLedger == nil {
		// Fallback for partially constructed services in tests.
		return s.statsBetweenFromTasksLocked(period, start, end, stats)
	}
	// Sum China-day buckets that fall in [start, end).
	for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
		key := day.Format("2006-01-02")
		bucket := s.statsLedger.Days[key]
		if bucket == nil {
			continue
		}
		stats.SuccessTasks += bucket.SuccessTasks
		stats.FailedTasks += bucket.FailedTasks
		stats.SuccessImages += bucket.SuccessImages
		stats.FailedImages += bucket.FailedImages
	}
	return stats
}

// statsBetweenFromTasksLocked is the legacy scan used only when no ledger is loaded.
func (s *ImageTaskService) statsBetweenFromTasksLocked(period string, start, end time.Time, stats ImageTaskDailyStats) ImageTaskDailyStats {
	loc := imageTaskStatsLocation()
	_ = period
	for _, task := range s.tasks {
		if task == nil || util.Clean(task.Mode) == "video" {
			continue
		}
		updated := parseTaskTimeInLocation(firstNonEmpty(util.Clean(task.UpdatedAt), util.Clean(task.CreatedAt)), loc)
		if updated.IsZero() || updated.Before(start) || !updated.Before(end) {
			continue
		}
		count := task.Count
		if count < 1 {
			count = 1
		}
		successImages := len(task.Data)
		switch util.Clean(task.Status) {
		case TaskStatusSuccess:
			stats.SuccessTasks++
			if successImages > 0 {
				stats.SuccessImages += successImages
			} else {
				stats.SuccessImages += count
			}
			if successImages > 0 && successImages < count {
				stats.FailedImages += count - successImages
			}
		case TaskStatusError:
			stats.FailedTasks++
			if successImages > 0 {
				stats.SuccessImages += successImages
			}
			failedImages := count - successImages
			if failedImages < 0 {
				failedImages = 0
			}
			stats.FailedImages += failedImages
		}
	}
	return stats
}

func parseTaskTime(value any) time.Time {
	parsed := parseTaskTimeInLocation(value, imageTaskStatsLocation())
	if !parsed.IsZero() {
		return parsed
	}
	return time.Unix(0, 0)
}

func parseTaskTimeInLocation(value any, loc *time.Location) time.Time {
	text := util.Clean(value)
	if text == "" {
		return time.Time{}
	}
	if loc == nil {
		loc = imageTaskStatsLocation()
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05.999999", "2006-01-02T15:04:05"} {
		if t, err := time.ParseInLocation(layout, text, loc); err == nil {
			return t
		}
	}
	if t, err := time.Parse(time.RFC3339Nano, text); err == nil {
		return t.In(loc)
	}
	return time.Time{}
}

func imageTaskStatsLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return loc
}
