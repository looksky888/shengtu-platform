package storage

import (
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func mediaNowISO() string {
	return util.NowISO()
}

func mediaDateStart(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := time.ParseInLocation("2006-01-02", value, time.FixedZone("CST", 8*60*60))
	if err != nil {
		return value
	}
	return parsed.Format(time.RFC3339Nano)
}

func mediaDateEndExclusive(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := time.ParseInLocation("2006-01-02", value, time.FixedZone("CST", 8*60*60))
	if err != nil {
		return value
	}
	return parsed.AddDate(0, 0, 1).Format(time.RFC3339Nano)
}
