package service

import (
	"testing"
	"time"
)

func TestImageTaskWallClockUsesBusinessTimeZone(t *testing.T) {
	loc := imageTaskStatsLocation()
	want := time.Date(2026, 8, 2, 12, 30, 0, 0, loc)
	if got := parseTaskTime("2026-08-02 12:30:00"); !got.Equal(want) {
		t.Fatalf("parseTaskTime() = %s, want %s", got, want)
	}
	got, err := parseTaskTimestamp("2026-08-02 12:30:00")
	if err != nil {
		t.Fatalf("parseTaskTimestamp() error = %v", err)
	}
	if !got.Equal(want) {
		t.Fatalf("parseTaskTimestamp() = %s, want %s", got, want)
	}
	if utc := got.UTC(); utc.Hour() != 4 || utc.Minute() != 30 {
		t.Fatalf("UTC conversion = %s, want 04:30", utc)
	}
}
