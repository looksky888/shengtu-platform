package storage

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
)

// AtomicWriteFromReader streams at most limit bytes into a same-directory
// temporary file and replaces path only after the complete input is durable.
func AtomicWriteFromReader(path string, reader io.Reader, limit int64, perm os.FileMode) (int64, error) {
	if reader == nil || limit < 1 {
		return 0, fmt.Errorf("invalid atomic stream write")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return 0, err
	}
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".*.tmp")
	if err != nil {
		return 0, err
	}
	tmpName := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpName)
		}
	}()
	written, copyErr := io.Copy(tmp, io.LimitReader(reader, limit+1))
	if copyErr != nil {
		_ = tmp.Close()
		return written, copyErr
	}
	if written > limit {
		_ = tmp.Close()
		return written, fmt.Errorf("content exceeds %d byte limit", limit)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return written, err
	}
	if err := tmp.Close(); err != nil {
		return written, err
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		_ = err
	}
	if err := replaceFile(tmpName, path); err != nil {
		return written, err
	}
	cleanup = false
	return written, nil
}

// AtomicWriteFile writes data to path via a same-directory temp file then replace.
// Reduces risk of truncated JSON/config after crash mid-write.
//
// When dest is a Docker bind-mounted file (e.g. ./.env:/app/.env), rename of the
// mount target fails with "device or resource busy". In that case we fall back to
// opening the existing dest and writing through it in place (still fsync'd).
func AtomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpName)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		// Non-fatal on some FS; continue replace.
		_ = err
	}
	if err := replaceFile(tmpName, path); err != nil {
		return err
	}
	cleanup = false
	return nil
}

// replaceFile replaces dest with source (source is removed on success).
// Prefers atomic rename; falls back to in-place write for bind mounts / EXDEV.
func replaceFile(source, dest string) error {
	// Fast path: rename into place (works when dest missing, or on Unix overwriting).
	if err := os.Rename(source, dest); err == nil {
		return nil
	}
	if runtime.GOOS == "windows" {
		if err := replaceFileWindows(source, dest); err == nil {
			return nil
		}
	} else if err := replaceFileFallback(source, dest); err == nil {
		return nil
	}
	// Bind-mounted files / cross-device: write content into the existing dest inode.
	return replaceFileCopyInPlace(source, dest)
}

func replaceFileFallback(source, dest string) error {
	bak := dest + ".bak"
	_ = os.Remove(bak)
	if _, err := os.Stat(dest); err == nil {
		if err := os.Rename(dest, bak); err != nil {
			return err
		}
	}
	if err := os.Rename(source, dest); err != nil {
		// Best-effort restore
		_ = os.Rename(bak, dest)
		return err
	}
	_ = os.Remove(bak)
	return nil
}

// replaceFileCopyInPlace writes source bytes into dest without renaming dest.
// Required for Docker file bind-mounts where rename(dest, dest.bak) returns EBUSY.
func replaceFileCopyInPlace(source, dest string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	// Open existing dest first so we keep the bind-mount target.
	f, err := os.OpenFile(dest, os.O_WRONLY|os.O_TRUNC, 0)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			// If dest exists but is not writable, surface that error.
			if _, statErr := os.Stat(dest); statErr == nil {
				return err
			}
		}
		f, err = os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			return err
		}
	}
	_, werr := f.Write(data)
	serr := f.Sync()
	cerr := f.Close()
	if werr != nil {
		return werr
	}
	if serr != nil {
		return serr
	}
	if cerr != nil {
		return cerr
	}
	_ = os.Remove(source)
	return nil
}
