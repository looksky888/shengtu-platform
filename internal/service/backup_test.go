package service

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestBackupCollectFilesIncludesSQLiteAndUserData(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	mustWriteFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "db")
	mustWriteFile(t, filepath.Join(dataDir, "chatgpt2api.db-wal"), "wal")
	mustWriteFile(t, filepath.Join(dataDir, "auth_keys.json"), `{}`)
	mustWriteFile(t, filepath.Join(dataDir, "backups", "shengtu-backup-old.zip"), "old")
	mustWriteFile(t, filepath.Join(dataDir, "images", "a.png"), "img")

	svc := NewBackupService(root, dataDir)
	files, err := svc.collectFiles(backupConfigFromMap(map[string]any{"include": []string{"data"}}))
	if err != nil {
		t.Fatalf("collectFiles() error = %v", err)
	}
	names := map[string]bool{}
	for _, file := range files {
		names[filepath.ToSlash(file.Name)] = true
	}
	for _, want := range []string{"data/chatgpt2api.db", "data/chatgpt2api.db-wal", "data/auth_keys.json"} {
		if !names[want] {
			t.Fatalf("backup missing %s in %#v", want, names)
		}
	}
	if names["data/backups/shengtu-backup-old.zip"] {
		t.Fatal("backup should not include existing backup archives")
	}
	if names["data/images/a.png"] {
		t.Fatal("image directories should be excluded from data-only backups")
	}
}

// Quarantine cabin + registration quota ledger + device secret must ride the
// same data backup as the account pool (P5-4 disaster recovery).
func TestBackupCollectFilesIncludesQuarantineAndRegistrationQuota(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	mustWriteFile(t, filepath.Join(dataDir, "accounts.json"), `[]`)
	mustWriteFile(t, filepath.Join(dataDir, "auth_keys.json"), `[]`)
	mustWriteFile(t, filepath.Join(dataDir, "account_quarantine.json"), `[{"token_hash":"abc"}]`)
	mustWriteFile(t, filepath.Join(dataDir, "registration_quota.json"), `{"events":[]}`)
	mustWriteFile(t, filepath.Join(dataDir, "device_id.secret"), "hexsecret\n")

	svc := NewBackupService(root, dataDir)
	files, err := svc.collectFiles(backupConfigFromMap(map[string]any{"include": []string{"data"}}))
	if err != nil {
		t.Fatalf("collectFiles() error = %v", err)
	}
	names := map[string]bool{}
	for _, file := range files {
		names[filepath.ToSlash(file.Name)] = true
	}
	for _, want := range []string{
		"data/accounts.json",
		"data/auth_keys.json",
		"data/account_quarantine.json",
		"data/registration_quota.json",
		"data/device_id.secret",
	} {
		if !names[want] {
			t.Fatalf("backup missing critical %s in %#v", want, names)
		}
	}

	// End-to-end: zip must contain cabin + quota after Run.
	svc.Update(map[string]any{"enabled": true, "provider": "local", "include": []string{"data"}, "last_max_files": 5})
	state, err := svc.Run()
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	archivePath, _ := state["last_file"].(string)
	if archivePath == "" {
		t.Fatalf("last_file empty: %#v", state)
	}
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	defer zr.Close()
	inZip := map[string]bool{}
	for _, f := range zr.File {
		inZip[filepath.ToSlash(f.Name)] = true
	}
	for _, want := range []string{
		"data/account_quarantine.json",
		"data/registration_quota.json",
		"data/device_id.secret",
	} {
		if !inZip[want] {
			t.Fatalf("zip missing %s; entries=%#v", want, inZip)
		}
	}
}

func TestBackupPruneBackupsDoesNotPanicWhenBelowKeep(t *testing.T) {
	root := t.TempDir()
	backupDir := filepath.Join(root, "data", "backups")
	mustWriteFile(t, filepath.Join(backupDir, "shengtu-backup-20000101-000000.zip"), "old")
	svc := NewBackupService(root, filepath.Join(root, "data"))
	if removed := svc.pruneBackupsLocked(backupDir, 20); removed != 0 {
		t.Fatalf("removed = %d, want 0", removed)
	}
}

func TestBackupRunWritesZipAndPrunesLocalBackups(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	mustWriteFile(t, filepath.Join(dataDir, "auth_keys.json"), `{"users":[]}`)
	backupDir := filepath.Join(dataDir, "backups")
	mustWriteFile(t, filepath.Join(backupDir, "shengtu-backup-20000101-000000.zip"), "old")
	mustWriteFile(t, filepath.Join(backupDir, "shengtu-backup-20000102-000000.zip"), "old")

	svc := NewBackupService(root, dataDir)
	svc.Update(map[string]any{"enabled": true, "provider": "local", "include": []string{"data"}, "last_max_files": 1})
	state, err := svc.Run()
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	archivePath, _ := state["last_file"].(string)
	if archivePath == "" {
		t.Fatalf("last_file is empty: %#v", state)
	}
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatalf("open backup zip: %v", err)
	}
	defer zr.Close()
	found := false
	for _, file := range zr.File {
		if filepath.ToSlash(file.Name) == "data/auth_keys.json" {
			found = true
		}
	}
	if !found {
		t.Fatalf("backup zip did not include auth_keys.json")
	}
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		t.Fatalf("ReadDir() error = %v", err)
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".zip" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected pruning to keep 1 zip, got %d", count)
	}
}

func TestBackupRunCloudflareR2RequiresConfig(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	mustWriteFile(t, filepath.Join(dataDir, "auth_keys.json"), `{}`)
	svc := NewBackupService(root, dataDir)
	svc.Update(map[string]any{"provider": "cloudflare_r2", "include": []string{"data"}})
	_, err := svc.Run()
	if err == nil {
		t.Fatal("Run() error = nil for incomplete R2 config")
	}
}

func TestBackupTriggerReusesRunningTask(t *testing.T) {
	svc := NewBackupService(t.TempDir(), t.TempDir())
	started := make(chan struct{})
	release := make(chan struct{})
	svc.runOverride = func(ctx context.Context, _ BackupConfig, _ string) (backupRunOutput, error) {
		close(started)
		select {
		case <-release:
			return backupRunOutput{}, nil
		case <-ctx.Done():
			return backupRunOutput{}, ctx.Err()
		}
	}

	first, err := svc.TriggerTyped()
	if err != nil {
		t.Fatalf("first TriggerTyped() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("backup task did not start")
	}
	second, err := svc.TriggerTyped()
	if err != nil {
		t.Fatalf("second TriggerTyped() error = %v", err)
	}
	if !first.Started || second.Started {
		t.Fatalf("started flags = first:%v second:%v", first.Started, second.Started)
	}
	if first.State.TaskID == "" || second.State.TaskID != first.State.TaskID {
		t.Fatalf("task IDs = first:%q second:%q", first.State.TaskID, second.State.TaskID)
	}
	close(release)
	waitForBackupStatus(t, svc, BackupStatusSuccess)
}

func TestBackupCloseCancelsRunningTask(t *testing.T) {
	svc := NewBackupService(t.TempDir(), t.TempDir())
	started := make(chan struct{})
	svc.runOverride = func(ctx context.Context, _ BackupConfig, _ string) (backupRunOutput, error) {
		close(started)
		<-ctx.Done()
		return backupRunOutput{}, ctx.Err()
	}
	if _, err := svc.TriggerTyped(); err != nil {
		t.Fatalf("TriggerTyped() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("backup task did not start")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := svc.Close(ctx); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	state := svc.RunStatusTyped().State
	if state.Status != BackupStatusFailed || state.Phase != "interrupted" {
		t.Fatalf("state after Close = %#v", state)
	}
}

func TestWriteBackupZipRemovesPartialFileOnFailure(t *testing.T) {
	target := filepath.Join(t.TempDir(), "backup.zip")
	err := writeBackupZip(context.Background(), target, []backupFile{{Path: filepath.Join(t.TempDir(), "missing"), Name: "missing"}})
	if err == nil {
		t.Fatal("writeBackupZip() error = nil")
	}
	for _, path := range []string{target, target + ".part"} {
		if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
			t.Fatalf("partial output still exists: %s", path)
		}
	}
}

func TestBackupRunUsesRestorableSQLiteSnapshot(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	dbPath := filepath.Join(dataDir, "chatgpt2api.db")
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	if err := backend.SaveAccounts([]map[string]any{{"access_token": "snapshot-token", "email": "snapshot@example.test"}}); err != nil {
		t.Fatalf("SaveAccounts() error = %v", err)
	}
	svc := NewBackupService(root, dataDir, backend)
	if _, err := svc.Update(map[string]any{"provider": "local", "include": []string{"data"}}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	state, err := svc.Run()
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	archivePath, _ := state["last_file"].(string)
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatalf("OpenReader() error = %v", err)
	}
	restoredPath := filepath.Join(t.TempDir(), "restored.db")
	foundDB := false
	for _, entry := range zr.File {
		name := filepath.ToSlash(entry.Name)
		if strings.HasSuffix(name, ".db-wal") || strings.HasSuffix(name, ".db-shm") {
			zr.Close()
			t.Fatalf("archive contains live SQLite sidecar: %s", name)
		}
		if name == "data/chatgpt2api.db" {
			foundDB = true
			extractZipEntry(t, entry, restoredPath)
		}
	}
	if err := zr.Close(); err != nil {
		t.Fatalf("zip Close() error = %v", err)
	}
	if !foundDB {
		t.Fatal("archive missing data/chatgpt2api.db snapshot")
	}
	restored, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(restoredPath))
	if err != nil {
		t.Fatalf("open restored database: %v", err)
	}
	defer restored.Close()
	accounts, err := restored.LoadAccounts()
	if err != nil {
		t.Fatalf("LoadAccounts() restored error = %v", err)
	}
	if len(accounts) != 1 || accounts[0]["access_token"] != "snapshot-token" {
		t.Fatalf("restored accounts = %#v", accounts)
	}
}

func waitForBackupStatus(t *testing.T, svc *BackupService, want string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if state := svc.RunStatusTyped().State; state.Status == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("backup status = %#v, want %s", svc.RunStatusTyped().State, want)
}

func extractZipEntry(t *testing.T, entry *zip.File, target string) {
	t.Helper()
	in, err := entry.Open()
	if err != nil {
		t.Fatalf("entry Open() error = %v", err)
	}
	out, err := os.Create(target)
	if err != nil {
		_ = in.Close()
		t.Fatalf("create restored DB: %v", err)
	}
	_, copyErr := io.Copy(out, in)
	if err := errors.Join(copyErr, in.Close(), out.Close()); err != nil {
		t.Fatalf("extract restored DB: %v", err)
	}
}

func mustWriteFile(t *testing.T, path string, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
