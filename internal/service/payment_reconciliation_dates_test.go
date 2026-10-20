package service

import (
	"testing"
	"time"
)

// TestBillDateRangeUsesUTCBounds pins the audit finding: paid_at is persisted as
// UTC RFC3339Nano and the window is compared with SQL string operators, so a
// "+08:00" bound excludes the CST 00:00-08:00 orders of its own day.
func TestBillDateRangeUsesUTCBounds(t *testing.T) {
	for _, tc := range []struct {
		date      string
		wantStart string
		wantEnd   string
	}{
		{date: "2025-01-01", wantStart: "2024-12-31T16:00:00Z", wantEnd: "2025-01-01T16:00:00Z"},
		{date: "2025-03-01", wantStart: "2025-02-28T16:00:00Z", wantEnd: "2025-03-01T16:00:00Z"},
		{date: "2025-12-31", wantStart: "2025-12-30T16:00:00Z", wantEnd: "2025-12-31T16:00:00Z"},
	} {
		t.Run(tc.date, func(t *testing.T) {
			start, end := billDateRange(tc.date)
			if start != tc.wantStart || end != tc.wantEnd {
				t.Fatalf("billDateRange(%q) = (%q, %q), want (%q, %q)", tc.date, start, end, tc.wantStart, tc.wantEnd)
			}
		})
	}
}

// TestBillDateRangeKeepsEarlyMorningCSTOrdersInTheirDay compares the persisted
// paid_at strings against the window the same way the SQL does, which is what
// moved the CST 00:00-08:00 orders into the neighbouring day's bill.
func TestBillDateRangeKeepsEarlyMorningCSTOrdersInTheirDay(t *testing.T) {
	cst := time.FixedZone("CST", 8*60*60)
	start, end := billDateRange("2025-01-01")
	for _, tc := range []struct {
		name  string
		paid  time.Time
		inner bool
	}{
		{name: "00:30 CST belongs to the bill date", paid: time.Date(2025, 1, 1, 0, 30, 0, 0, cst), inner: true},
		{name: "07:59 CST belongs to the bill date", paid: time.Date(2025, 1, 1, 7, 59, 59, 0, cst), inner: true},
		{name: "12:00 CST belongs to the bill date", paid: time.Date(2025, 1, 1, 12, 0, 0, 0, cst), inner: true},
		{name: "23:59 CST belongs to the bill date", paid: time.Date(2025, 1, 1, 23, 59, 59, 0, cst), inner: true},
		{name: "previous 23:30 CST belongs to the previous day", paid: time.Date(2024, 12, 31, 23, 30, 0, 0, cst)},
		{name: "next 00:00 CST belongs to the next day", paid: time.Date(2025, 1, 2, 0, 0, 0, 0, cst)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			paidAt := tc.paid.UTC().Format(time.RFC3339Nano)
			inside := paidAt >= start && paidAt < end
			if inside != tc.inner {
				t.Fatalf("paid_at %s compared against [%s, %s) = %v, want %v", paidAt, start, end, inside, tc.inner)
			}
		})
	}
}
