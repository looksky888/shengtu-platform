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

func billDateRange(value string) (string, string) {
	location := time.FixedZone("CST", 8*60*60)
	parsed, _ := time.ParseInLocation("2006-01-02", value, location)
	return parsed.Format(time.RFC3339), parsed.AddDate(0, 0, 1).Format(time.RFC3339)
}
