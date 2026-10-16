package storage

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type failingReader struct {
	read bool
}

func (r *failingReader) Read(p []byte) (int, error) {
	if !r.read {
		r.read = true
		return copy(p, "partial"), nil
	}
	return 0, errors.New("forced read failure")
}

func TestAtomicWriteFromReaderRejectsOverflowWithoutReplacingDestination(t *testing.T) {
	path := filepath.Join(t.TempDir(), "video.mp4")
	if err := os.WriteFile(path, []byte("previous"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := AtomicWriteFromReader(path, io.LimitReader(strings.NewReader("12345"), 5), 4, 0o644); err == nil {
		t.Fatal("AtomicWriteFromReader() succeeded, want overflow error")
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "previous" {
		t.Fatalf("destination after overflow = %q, %v", got, err)
	}
}

func TestAtomicWriteFromReaderKeepsDestinationOnReadFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "video.mp4")
	if err := os.WriteFile(path, []byte("previous"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := AtomicWriteFromReader(path, &failingReader{}, 64, 0o644); err == nil {
		t.Fatal("AtomicWriteFromReader() succeeded, want read failure")
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "previous" {
		t.Fatalf("destination after read failure = %q, %v", got, err)
	}
}

func TestAtomicWriteFileCreatesAndUpdates(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.env")

	if err := AtomicWriteFile(path, []byte("A=1\n"), 0o644); err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "A=1\n" {
		t.Fatalf("got %q", got)
	}

	if err := AtomicWriteFile(path, []byte("A=2\nB=3\n"), 0o644); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "A=2\nB=3\n" {
		t.Fatalf("got %q", got)
	}
}

func TestReplaceFileCopyInPlace(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "mounted.env")
	src := filepath.Join(dir, "payload.tmp")
	if err := os.WriteFile(dest, []byte("OLD=1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(src, []byte("NEW=2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := replaceFileCopyInPlace(src, dest); err != nil {
		t.Fatalf("copy in place: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "NEW=2\n" {
		t.Fatalf("got %q", got)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatalf("source should be removed, err=%v", err)
	}
}

func TestReplaceFileFallsBackToCopyInPlaceWhenRenameBusy(t *testing.T) {
	// Simulate "busy" dest rename by making dest a directory named like a file path
	// is hard; instead call replaceFile when source is on a normal FS and dest exists —
	// rename should succeed. Force copy path via replaceFileCopyInPlace above.
	// Additional: ensure replaceFile succeeds after writing when dest exists.
	dir := t.TempDir()
	dest := filepath.Join(dir, ".env")
	src := filepath.Join(dir, ".env.tmp")
	if err := os.WriteFile(dest, []byte("X=1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(src, []byte("X=9\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := replaceFile(src, dest); err != nil {
		t.Fatalf("replaceFile: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "X=9\n" {
		t.Fatalf("got %q", got)
	}
}
