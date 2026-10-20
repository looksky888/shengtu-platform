package service

import (
	"fmt"
	"io"
	"os"
	"sync"
)

// Server log rotation bounds. server.log used to be opened in append mode with
// no rotation at all, so a long-running instance could fill the data volume.
// Total footprint stays at (maxRotatedFiles+1) * maxBytes.
const (
	defaultServerLogMaxBytes       = 16 << 20 // 16 MiB per file
	defaultServerLogMaxRotatedFile = 3        // server.log, .1, .2, .3
)

// rotatingFileWriter appends to path and rotates it once maxBytes would be
// exceeded, keeping at most maxRotatedFiles rotated files (path.1 is newest).
type rotatingFileWriter struct {
	mu             sync.Mutex
	path           string
	maxBytes       int64
	maxRotatedFile int
	file           *os.File
	size           int64
}

func newRotatingFileWriter(path string, maxBytes int64, maxRotatedFile int) (*rotatingFileWriter, error) {
	if maxBytes < 1 {
		maxBytes = defaultServerLogMaxBytes
	}
	if maxRotatedFile < 1 {
		maxRotatedFile = defaultServerLogMaxRotatedFile
	}
	writer := &rotatingFileWriter{path: path, maxBytes: maxBytes, maxRotatedFile: maxRotatedFile}
	if err := writer.open(); err != nil {
		return nil, err
	}
	return writer, nil
}

func (w *rotatingFileWriter) open() error {
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return err
	}
	w.file = file
	w.size = info.Size()
	return nil
}

func (w *rotatingFileWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		if err := w.open(); err != nil {
			return 0, err
		}
	}
	// Rotate before writing, so one oversized entry still lands in a fresh file.
	if w.size > 0 && w.size+int64(len(p)) > w.maxBytes {
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}
	written, err := w.file.Write(p)
	w.size += int64(written)
	return written, err
}

func (w *rotatingFileWriter) rotate() error {
	if err := w.file.Close(); err != nil {
		return err
	}
	w.file = nil
	// Drop the oldest, then shift .N-1 -> .N ... .1 -> .2, then current -> .1.
	_ = os.Remove(serverLogRotationPath(w.path, w.maxRotatedFile))
	for index := w.maxRotatedFile - 1; index >= 1; index-- {
		from := serverLogRotationPath(w.path, index)
		if _, err := os.Stat(from); err != nil {
			continue
		}
		if err := os.Rename(from, serverLogRotationPath(w.path, index+1)); err != nil {
			return err
		}
	}
	if err := os.Rename(w.path, serverLogRotationPath(w.path, 1)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return w.open()
}

func (w *rotatingFileWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

func serverLogRotationPath(path string, index int) string {
	return fmt.Sprintf("%s.%d", path, index)
}

var _ io.Writer = (*rotatingFileWriter)(nil)
var _ io.Closer = (*rotatingFileWriter)(nil)
