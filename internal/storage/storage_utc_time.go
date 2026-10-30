package storage

import (
	"strings"
	"time"
)

const utcFixedNanoLayout = "2006-01-02T15:04:05.000000000Z"

// formatUTCZeroNanoBound formats a UTC range bound so exact-second boundaries
// (0 nanoseconds) include ".000000000Z". In ASCII, '.' (46) < 'Z' (90), so
// against a raw RFC3339/RFC3339Nano column:
//   - "T16:00:00Z"     >= "T16:00:00.000000000Z" is true  ('Z' > '.')
//   - "T16:00:00.001Z" >= "T16:00:00.000000000Z" is true  ('1' > '0')
//   - "T15:59:59.999Z" <  "T16:00:00.000000000Z" is true  ('15' < '16')
//   - "T16:00:00Z"     <  "T16:00:00.000000000Z" is false ('Z' > '.')
//   - "T16:00:00.001Z" <  "T16:00:00.000000000Z" is false ('1' > '0')
// This keeps raw column range predicates index-friendly while eliminating the
// 00:00:00.001-00:00:00.999 cross-day boundary bug.
func formatUTCZeroNanoBound(t time.Time) string {
	utc := t.UTC()
	if utc.Nanosecond() == 0 {
		return utc.Format(utcFixedNanoLayout)
	}
	return utc.Format(utcFixedNanoLayout)
}

func normalizeUTCZeroNanoBoundString(value string) string {
	value = strings.TrimSpace(value)
	if !strings.HasSuffix(value, "Z") {
		return value
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return value
	}
	return parsed.UTC().Format(utcFixedNanoLayout)
}

func normalizeUTCSortableISO(value string) string {
	return normalizeUTCZeroNanoBoundString(value)
}

func compareTimestampStrings(left, right string) int {
	left = strings.TrimSpace(left)
	right = strings.TrimSpace(right)
	lt, lErr := time.Parse(time.RFC3339Nano, left)
	rt, rErr := time.Parse(time.RFC3339Nano, right)
	if lErr == nil && rErr == nil {
		if lt.Before(rt) {
			return -1
		}
		if lt.After(rt) {
			return 1
		}
		return 0
	}
	return strings.Compare(left, right)
}

func (b *DatabaseBackend) sqlConcat(parts ...string) string {
	if len(parts) == 0 {
		return "''"
	}
	if b != nil && b.driver == "mysql" {
		return "CONCAT(" + strings.Join(parts, ", ") + ")"
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// utcSortableExpr normalizes UTC RFC3339/RFC3339Nano SQL text values ending in
// 'Z' to fixed 30-character "YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ" strings so '<',
// '<=', '>', and '>=' match chronological order down to the nanosecond.
func (b *DatabaseBackend) utcSortableExpr(col string) string {
	wholeToFixed := b.sqlConcat("SUBSTR("+col+", 1, 19)", "'.000000000Z'")
	fracPadded := b.sqlConcat("SUBSTR("+col+", 1, LENGTH("+col+") - 1)", "'000000000'")
	fracToFixed := b.sqlConcat("SUBSTR("+fracPadded+", 1, 29)", "'Z'")
	return `CASE WHEN LENGTH(` + col + `) = 20 AND SUBSTR(` + col + `, 20, 1) = 'Z' THEN ` + wholeToFixed +
		` WHEN LENGTH(` + col + `) > 20 AND SUBSTR(` + col + `, 20, 1) = '.' AND SUBSTR(` + col + `, LENGTH(` + col + `), 1) = 'Z' THEN ` + fracToFixed +
		` ELSE ` + col + ` END`
}
