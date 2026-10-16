package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
)

const (
	outlookStateUsed         = "used"
	outlookStateInUse        = "in_use"
	outlookStateTokenInvalid = "token_invalid"
	outlookStateFailed       = "failed"
	outlookInUseStaleSeconds = 3600
)

var (
	outlookTokenStateMu   sync.Mutex
	outlookTokenStatePath = "outlook_token_used.json"
)

type outlookTokenStateEntry struct {
	State     string `json:"state"`
	Reason    string `json:"reason"`
	UpdatedAt string `json:"updated_at"`
}

// InitOutlookTokenStatePath sets the on-disk path for outlook_token pool state.
func InitOutlookTokenStatePath(dataDir string) {
	dataDir = strings.TrimSpace(dataDir)
	if dataDir == "" {
		return
	}
	outlookTokenStateMu.Lock()
	defer outlookTokenStateMu.Unlock()
	outlookTokenStatePath = filepath.Join(dataDir, "outlook_token_used.json")
}

func loadOutlookTokenState() (map[string]outlookTokenStateEntry, error) {
	path := outlookTokenStatePath
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]outlookTokenStateEntry{}, nil
		}
		return nil, fmt.Errorf("读取 OutlookToken 状态文件失败: %w", err)
	}
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("解析 OutlookToken 状态文件失败: %w", err)
	}
	out := map[string]outlookTokenStateEntry{}
	switch typed := raw.(type) {
	case []any:
		for _, item := range typed {
			key := strings.ToLower(strings.TrimSpace(utilClean(item)))
			if key != "" {
				out[key] = outlookTokenStateEntry{State: outlookStateUsed}
			}
		}
	case map[string]any:
		for key, value := range typed {
			email := strings.ToLower(strings.TrimSpace(key))
			if email == "" {
				continue
			}
			if m, ok := value.(map[string]any); ok {
				out[email] = outlookTokenStateEntry{
					State:     firstNonEmpty(utilClean(m["state"]), outlookStateUsed),
					Reason:    utilClean(m["reason"]),
					UpdatedAt: utilClean(m["updated_at"]),
				}
			} else {
				out[email] = outlookTokenStateEntry{State: firstNonEmpty(utilClean(value), outlookStateUsed)}
			}
		}
	default:
		return nil, fmt.Errorf("解析 OutlookToken 状态文件失败: 顶层结构必须为对象或数组")
	}
	return out, nil
}

func saveOutlookTokenState(state map[string]outlookTokenStateEntry) error {
	path := outlookTokenStatePath
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	keys := make([]string, 0, len(state))
	for key := range state {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	ordered := make(map[string]outlookTokenStateEntry, len(keys))
	for _, key := range keys {
		ordered[key] = state[key]
	}
	data, err := json.MarshalIndent(ordered, "", "  ")
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(path, append(data, '\n'), 0o644)
}

func outlookEntryAvailable(entry *outlookTokenStateEntry) bool {
	if entry == nil {
		return true
	}
	switch entry.State {
	case outlookStateUsed, outlookStateTokenInvalid, outlookStateFailed:
		return false
	case outlookStateInUse:
		if entry.UpdatedAt == "" {
			return true
		}
		ts, err := time.Parse(time.RFC3339Nano, entry.UpdatedAt)
		if err != nil {
			ts, err = time.Parse(time.RFC3339, entry.UpdatedAt)
		}
		if err != nil {
			return true
		}
		return time.Since(ts.UTC()) >= outlookInUseStaleSeconds*time.Second
	default:
		return true
	}
}

func setOutlookTokenState(address, state, reason string) error {
	target := strings.ToLower(strings.TrimSpace(address))
	if target == "" {
		return nil
	}
	outlookTokenStateMu.Lock()
	defer outlookTokenStateMu.Unlock()
	store, err := loadOutlookTokenState()
	if err != nil {
		return err
	}
	store[target] = outlookTokenStateEntry{
		State:     state,
		Reason:    truncateReason(reason, 300),
		UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := saveOutlookTokenState(store); err != nil {
		return fmt.Errorf("保存 OutlookToken 状态文件失败: %w", err)
	}
	return nil
}

func releaseOutlookTokenState(address string) error {
	target := strings.ToLower(strings.TrimSpace(address))
	if target == "" {
		return nil
	}
	outlookTokenStateMu.Lock()
	defer outlookTokenStateMu.Unlock()
	store, err := loadOutlookTokenState()
	if err != nil {
		return err
	}
	entry, ok := store[target]
	if !ok || entry.State != outlookStateInUse {
		return nil
	}
	delete(store, target)
	if err := saveOutlookTokenState(store); err != nil {
		return fmt.Errorf("保存 OutlookToken 状态文件失败: %w", err)
	}
	return nil
}

// ResetOutlookTokenPoolState clears outlook pool state records.
// scope=all clears everything; scope=failed clears failed/token_invalid/in_use (keeps used).
func ResetOutlookTokenPoolState(scope string) (int, error) {
	outlookTokenStateMu.Lock()
	defer outlookTokenStateMu.Unlock()
	store, err := loadOutlookTokenState()
	if err != nil {
		return 0, err
	}
	if len(store) == 0 {
		return 0, nil
	}
	scope = strings.ToLower(strings.TrimSpace(scope))
	if scope == "failed" {
		removed := 0
		for key, entry := range store {
			switch entry.State {
			case outlookStateFailed, outlookStateTokenInvalid, outlookStateInUse:
				delete(store, key)
				removed++
			}
		}
		if removed == 0 {
			return 0, nil
		}
		if err := saveOutlookTokenState(store); err != nil {
			return 0, fmt.Errorf("保存 OutlookToken 状态文件失败: %w", err)
		}
		return removed, nil
	}
	count := len(store)
	if err := saveOutlookTokenState(map[string]outlookTokenStateEntry{}); err != nil {
		return 0, fmt.Errorf("保存 OutlookToken 状态文件失败: %w", err)
	}
	return count, nil
}

func pruneOutlookUnusedCredentials(credentials []outlookCredential) ([]outlookCredential, int, error) {
	outlookTokenStateMu.Lock()
	store, err := loadOutlookTokenState()
	outlookTokenStateMu.Unlock()
	if err != nil {
		return nil, 0, err
	}
	kept := make([]outlookCredential, 0, len(credentials))
	removed := 0
	for _, credential := range credentials {
		key := strings.ToLower(strings.TrimSpace(credential.Email))
		entry, ok := store[key]
		state := ""
		if ok {
			state = entry.State
		}
		switch state {
		case outlookStateUsed, outlookStateInUse, outlookStateTokenInvalid, outlookStateFailed:
			kept = append(kept, credential)
		default:
			removed++
		}
	}
	return kept, removed, nil
}

func outlookTokenPoolStats(pool []outlookCredential) (map[string]int, error) {
	outlookTokenStateMu.Lock()
	store, err := loadOutlookTokenState()
	outlookTokenStateMu.Unlock()
	counts := map[string]int{
		"unused":        0,
		"in_use":        0,
		"used":          0,
		"token_invalid": 0,
		"failed":        0,
	}
	if err != nil {
		return counts, err
	}
	if len(pool) == 0 {
		for _, entry := range store {
			if _, ok := counts[entry.State]; ok {
				counts[entry.State]++
			}
		}
		return counts, nil
	}
	for _, credential := range pool {
		entry, ok := store[strings.ToLower(strings.TrimSpace(credential.Email))]
		if !ok || entry.State == "" {
			counts["unused"]++
			continue
		}
		if _, ok := counts[entry.State]; ok {
			counts[entry.State]++
		} else {
			counts["unused"]++
		}
	}
	return counts, nil
}

func truncateReason(text string, max int) string {
	text = strings.TrimSpace(text)
	if max <= 0 || len(text) <= max {
		return text
	}
	return text[:max]
}

// utilClean is a local string cleaner used by outlook state parsing.
func utilClean(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case []byte:
		return strings.TrimSpace(string(t))
	default:
		b, _ := json.Marshal(v)
		s := string(b)
		if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
			s = strings.Trim(s, `"`)
		}
		return strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, "\r", ""), "\n", " "))
	}
}
