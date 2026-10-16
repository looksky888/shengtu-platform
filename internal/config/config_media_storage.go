package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func init() {
	for key, envKey := range map[string]string{
		"media_storage_provider":       "CHATGPT2API_MEDIA_STORAGE_PROVIDER",
		"media_auto_cleanup_enabled":   "CHATGPT2API_MEDIA_AUTO_CLEANUP_ENABLED",
		"media_r2_account_id":          "CHATGPT2API_MEDIA_R2_ACCOUNT_ID",
		"media_r2_access_key_id":       "CHATGPT2API_MEDIA_R2_ACCESS_KEY_ID",
		"media_r2_secret_access_key":   "CHATGPT2API_MEDIA_R2_SECRET_ACCESS_KEY",
		"media_r2_bucket":              "CHATGPT2API_MEDIA_R2_BUCKET",
		"media_r2_prefix":              "CHATGPT2API_MEDIA_R2_PREFIX",
		"media_r2_presign_ttl_seconds": "CHATGPT2API_MEDIA_R2_PRESIGN_TTL_SECONDS",
	} {
		settingEnvKeys[key] = envKey
	}
}

func validateMediaStorageUpdate(data map[string]any) error {
	if value, ok := data["media_storage_provider"]; ok {
		return validateMediaStorageProvider(value)
	}
	return nil
}

func skipMediaStorageSetting(key string, value any) bool {
	return key == "media_r2_secret_access_key_configured" ||
		key == "media_r2_secret_access_key" && strings.TrimSpace(fmt.Sprint(value)) == ""
}

func normalizeMediaStorageProvider(value any) string {
	if strings.EqualFold(strings.TrimSpace(fmt.Sprint(value)), "r2") {
		return "r2"
	}
	return "local"
}

func validateMediaStorageProvider(value any) error {
	switch strings.ToLower(strings.TrimSpace(fmt.Sprint(value))) {
	case "", "local", "r2":
		return nil
	default:
		return errors.New("媒体存储类型仅支持 local 或 r2")
	}
}

func normalizeMediaR2Prefix(value any) string {
	prefix := strings.Trim(strings.ReplaceAll(strings.TrimSpace(fmt.Sprint(value)), `\`, "/"), "/")
	if prefix == "" {
		return "shengtu-media"
	}
	return prefix
}

func validateMediaR2Prefix(value any) error {
	prefix := normalizeMediaR2Prefix(value)
	for _, part := range strings.Split(prefix, "/") {
		if part == "" || part == "." || part == ".." {
			return errors.New("R2 对象前缀包含无效路径段")
		}
	}
	return nil
}

func (s *Store) MediaStorageProvider() string {
	return normalizeMediaStorageProvider(s.settingValue("media_storage_provider", "local"))
}

func (s *Store) MediaAutoCleanupEnabled() bool {
	if s.MediaStorageProvider() != "local" {
		return false
	}
	return util.ToBool(s.settingValue("media_auto_cleanup_enabled", true))
}

func (s *Store) MediaR2AccountID() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("media_r2_account_id", "")))
}

func (s *Store) MediaR2AccessKeyID() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("media_r2_access_key_id", "")))
}

func (s *Store) MediaR2SecretAccessKey() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("media_r2_secret_access_key", "")))
}

func (s *Store) MediaR2Bucket() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("media_r2_bucket", "")))
}

func (s *Store) MediaR2Prefix() string {
	return normalizeMediaR2Prefix(s.settingValue("media_r2_prefix", "shengtu-media"))
}

func (s *Store) MediaR2PresignTTLSeconds() int {
	return clampInt(intSetting(s.settingValue("media_r2_presign_ttl_seconds", 300), 300), 60, 3600)
}

func (s *Store) MediaSpoolDir() string {
	return filepath.Join(s.DataDir, "media-spool")
}

func (s *Store) populateMediaStorageSettings(data map[string]any) {
	data["media_storage_provider"] = s.MediaStorageProvider()
	data["media_auto_cleanup_enabled"] = s.MediaAutoCleanupEnabled()
	data["media_r2_account_id"] = s.MediaR2AccountID()
	data["media_r2_access_key_id"] = s.MediaR2AccessKeyID()
	data["media_r2_secret_access_key_configured"] = s.MediaR2SecretAccessKey() != ""
	data["media_r2_bucket"] = s.MediaR2Bucket()
	data["media_r2_prefix"] = s.MediaR2Prefix()
	data["media_r2_presign_ttl_seconds"] = s.MediaR2PresignTTLSeconds()
}

func normalizeMediaStorageSettings(data map[string]any) {
	data["media_storage_provider"] = normalizeMediaStorageProvider(util.ValueOr(data["media_storage_provider"], "local"))
	data["media_auto_cleanup_enabled"] = util.ToBool(util.ValueOr(data["media_auto_cleanup_enabled"], data["media_storage_provider"] == "local"))
	data["media_r2_account_id"] = strings.TrimSpace(fmt.Sprint(util.ValueOr(data["media_r2_account_id"], "")))
	data["media_r2_access_key_id"] = strings.TrimSpace(fmt.Sprint(util.ValueOr(data["media_r2_access_key_id"], "")))
	data["media_r2_bucket"] = strings.TrimSpace(fmt.Sprint(util.ValueOr(data["media_r2_bucket"], "")))
	data["media_r2_prefix"] = normalizeMediaR2Prefix(util.ValueOr(data["media_r2_prefix"], "shengtu-media"))
	data["media_r2_presign_ttl_seconds"] = clampInt(intSetting(util.ValueOr(data["media_r2_presign_ttl_seconds"], 300), 300), 60, 3600)
}

func (s *Store) validateMediaStorageSettings(data map[string]any) error {
	if normalizeMediaStorageProvider(data["media_storage_provider"]) != "r2" {
		return nil
	}
	values := []string{
		strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "media_r2_account_id", ""))),
		strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "media_r2_access_key_id", ""))),
		strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "media_r2_secret_access_key", ""))),
		strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "media_r2_bucket", ""))),
	}
	for _, value := range values {
		if value == "" {
			return errors.New("启用 R2 媒体存储时需完整填写 Account ID、Access Key ID、Secret Access Key 和 Bucket")
		}
	}
	return validateMediaR2Prefix(data["media_r2_prefix"])
}

func (s *Store) CleanupOldImages() int {
	// The retention cleanup owns local-only media. R2 cleanup is a separate,
	// migration-aware workflow that verifies the remote object before removal.
	if s.MediaStorageProvider() != "local" || !s.MediaAutoCleanupEnabled() {
		return 0
	}
	cutoff := time.Now().Add(-time.Duration(s.ImageRetentionDays()) * 24 * time.Hour)
	removed := 0
	for _, dir := range []string{s.ImagesDir(), s.ImageThumbnailsDir(), s.ImageMetadataDir()} {
		_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			info, statErr := d.Info()
			if statErr == nil && info.ModTime().Before(cutoff) {
				if os.Remove(path) == nil {
					removed++
				}
			}
			return nil
		})
		removeEmptyDirs(dir)
	}
	return removed
}
