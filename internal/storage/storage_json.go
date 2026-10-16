package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type JSONBackend struct {
	dataDir      string
	filePath     string
	authKeysPath string
	mu           sync.Mutex
}

func NewJSONBackend(filePath, authKeysPath string) *JSONBackend {
	_ = os.MkdirAll(filepath.Dir(filePath), 0o755)
	_ = os.MkdirAll(filepath.Dir(authKeysPath), 0o755)
	return &JSONBackend{dataDir: filepath.Dir(filePath), filePath: filePath, authKeysPath: authKeysPath}
}

func (b *JSONBackend) LoadAccounts() ([]map[string]any, error) {
	return loadJSONListStrict(b.filePath)
}

func (b *JSONBackend) SaveAccounts(accounts []map[string]any) error {
	return saveJSONValue(b.filePath, accounts)
}

func (b *JSONBackend) LoadAuthKeys() ([]map[string]any, error) {
	raw, err := loadJSONValueStrict(b.authKeysPath)
	if err != nil {
		return nil, err
	}
	if obj, ok := raw.(map[string]any); ok {
		raw = obj["items"]
	}
	if raw == nil {
		return []map[string]any{}, nil
	}
	return anyListToMaps(raw), nil
}

func (b *JSONBackend) SaveAuthKeys(keys []map[string]any) error {
	return saveJSONValue(b.authKeysPath, map[string]any{"items": keys})
}

// UpsertAuthKey rewrites the auth_keys JSON document with one key replaced (JSON backend has no row API).
func (b *JSONBackend) UpsertAuthKey(keyID string, data map[string]any) error {
	keyID = strings.TrimSpace(keyID)
	if keyID == "" || data == nil {
		return fmt.Errorf("invalid auth key upsert")
	}
	keys, err := b.LoadAuthKeys()
	if err != nil {
		return err
	}
	found := false
	for i, item := range keys {
		if strings.TrimSpace(fmt.Sprint(item["id"])) == keyID {
			keys[i] = data
			found = true
			break
		}
	}
	if !found {
		keys = append(keys, data)
	}
	return b.SaveAuthKeys(keys)
}

// UpsertAccount rewrites accounts.json with one account replaced.
func (b *JSONBackend) UpsertAccount(accessToken string, data map[string]any) error {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" || data == nil {
		return fmt.Errorf("invalid account upsert")
	}
	accounts, err := b.LoadAccounts()
	if err != nil {
		return err
	}
	found := false
	for i, item := range accounts {
		if strings.TrimSpace(fmt.Sprint(item["access_token"])) == accessToken {
			accounts[i] = data
			found = true
			break
		}
	}
	if !found {
		accounts = append(accounts, data)
	}
	return b.SaveAccounts(accounts)
}

// DeleteAccount removes one account from accounts.json (full rewrite of the JSON file).
func (b *JSONBackend) DeleteAccount(accessToken string) error {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return fmt.Errorf("invalid account delete")
	}
	accounts, err := b.LoadAccounts()
	if err != nil {
		return err
	}
	next := make([]map[string]any, 0, len(accounts))
	for _, item := range accounts {
		if strings.TrimSpace(fmt.Sprint(item["access_token"])) == accessToken {
			continue
		}
		next = append(next, item)
	}
	return b.SaveAccounts(next)
}

func (b *JSONBackend) HealthCheck() BackendHealth {
	if _, err := os.Stat(b.filePath); err != nil && !os.IsNotExist(err) {
		return BackendHealth{Status: "unhealthy", Backend: "json", Error: err.Error()}
	}
	return BackendHealth{
		Status:             "healthy",
		Backend:            "json",
		FileExists:         ptrBool(exists(b.filePath)),
		FilePath:           b.filePath,
		AuthKeysFileExists: ptrBool(exists(b.authKeysPath)),
		AuthKeysFilePath:   b.authKeysPath,
	}
}

func (b *JSONBackend) Info() BackendInfo {
	return BackendInfo{
		Type:               "json",
		Description:        "本地 JSON 文件存储",
		FilePath:           b.filePath,
		FileExists:         ptrBool(exists(b.filePath)),
		AuthKeysFilePath:   b.authKeysPath,
		AuthKeysFileExists: ptrBool(exists(b.authKeysPath)),
	}
}

func (b *JSONBackend) LoadJSONDocument(name string) (any, error) {
	full, err := b.documentPath(name)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(full)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return decodeJSONBytes(data)
}

func (b *JSONBackend) SaveJSONDocument(name string, value any) error {
	full, err := b.documentPath(name)
	if err != nil {
		return err
	}
	return saveJSONValue(full, value)
}

func (b *JSONBackend) DeleteJSONDocument(name string) error {
	full, err := b.documentPath(name)
	if err != nil {
		return err
	}
	removeErr := os.Remove(full)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return removeErr
	}
	removeEmptyParentDirs(b.dataDir, filepath.Dir(full))
	return nil
}

func (b *JSONBackend) AppendLog(item map[string]any) error {
	if item == nil {
		item = map[string]any{}
	}
	item["type"] = "event"
	full, err := b.documentPath(LogEventsDocumentName)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(item)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(full, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(append(data, '\n'))
	return err
}

func (b *JSONBackend) QueryLogs(startDate, endDate string, limit int) ([]map[string]any, error) {
	full, err := b.documentPath(LogEventsDocumentName)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(full)
	if errors.Is(err, os.ErrNotExist) {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 1 && strings.TrimSpace(lines[0]) == "" {
		return []map[string]any{}, nil
	}
	out := make([]map[string]any, 0)
	for i := len(lines) - 1; i >= 0; i-- {
		if limit > 0 && len(out) >= limit {
			break
		}
		item, ok := decodeLogLine(lines[i])
		if !ok || !matchLogFilter(item, startDate, endDate) {
			continue
		}
		out = append(out, item)
	}
	return out, nil
}

func (b *JSONBackend) DeleteLogsBefore(day string) (int, error) {
	day = strings.TrimSpace(day)
	if day == "" {
		return 0, nil
	}
	full, err := b.documentPath(LogEventsDocumentName)
	if err != nil {
		return 0, err
	}
	data, err := os.ReadFile(full)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	lines := strings.Split(strings.TrimRight(string(data), "\r\n"), "\n")
	kept := make([]string, 0, len(lines))
	removed := 0
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		item, ok := decodeLogLine(line)
		if ok {
			itemDay := logDay(strings.TrimSpace(fmt.Sprint(item["time"])))
			if itemDay != "" && itemDay < day {
				removed++
				continue
			}
		}
		kept = append(kept, line)
	}
	if removed == 0 {
		return 0, nil
	}
	next := []byte{}
	if len(kept) > 0 {
		next = []byte(strings.Join(kept, "\n") + "\n")
	}
	if err := AtomicWriteFile(full, next, 0o644); err != nil {
		return 0, err
	}
	return removed, nil
}

func (b *JSONBackend) documentPath(name string) (string, error) {
	rel, err := cleanDocumentName(name)
	if err != nil {
		return "", err
	}
	full := filepath.Join(b.dataDir, filepath.FromSlash(rel))
	root, err := filepath.Abs(b.dataDir)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if resolved != root {
		relToRoot, err := filepath.Rel(root, resolved)
		if err != nil || relToRoot == ".." || strings.HasPrefix(relToRoot, ".."+string(filepath.Separator)) || filepath.IsAbs(relToRoot) {
			return "", fmt.Errorf("invalid document name: %s", name)
		}
	}
	return full, nil
}
