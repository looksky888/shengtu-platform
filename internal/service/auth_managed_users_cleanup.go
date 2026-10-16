package service

import (
	"strings"
	"time"
)

// managedUserMatchesCleanup applies inactive-days and/or credit_max filters.
// creditAboveMax: user ids with balance > *CreditMax (from CreditService.IDsWithBalanceAbove).
// Missing id ⇒ balance 0 ⇒ not above max when max >= 0.
func managedUserMatchesCleanup(row managedUserLite, query AdminListQuery, creditAboveMax map[string]struct{}, now time.Time) bool {
	hasInactive := query.InactiveDaysMin > 0
	hasCredit := query.CreditMax != nil
	if !hasInactive && !hasCredit {
		return true
	}
	inactiveHit := false
	if hasInactive {
		inactiveHit = managedUserInactiveDays(row, now) >= query.InactiveDaysMin
	}
	creditHit := false
	if hasCredit {
		// bal <= max  ⇔  not (bal > max)
		_, above := creditAboveMax[row.ID]
		creditHit = !above
	}
	if hasInactive && hasCredit {
		if query.CleanupMatchAny {
			return inactiveHit || creditHit
		}
		return inactiveHit && creditHit
	}
	if hasInactive {
		return inactiveHit
	}
	return creditHit
}

// managedUserInactiveDays returns whole days since last activity.
// Never-active users (no timestamps) return a large value so they match "idle >= N".
func managedUserInactiveDays(row managedUserLite, now time.Time) int {
	if row.ActivityUnix > 0 {
		return inactiveDaysSinceUnix(row.ActivityUnix, now)
	}
	return inactiveDaysSince(row.LastUsedAt, row.CreatedAt, now)
}

func inactiveDaysSince(lastUsed, created string, now time.Time) int {
	return inactiveDaysSinceUnix(managedUserActivityUnix(lastUsed, created), now)
}

func inactiveDaysSinceUnix(activityUnix int64, now time.Time) int {
	if activityUnix == 0 {
		return 36500 // ~100y: treat as long-idle / never seen
	}
	last := time.Unix(activityUnix, 0)
	if last.After(now) {
		return 0
	}
	days := int(now.Sub(last).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}

func parseManagedUserTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "<nil>" {
		return time.Time{}
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, raw, time.Local); err == nil {
			return t
		}
		if t, err := time.Parse(layout, raw); err == nil {
			return t
		}
	}
	return time.Time{}
}
