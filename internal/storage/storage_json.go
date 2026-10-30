package storage

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type JSONBackend struct {
	dataDir      string
	filePath     string
	authKeysPath string
	initErr      error
	mu           sync.Mutex
}

func NewJSONBackend(filePath, authKeysPath string) *JSONBackend {
	var initErr error
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		initErr = fmt.Errorf("创建 JSON 数据目录: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(authKeysPath), 0o755); err != nil && initErr == nil {
		initErr = fmt.Errorf("创建认证密钥目录: %w", err)
	}
	return &JSONBackend{dataDir: filepath.Dir(filePath), filePath: filePath, authKeysPath: authKeysPath, initErr: initErr}
}

func (b *JSONBackend) LoadAccounts() ([]map[string]any, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.loadAccountsLocked()
}

func (b *JSONBackend) loadAccountsLocked() ([]map[string]any, error) {
	return loadJSONListStrict(b.filePath)
}

func (b *JSONBackend) SaveAccounts(accounts []map[string]any) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.saveAccountsLocked(accounts)
}

func (b *JSONBackend) saveAccountsLocked(accounts []map[string]any) error {
	return saveJSONValue(b.filePath, accounts)
}

func (b *JSONBackend) LoadAuthKeys() ([]map[string]any, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.loadAuthKeysLocked()
}

func (b *JSONBackend) loadAuthKeysLocked() ([]map[string]any, error) {
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
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.saveAuthKeysLocked(keys)
}

func (b *JSONBackend) saveAuthKeysLocked(keys []map[string]any) error {
	return saveJSONValue(b.authKeysPath, map[string]any{"items": keys})
}

// UpsertAuthKey rewrites the auth_keys JSON document with one key replaced (JSON backend has no row API).
func (b *JSONBackend) UpsertAuthKey(keyID string, data map[string]any) error {
	keyID = strings.TrimSpace(keyID)
	if keyID == "" || data == nil {
		return fmt.Errorf("invalid auth key upsert")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	keys, err := b.loadAuthKeysLocked()
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
	return b.saveAuthKeysLocked(keys)
}

// UpsertAccount rewrites accounts.json with one account replaced.
func (b *JSONBackend) UpsertAccount(accessToken string, data map[string]any) error {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" || data == nil {
		return fmt.Errorf("invalid account upsert")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	accounts, err := b.loadAccountsLocked()
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
	return b.saveAccountsLocked(accounts)
}

// DeleteAccount removes one account from accounts.json (full rewrite of the JSON file).
func (b *JSONBackend) DeleteAccount(accessToken string) error {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return fmt.Errorf("invalid account delete")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	accounts, err := b.loadAccountsLocked()
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
	return b.saveAccountsLocked(next)
}

func (b *JSONBackend) HealthCheck() BackendHealth {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.initErr != nil {
		return BackendHealth{Status: "unhealthy", Backend: "json", Error: b.initErr.Error(), FilePath: b.filePath, AuthKeysFilePath: b.authKeysPath}
	}
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
	b.mu.Lock()
	defer b.mu.Unlock()
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
	b.mu.Lock()
	defer b.mu.Unlock()
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
	b.mu.Lock()
	defer b.mu.Unlock()
	full, err := b.documentPath(name)
	if err != nil {
		return err
	}
	return saveJSONValue(full, value)
}

func (b *JSONBackend) DeleteJSONDocument(name string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
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

func (b *JSONBackend) ListJSONDocumentNamesByPrefix(prefix string) ([]string, error) {
	trimmed := strings.TrimSuffix(strings.TrimSpace(prefix), "/")
	dirPath, err := b.documentPath(trimmed)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, statErr := os.Stat(dirPath); errors.Is(statErr, os.ErrNotExist) {
		return []string{}, nil
	} else if statErr != nil {
		return nil, statErr
	}
	rootAbs, err := filepath.Abs(b.dataDir)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0)
	walkErr := filepath.WalkDir(dirPath, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(rootAbs, path)
		if relErr != nil {
			return nil
		}
		out = append(out, filepath.ToSlash(rel))
		return nil
	})
	return out, walkErr
}

func (b *JSONBackend) DeleteJSONDocumentsBatch(names []string) (int, error) {
	if len(names) == 0 {
		return 0, nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	removed := 0
	for _, name := range names {
		full, err := b.documentPath(name)
		if err != nil {
			continue
		}
		if err := os.Remove(full); err == nil {
			removed++
			removeEmptyParentDirs(b.dataDir, filepath.Dir(full))
		} else if !errors.Is(err, os.ErrNotExist) {
			return removed, err
		}
	}
	return removed, nil
}

func (b *JSONBackend) AppendLog(item map[string]any) error {
	b.mu.Lock()
	defer b.mu.Unlock()
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
	b.mu.Lock()
	defer b.mu.Unlock()
	full, err := b.documentPath(LogEventsDocumentName)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(full)
	if errors.Is(err, os.ErrNotExist) {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	out := make([]map[string]any, 0)
	err = scanLinesReverse(file, func(line []byte) bool {
		if limit > 0 && len(out) >= limit {
			return true
		}
		item, ok := decodeLogLine(string(line))
		if !ok || !matchLogFilter(item, startDate, endDate) {
			return false
		}
		out = append(out, item)
		return limit > 0 && len(out) >= limit
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (b *JSONBackend) DeleteLogsBefore(day string) (int, error) {
	day = strings.TrimSpace(day)
	if day == "" {
		return 0, nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	full, err := b.documentPath(LogEventsDocumentName)
	if err != nil {
		return 0, err
	}
	input, err := os.Open(full)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	defer input.Close()
	temp, err := os.CreateTemp(filepath.Dir(full), ".logs-rewrite-*.tmp")
	if err != nil {
		return 0, err
	}
	tempName := temp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tempName)
		}
	}()
	writer := bufio.NewWriterSize(temp, 64<<10)
	reader := bufio.NewReaderSize(input, 64<<10)
	removed := 0
	for {
		line, readErr := reader.ReadBytes('\n')
		if len(line) == 0 && errors.Is(readErr, io.EOF) {
			break
		}
		if len(bytes.TrimSpace(line)) == 0 {
			if errors.Is(readErr, io.EOF) {
				break
			}
			continue
		}
		item, ok := decodeLogLine(string(bytes.TrimRight(line, "\r\n")))
		if ok {
			itemDay := logDay(strings.TrimSpace(fmt.Sprint(item["time"])))
			if itemDay != "" && itemDay < day {
				removed++
				if errors.Is(readErr, io.EOF) {
					break
				}
				continue
			}
		}
		if _, err := writer.Write(line); err != nil {
			return 0, err
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return 0, readErr
		}
	}
	if err := writer.Flush(); err != nil {
		return 0, err
	}
	if err := temp.Sync(); err != nil {
		return 0, err
	}
	if err := temp.Close(); err != nil {
		return 0, err
	}
	if removed == 0 {
		return 0, nil
	}
	kept, err := os.Open(tempName)
	if err != nil {
		return 0, err
	}
	info, err := kept.Stat()
	if err != nil {
		_ = kept.Close()
		return 0, err
	}
	_, copyErr := AtomicWriteFromReader(full, kept, info.Size(), 0o644)
	closeErr := kept.Close()
	if copyErr != nil {
		return 0, copyErr
	}
	if closeErr != nil {
		return 0, closeErr
	}
	cleanup = false
	_ = os.Remove(tempName)
	return removed, nil
}

func scanLinesReverse(file *os.File, visit func([]byte) bool) error {
	if file == nil || visit == nil {
		return nil
	}
	info, err := file.Stat()
	if err != nil {
		return err
	}
	const chunkSize int64 = 64 << 10
	var carry []byte
	position := info.Size()
	for position > 0 {
		start := position - chunkSize
		if start < 0 {
			start = 0
		}
		chunk := make([]byte, position-start)
		if _, err := file.ReadAt(chunk, start); err != nil && !errors.Is(err, io.EOF) {
			return err
		}
		data := append(chunk, carry...)
		lines := bytes.Split(data, []byte{'\n'})
		carry = append(carry[:0], lines[0]...)
		for i := len(lines) - 1; i >= 1; i-- {
			line := bytes.TrimSuffix(lines[i], []byte{'\r'})
			if len(bytes.TrimSpace(line)) == 0 {
				continue
			}
			if visit(line) {
				return nil
			}
		}
		position = start
	}
	if len(bytes.TrimSpace(carry)) > 0 {
		line := bytes.TrimSuffix(carry, []byte{'\r'})
		if len(bytes.TrimSpace(line)) > 0 {
			visit(line)
		}
	}
	return nil
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
