package hostupdate

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestColdBackupRestoreRemovesStaleSQLiteSidecars(t *testing.T) {
	root := t.TempDir()
	installDir := filepath.Join(root, "install")
	dataDir := filepath.Join(root, "data")
	backupDir := filepath.Join(root, "backups")
	if err := os.MkdirAll(installDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(installDir, "docker-compose.yml"), "services: {}\n")
	writeTestFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "clean-main-db")
	writeTestFile(t, filepath.Join(dataDir, "sub", "secondary.db"), "clean-secondary-db")

	store := newColdBackupStore(Options{
		InstallDir:   installDir,
		DataDir:      dataDir,
		BackupDir:    backupDir,
		StateDir:     filepath.Join(root, "state"),
		ComposeFiles: []string{"docker-compose.yml"},
	})
	artifact, err := store.Create(context.Background(), "abcdef0123456789")
	if err != nil {
		t.Fatal(err)
	}

	// Simulate post-backup failed migration leaving mutated DB + stale WAL/SHM sidecars.
	writeTestFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "corrupted-main-db")
	writeTestFile(t, filepath.Join(dataDir, "chatgpt2api.db-wal"), "stale-wal-frames")
	writeTestFile(t, filepath.Join(dataDir, "chatgpt2api.db-shm"), "stale-shm-index")
	writeTestFile(t, filepath.Join(dataDir, "sub", "secondary.db"), "corrupted-secondary-db")
	writeTestFile(t, filepath.Join(dataDir, "sub", "secondary.db-wal"), "stale-secondary-wal")
	writeTestFile(t, filepath.Join(dataDir, "sub", "secondary.db-shm"), "stale-secondary-shm")

	if err := store.Restore(context.Background(), artifact); err != nil {
		t.Fatalf("Restore() error = %v", err)
	}

	assertTestFile(t, filepath.Join(dataDir, "chatgpt2api.db"), "clean-main-db")
	assertTestFile(t, filepath.Join(dataDir, "sub", "secondary.db"), "clean-secondary-db")
	for _, sidecar := range []string{
		filepath.Join(dataDir, "chatgpt2api.db-wal"),
		filepath.Join(dataDir, "chatgpt2api.db-shm"),
		filepath.Join(dataDir, "sub", "secondary.db-wal"),
		filepath.Join(dataDir, "sub", "secondary.db-shm"),
	} {
		if _, err := os.Stat(sidecar); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("stale SQLite sidecar %s still exists after Restore: err=%v", sidecar, err)
		}
	}
}
