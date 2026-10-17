package hostupdate

import (
	"archive/zip"
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestColdBackupCreatesAndRestoresCriticalFiles(t *testing.T) {
	root := t.TempDir()
	installDir := filepath.Join(root, "install")
	dataDir := filepath.Join(root, "data")
	backupDir := filepath.Join(root, "update-backups")
	for _, dir := range []string{installDir, dataDir, filepath.Join(dataDir, "configs"), filepath.Join(dataDir, "images")} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	writeTestFile(t, filepath.Join(installDir, ".env"), "secret=config\n")
	writeTestFile(t, filepath.Join(installDir, "docker-compose.yml"), "services: {}\n")
	writeTestFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "database-before")
	writeTestFile(t, filepath.Join(dataDir, "configs", "settings.json"), `{"before":true}`)
	writeTestFile(t, filepath.Join(dataDir, "images", "large.png"), "excluded-media")
	writeTestFile(t, filepath.Join(dataDir, "unexpected.bin"), "excluded-unknown")

	store := newColdBackupStore(Options{
		InstallDir: installDir, DataDir: dataDir, BackupDir: backupDir,
		StateDir: filepath.Join(root, "state"), ComposeFiles: []string{"docker-compose.yml"},
	})
	artifact, err := store.Create(context.Background(), "0123456789abcdef")
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(artifact.Path)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(archive.File))
	for _, entry := range archive.File {
		names = append(names, entry.Name)
	}
	_ = archive.Close()
	for _, expected := range []string{"install/.env", "install/docker-compose.yml", "data/chatgpt2api.db", "data/configs/settings.json"} {
		if !slices.Contains(names, expected) {
			t.Fatalf("backup entries = %v, missing %s", names, expected)
		}
	}
	if slices.Contains(names, "data/images/large.png") {
		t.Fatalf("backup unexpectedly contains media: %v", names)
	}
	if slices.Contains(names, "data/unexpected.bin") {
		t.Fatalf("backup unexpectedly contains unknown data file: %v", names)
	}

	writeTestFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "database-after")
	writeTestFile(t, filepath.Join(dataDir, "configs", "settings.json"), `{"before":false}`)
	if err := store.Restore(context.Background(), artifact); err != nil {
		t.Fatal(err)
	}
	assertTestFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "database-before")
	assertTestFile(t, filepath.Join(dataDir, "configs", "settings.json"), `{"before":true}`)
}

func TestColdBackupRejectsTamperedArchiveAndTraversal(t *testing.T) {
	root := t.TempDir()
	installDir := filepath.Join(root, "install")
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(installDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(installDir, "docker-compose.yml"), "services: {}\n")
	writeTestFile(t, filepath.Join(dataDir, "state.json"), "before")
	store := newColdBackupStore(Options{
		InstallDir: installDir, DataDir: dataDir, BackupDir: filepath.Join(root, "backups"),
		StateDir: filepath.Join(root, "state"), ComposeFiles: []string{"docker-compose.yml"},
	})
	artifact, err := store.Create(context.Background(), "fedcba9876543210")
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(artifact.Path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte("tampered")); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if err := store.Restore(context.Background(), artifact); err == nil || !strings.Contains(err.Error(), "完整性") {
		t.Fatalf("Restore() error = %v", err)
	}
	if _, _, err := store.restoreTarget("data/../../outside"); err == nil {
		t.Fatal("restoreTarget accepted traversal path")
	}
}

func TestColdBackupPruneKeepsOnlyCurrentUpdaterArchive(t *testing.T) {
	root := t.TempDir()
	backupDir := filepath.Join(root, "backups")
	if err := os.MkdirAll(filepath.Join(backupDir, "update-directory.zip"), 0o700); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(backupDir, "update-2222222222222222.zip")
	old := filepath.Join(backupDir, "update-1111111111111111.zip")
	manual := filepath.Join(backupDir, "manual-backup.zip")
	temporary := filepath.Join(backupDir, ".update-work.zip.tmp")
	for _, path := range []string{keep, old, manual, temporary} {
		writeTestFile(t, path, filepath.Base(path))
	}

	store := newColdBackupStore(Options{BackupDir: backupDir})
	if err := store.Prune(context.Background(), BackupArtifact{Path: keep}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(old); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old updater backup still exists: %v", err)
	}
	for _, path := range []string{keep, manual, temporary, filepath.Join(backupDir, "update-directory.zip")} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("preserved path %s: %v", path, err)
		}
	}
}

func TestColdBackupPruneRejectsKeeperOutsideBackupDirectory(t *testing.T) {
	root := t.TempDir()
	backupDir := filepath.Join(root, "backups")
	old := filepath.Join(backupDir, "update-1111111111111111.zip")
	outside := filepath.Join(root, "update-2222222222222222.zip")
	writeTestFile(t, old, "old")
	writeTestFile(t, outside, "outside")

	store := newColdBackupStore(Options{BackupDir: backupDir})
	if err := store.Prune(context.Background(), BackupArtifact{Path: outside}); err == nil {
		t.Fatal("Prune() accepted keeper outside backup directory")
	}
	if _, err := os.Stat(old); err != nil {
		t.Fatalf("old updater backup changed after rejected prune: %v", err)
	}
}

func writeTestFile(t *testing.T, path, value string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		t.Fatal(err)
	}
}

func assertTestFile(t *testing.T, path, expected string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != expected {
		t.Fatalf("%s = %q, want %q", path, data, expected)
	}
}
