package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRotatingFileWriterRotatesAndBoundsFiles pins the fix for server.log, which
// used to be an unbounded append-only file.
func TestRotatingFileWriterRotatesAndBoundsFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "server.log")

	writer, err := newRotatingFileWriter(path, 16, 2)
	if err != nil {
		t.Fatalf("newRotatingFileWriter() error = %v", err)
	}
	defer writer.Close()

	// 10 writes of 8 bytes with a 16-byte limit => several rotations.
	for i := 0; i < 10; i++ {
		if _, err := writer.Write([]byte("12345678")); err != nil {
			t.Fatalf("Write() error = %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	// Only the active file plus maxRotatedFile rotations may exist.
	if _, err := os.Stat(serverLogRotationPath(path, 3)); err == nil {
		t.Fatalf("%s must not exist when only 2 rotated files are kept", serverLogRotationPath(path, 3))
	}
	for _, candidate := range []string{path, serverLogRotationPath(path, 1), serverLogRotationPath(path, 2)} {
		info, err := os.Stat(candidate)
		if err != nil {
			t.Fatalf("expected %s to exist: %v", candidate, err)
		}
		if info.Size() > 16 {
			t.Fatalf("%s grew to %d bytes, over the 16 byte limit", candidate, info.Size())
		}
	}
	active, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read active log: %v", err)
	}
	if len(active) > 16 || !strings.HasPrefix(string(active), "12345678") {
		t.Fatalf("active log = %q, want the newest entry in a fresh file", active)
	}
}

// TestRotatingFileWriterKeepsAppendingBeforeLimit guards against a rotation
// implementation that truncates instead of appending.
func TestRotatingFileWriterKeepsAppendingBeforeLimit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "server.log")
	if err := os.WriteFile(path, []byte("existing\n"), 0o644); err != nil {
		t.Fatalf("seed log: %v", err)
	}
	writer, err := newRotatingFileWriter(path, 1024, 2)
	if err != nil {
		t.Fatalf("newRotatingFileWriter() error = %v", err)
	}
	if _, err := writer.Write([]byte("appended\n")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	if string(data) != "existing\nappended\n" {
		t.Fatalf("log = %q, want the previous content preserved and appended to", data)
	}
}

// TestNewLoggerRotatesServerLog proves the production logger actually uses the
// rotating writer rather than a plain append handle.
func TestNewLoggerRotatesServerLog(t *testing.T) {
	dir := t.TempDir()
	logger, err := NewLogger(dir, nil)
	if err != nil {
		t.Fatalf("NewLogger() error = %v", err)
	}
	defer logger.Close()

	logger.Info(strings.Repeat("x", 1024))
	path := filepath.Join(dir, "logs", "server.log")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat server log: %v", err)
	}
	if info.Size() == 0 {
		t.Fatal("logger did not write to server.log")
	}
}
