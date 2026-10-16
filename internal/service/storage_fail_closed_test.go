package service

import (
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/util"
)

const corruptJSON = "{broken"

func TestAnnouncementServiceRefusesWriteAfterFailedLoad(t *testing.T) {
	dataDir := t.TempDir()
	path := filepath.Join(dataDir, "announcements.json")
	writeCorruptJSON(t, path)
	svc := NewAnnouncementService(dataDir)

	_, err := svc.Create(map[string]any{"content": "must not overwrite"})

	if err == nil {
		t.Fatal("Create() succeeded after corrupt load")
	}
	assertCorruptJSONUnchanged(t, path)
}

func TestBackupServiceRefusesWriteAfterFailedLoad(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	path := filepath.Join(dataDir, "backup.json")
	writeCorruptJSON(t, path)
	svc := NewBackupService(root, dataDir)

	_, err := svc.Update(map[string]any{"enabled": true})

	if err == nil {
		t.Fatal("Update() succeeded after corrupt load")
	}
	assertCorruptJSONUnchanged(t, path)
}

func TestCPAConfigRefusesWriteAfterFailedLoad(t *testing.T) {
	dataDir := t.TempDir()
	path := filepath.Join(dataDir, "cpa_config.json")
	writeCorruptJSON(t, path)
	svc := NewCPAConfig(dataDir)

	_, err := svc.AddPool("pool", "https://cpa.example.test", "secret")

	if err == nil {
		t.Fatal("AddPool() succeeded after corrupt load")
	}
	assertCorruptJSONUnchanged(t, path)
}

func TestPromptFavoriteServiceRefusesWriteAfterFailedLoad(t *testing.T) {
	dataDir := t.TempDir()
	ownerID := "user-1"
	path := filepath.Join(dataDir, promptFavoritesDocumentDir, util.SHA256Hex(ownerID)+".json")
	writeCorruptJSON(t, path)
	svc := NewPromptFavoriteService(dataDir)

	_, err := svc.Upsert(ownerID, map[string]any{
		"prompt_id": "prompt-1",
		"source":    "manual",
		"title":     "Prompt",
		"preview":   "https://example.test/preview.png",
		"prompt":    "draw a cat",
		"author":    "wwj",
		"category":  "Animals",
	})

	if err == nil {
		t.Fatal("Upsert() succeeded after corrupt load")
	}
	assertCorruptJSONUnchanged(t, path)
}

func TestRegisterServiceRefusesWriteAfterFailedLoad(t *testing.T) {
	dataDir := t.TempDir()
	path := filepath.Join(dataDir, "register.json")
	writeCorruptJSON(t, path)
	svc := NewRegisterService(dataDir, nil)

	_, err := svc.Update(map[string]any{"threads": 3})

	if err == nil {
		t.Fatal("Update() succeeded after corrupt load")
	}
	assertCorruptJSONUnchanged(t, path)
}

func writeCorruptJSON(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(path, []byte(corruptJSON), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
}

func assertCorruptJSONUnchanged(t *testing.T, path string) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(raw) != corruptJSON {
		t.Fatalf("corrupt file was overwritten: %q", raw)
	}
}
