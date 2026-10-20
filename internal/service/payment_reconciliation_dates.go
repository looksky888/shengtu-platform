package service

import (
	"errors"
	"time"
)

func validateBillDate(value string) error {
	if len(value) != 10 || value[4] != '-' || value[7] != '-' {
		return errors.New("账单日期必须为 YYYY-MM-DD")
	}
	if _, err := time.Parse("2006-01-02", value); err != nil {
		return errors.New("账单日期无效")
	}
	return nil
}

func validateBillDateForNow(value string, now time.Time) error {
	if err := validateBillDate(value); err != nil {
		return err
	}
	location := time.FixedZone("CST", 8*60*60)
	date, _ := time.ParseInLocation("2006-01-02", value, location)
	today := now.In(location)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, location)
	if !date.Before(today) {
		return errors.New("账单日期必须早于今天")
	}
	if date.Before(today.AddDate(0, -3, 0)) {
		return errors.New("账单日期超过三个月范围")
	}
	return nil
}

// billDateRange returns the [start, end) window of a CST (UTC+8) bill date.
// paid_at is persisted as UTC RFC3339Nano and the window is compared with SQL
// string operators, so both bounds must be rendered in UTC: a "+08:00" bound
// sorts after every "Z" timestamp of the same instant and would push the
// 00:00-08:00 orders of a day into the neighbouring day's window.
func billDateRange(value string) (string, string) {
	location := time.FixedZone("CST", 8*60*60)
	parsed, _ := time.ParseInLocation("2006-01-02", value, location)
	return parsed.UTC().Format(time.RFC3339), parsed.AddDate(0, 0, 1).UTC().Format(time.RFC3339)
}
