package service

import (
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (s *BackupService) load() bool {
	value, err := loadStoredJSONWithError(s.store, s.docName, s.path)
	if err != nil {
		return false
	}
	raw := util.StringMap(value)
	s.config = normalizeBackupConfigStruct(backupConfigFromMap(util.StringMap(raw["config"])))
	s.state = backupStateFromMap(util.StringMap(raw["state"]))
	return true
}

func (s *BackupService) saveLocked() error {
	if !s.storeReady {
		return fmt.Errorf("备份配置未成功加载，已拒绝写入以防清空存储")
	}
	return saveStoredJSON(s.store, s.docName, s.path, map[string]any{"config": s.config, "state": s.state})
}

func parseBackupTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}
