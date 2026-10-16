package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOutlookTokenStateCorruptionRefusesClaimAndReset(t *testing.T) {
	dir := t.TempDir()
	InitOutlookTokenStatePath(dir)
	statePath := filepath.Join(dir, "outlook_token_used.json")
	if err := os.WriteFile(statePath, []byte("{broken"), 0o644); err != nil {
		t.Fatalf("write corrupt state: %v", err)
	}

	provider := newRegisterOutlookTokenProvider(registerHTTPMailProvider{}, map[string]any{
		"type":      "outlook_token",
		"mailboxes": "user@outlook.com----password----client----refresh",
	})
	if _, err := provider.CreateMailbox(""); err == nil || !strings.Contains(err.Error(), "解析 OutlookToken 状态文件失败") {
		t.Fatalf("CreateMailbox() error = %v", err)
	}
	if _, err := ResetOutlookTokenPoolState("all"); err == nil {
		t.Fatal("ResetOutlookTokenPoolState() succeeded with corrupt state")
	}

	raw, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read corrupt state: %v", err)
	}
	if string(raw) != "{broken" {
		t.Fatalf("corrupt state was overwritten: %q", raw)
	}
}

func TestOutlookTokenStateErrorVisibleInRegisterSnapshot(t *testing.T) {
	dir := t.TempDir()
	InitOutlookTokenStatePath(dir)
	if err := os.WriteFile(filepath.Join(dir, "outlook_token_used.json"), []byte("null"), 0o644); err != nil {
		t.Fatalf("write invalid state: %v", err)
	}
	snapshot := map[string]any{
		"mail": map[string]any{
			"providers": []map[string]any{{
				"type":      "outlook_token",
				"mailboxes": "user@outlook.com----password----client----refresh",
			}},
		},
	}

	enrichOutlookPools(snapshot)
	providers := asMapSlice(utilStringMap(snapshot["mail"])["providers"])
	if len(providers) != 1 || !strings.Contains(utilClean(providers[0]["mailboxes_state_error"]), "顶层结构") {
		t.Fatalf("snapshot state error = %#v", providers)
	}
}

func TestSaveOutlookTokenStateReturnsWriteError(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blocker, []byte("block"), 0o644); err != nil {
		t.Fatalf("write parent blocker: %v", err)
	}
	outlookTokenStateMu.Lock()
	previousPath := outlookTokenStatePath
	outlookTokenStatePath = filepath.Join(blocker, "outlook_token_used.json")
	outlookTokenStateMu.Unlock()
	t.Cleanup(func() {
		outlookTokenStateMu.Lock()
		outlookTokenStatePath = previousPath
		outlookTokenStateMu.Unlock()
	})

	if err := saveOutlookTokenState(map[string]outlookTokenStateEntry{}); err == nil {
		t.Fatal("saveOutlookTokenState() succeeded with directory target")
	}
}
