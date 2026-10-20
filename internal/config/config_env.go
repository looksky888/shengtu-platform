package config

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const settingsEnvFileKey = "CHATGPT2API_SETTINGS_ENV_FILE"

func resolveSettingsEnvFile(root string) (string, bool, error) {
	configured := strings.TrimSpace(os.Getenv(settingsEnvFileKey))
	if configured == "" {
		return filepath.Join(root, ".env"), false, nil
	}
	path, err := filepath.Abs(configured)
	if err != nil {
		return "", true, fmt.Errorf("解析设置持久化文件: %w", err)
	}
	return path, true, nil
}

func (s *Store) saveLocked() error {
	updates := map[string]string{}
	keys := make([]string, 0, len(settingEnvKeys))
	for key := range settingEnvKeys {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if value, ok := s.data[key]; ok {
			updates[settingEnvKeys[key]] = stringifyEnvValue(value)
		}
	}
	if err := writeEnvUpdates(s.EnvFile, updates); err != nil {
		return err
	}
	for key, value := range updates {
		if _, external := s.externalEnvKeys[key]; !external {
			_ = os.Setenv(key, value)
		}
	}
	return nil
}

func (s *Store) loadEnvFile() {
	for key, value := range readEnvObject(s.EnvFile) {
		if isManagedSettingEnvKey(key) {
			if _, external := s.externalEnvKeys[key]; !external {
				_ = os.Setenv(key, value)
			}
			continue
		}
		if _, ok := os.LookupEnv(key); !ok {
			_ = os.Setenv(key, value)
		}
	}
}

func isManagedSettingEnvKey(envKey string) bool {
	for _, candidate := range settingEnvKeys {
		if candidate == envKey {
			return true
		}
	}
	return false
}

// ManagedSettingEnvKeys returns process env keys that config.Update may write (for test isolation).
func ManagedSettingEnvKeys() []string {
	out := make([]string, 0, len(settingEnvKeys))
	for _, key := range settingEnvKeys {
		out = append(out, key)
	}
	return out
}

func settingsFromEnvValues(values map[string]string) map[string]any {
	settings := map[string]any{}
	for settingKey, envKey := range settingEnvKeys {
		if value, ok := values[envKey]; ok {
			settings[settingKey] = value
		}
	}
	return settings
}

func readEnvObject(path string) map[string]string {
	data, err := os.ReadFile(path)
	if err != nil {
		if info, statErr := os.Stat(path); statErr == nil && info.IsDir() {
			fmt.Fprintf(os.Stderr, "Warning: .env at %q is a directory, ignoring it.\n", path)
		}
		return map[string]string{}
	}
	result := map[string]string{}
	for _, line := range strings.Split(string(data), "\n") {
		key, value, ok := parseEnvAssignment(line)
		if ok {
			result[key] = value
		}
	}
	return result
}

func parseEnvAssignment(line string) (string, string, bool) {
	stripped := strings.TrimSpace(line)
	if stripped == "" || strings.HasPrefix(stripped, "#") {
		return "", "", false
	}
	stripped = strings.TrimSpace(strings.TrimPrefix(stripped, "export "))
	key, value, ok := strings.Cut(stripped, "=")
	if !ok {
		return "", "", false
	}
	key = strings.TrimSpace(key)
	if !envKeyRE.MatchString(key) {
		return "", "", false
	}
	return key, unquoteEnvValue(value), true
}

func unquoteEnvValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 && value[0] == value[len(value)-1] && (value[0] == '"' || value[0] == '\'') {
		inner := value[1 : len(value)-1]
		if value[0] == '"' {
			inner = strings.ReplaceAll(inner, `\n`, "\n")
			inner = strings.ReplaceAll(inner, `\r`, "\r")
			inner = strings.ReplaceAll(inner, `\t`, "\t")
			inner = strings.ReplaceAll(inner, `\"`, `"`)
			inner = strings.ReplaceAll(inner, `\\`, `\`)
		}
		return inner
	}
	for index, char := range value {
		if char == '#' && (index == 0 || value[index-1] == ' ' || value[index-1] == '\t') {
			return strings.TrimRight(value[:index], " \t")
		}
	}
	return value
}

func stringifyEnvValue(value any) string {
	switch v := value.(type) {
	case bool:
		if v {
			return "true"
		}
		return "false"
	case []string:
		return strings.Join(v, ",")
	case []any:
		if anySliceNeedsJSON(v) {
			if data, err := json.Marshal(v); err == nil {
				return string(data)
			}
			return ""
		}
		items := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(fmt.Sprint(item)); s != "" {
				items = append(items, s)
			}
		}
		return strings.Join(items, ",")
	case map[string]any:
		if data, err := json.Marshal(v); err == nil {
			return string(data)
		}
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(util.ValueOr(value, "")))
	}
}

func writeEnvUpdates(path string, updates map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	var lines []string
	if data, err := os.ReadFile(path); err == nil {
		lines = strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
	}
	pending := map[string]string{}
	for key, value := range updates {
		pending[key] = value
	}
	next := make([]string, 0, len(lines)+len(updates)+1)
	for _, line := range lines {
		key, _, ok := parseEnvAssignment(line)
		if ok {
			if value, exists := pending[key]; exists {
				next = append(next, formatEnvAssignment(key, value))
				delete(pending, key)
				continue
			}
		}
		next = append(next, line)
	}
	if len(pending) > 0 {
		if len(next) > 0 && strings.TrimSpace(next[len(next)-1]) != "" {
			next = append(next, "")
		}
		keys := make([]string, 0, len(pending))
		for key := range pending {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			next = append(next, formatEnvAssignment(key, pending[key]))
		}
	}
	payload := []byte(strings.TrimRight(strings.Join(next, "\n"), "\n") + "\n")
	return storage.AtomicWriteFile(path, payload, settingsEnvFilePermission(path))
}

// settingsEnvFilePermission keeps the settings document owner-only. It holds
// upstream API keys, R2 secrets and the internal service token, so an existing
// owner-only mode is preserved exactly (e.g. 0400/0600) and anything readable by
// group or others — including a brand new file — is written as 0o600.
func settingsEnvFilePermission(path string) os.FileMode {
	info, err := os.Stat(path)
	if err != nil {
		return settingsEnvPermission(0, false)
	}
	mode := info.Mode().Perm()
	permission := settingsEnvPermission(mode, true)
	if permission != mode {
		log.Printf("settings env file %s had mode %#o; rewriting as %#o because it stores secrets", path, mode, permission)
	}
	return permission
}

// settingsEnvPermission is the pure widening decision behind settingsEnvFilePermission.
func settingsEnvPermission(mode os.FileMode, exists bool) os.FileMode {
	const ownerOnly os.FileMode = 0o600
	if !exists || mode == 0 || mode&0o077 != 0 {
		return ownerOnly
	}
	return mode
}

func formatEnvAssignment(key, value string) string {
	return key + "=" + formatEnvValue(value)
}

func formatEnvValue(value string) string {
	if value == "" {
		return ""
	}
	if regexp.MustCompile(`^[A-Za-z0-9_./:@%+\-,]*$`).MatchString(value) {
		return value
	}
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	return `"` + value + `"`
}

func removeEmptyDirs(root string) {
	var dirs []string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err == nil && d.IsDir() && path != root {
			dirs = append(dirs, path)
		}
		return nil
	})
	sort.Slice(dirs, func(i, j int) bool { return len(dirs[i]) > len(dirs[j]) })
	for _, dir := range dirs {
		_ = os.Remove(dir)
	}
}

func anySliceNeedsJSON(values []any) bool {
	for _, value := range values {
		switch value.(type) {
		case map[string]any, []any, []map[string]any:
			return true
		}
	}
	return false
}
