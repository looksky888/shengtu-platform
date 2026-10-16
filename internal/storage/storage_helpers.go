package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// loadJSONListStrict returns an empty list when the file is missing.
// Corrupt / unreadable files return an error (never silently empty).
func loadJSONListStrict(path string) ([]map[string]any, error) {
	raw, err := loadJSONValueStrict(path)
	if err != nil {
		return nil, err
	}
	if raw == nil {
		return []map[string]any{}, nil
	}
	return anyListToMaps(raw), nil
}

// loadJSONValueStrict distinguishes missing file (nil, nil) from I/O or parse errors.
func loadJSONValueStrict(path string) (any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil, nil
	}
	out, err := decodeJSONBytes(data)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return out, nil
}

func saveJSONValue(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return AtomicWriteFile(path, append(data, '\n'), 0o644)
}

func anyListToMaps(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return []map[string]any{}
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func cleanDocumentName(name string) (string, error) {
	raw := strings.TrimSpace(filepath.ToSlash(name))
	rel := path.Clean(raw)
	if raw != rel || rel == "." || rel == "" || strings.HasPrefix(rel, "../") || strings.HasPrefix(rel, "/") || strings.ContainsRune(rel, 0) || filepath.IsAbs(filepath.FromSlash(rel)) {
		return "", fmt.Errorf("invalid document name: %s", name)
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." || strings.Contains(part, ":") {
			return "", fmt.Errorf("invalid document name: %s", name)
		}
	}
	return rel, nil
}

func decodeJSONString(text string) (any, error) {
	return decodeJSONBytes([]byte(text))
}

func decodeJSONBytes(data []byte) (any, error) {
	var out any
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.UseNumber()
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return nil, fmt.Errorf("invalid trailing JSON data")
	}
	return out, nil
}

func decodeLogLine(line string) (map[string]any, bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, false
	}
	raw, err := decodeJSONString(line)
	if err != nil {
		return nil, false
	}
	item, ok := raw.(map[string]any)
	return item, ok
}

func matchLogFilter(item map[string]any, startDate, endDate string) bool {
	day := logDay(strings.TrimSpace(fmt.Sprint(item["time"])))
	if strings.TrimSpace(startDate) != "" && day < strings.TrimSpace(startDate) {
		return false
	}
	if strings.TrimSpace(endDate) != "" && day > strings.TrimSpace(endDate) {
		return false
	}
	return true
}

func logDay(value string) string {
	if len(value) < 10 {
		return ""
	}
	return value[:10]
}

func removeEmptyParentDirs(root, start string) {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return
	}
	current, err := filepath.Abs(start)
	if err != nil {
		return
	}
	for current != rootAbs {
		rel, err := filepath.Rel(rootAbs, current)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
			return
		}
		if err := os.Remove(current); err != nil && !errors.Is(err, os.ErrNotExist) {
			return
		}
		current = filepath.Dir(current)
	}
}

func parseDatabaseURL(databaseURL string) (driver, dsn string, err error) {
	lower := strings.ToLower(databaseURL)
	switch {
	case strings.HasPrefix(lower, "sqlite:///"):
		return "sqlite", strings.TrimPrefix(databaseURL, "sqlite:///"), nil
	case strings.HasPrefix(lower, "sqlite://"):
		return "sqlite", strings.TrimPrefix(databaseURL, "sqlite://"), nil
	case strings.HasPrefix(lower, "postgresql://"), strings.HasPrefix(lower, "postgres://"):
		return "postgres", databaseURL, nil
	case strings.HasPrefix(lower, "mysql://"):
		u, parseErr := url.Parse(databaseURL)
		if parseErr != nil {
			return "", "", parseErr
		}
		pass, _ := u.User.Password()
		user := u.User.Username()
		db := strings.TrimPrefix(u.Path, "/")
		return "mysql", fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true", user, pass, u.Host, db), nil
	default:
		if strings.Contains(lower, "postgres") {
			return "postgres", databaseURL, nil
		}
		return "sqlite", databaseURL, nil
	}
}

func maskPassword(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.User == nil {
		return raw
	}
	username := u.User.Username()
	if _, ok := u.User.Password(); ok {
		u.User = url.UserPassword(username, "****")
	}
	return u.String()
}
