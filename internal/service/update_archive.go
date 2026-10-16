package service

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func extractUpdateArchive(archivePath, destDir string) error {
	switch {
	case strings.HasSuffix(archivePath, ".zip"):
		return extractZipArchive(archivePath, destDir)
	case strings.HasSuffix(archivePath, ".tar.gz"), strings.HasSuffix(archivePath, ".tgz"), strings.HasSuffix(archivePath, ".gz"):
		return extractTarGzipArchive(archivePath, destDir)
	case strings.HasSuffix(archivePath, ".tar"):
		return extractTarArchiveFile(archivePath, destDir)
	default:
		return fmt.Errorf("不支持的压缩包格式: %s", filepath.Base(archivePath))
	}
}

func extractTarGzipArchive(archivePath, destDir string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()
	gzr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gzr.Close()
	return extractTar(gzr, destDir)
}

func extractTarArchiveFile(archivePath, destDir string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()
	return extractTar(f, destDir)
}

func extractTar(reader io.Reader, destDir string) error {
	tr := tar.NewReader(reader)
	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		target, err := safeExtractPath(destDir, header.Name)
		if err != nil {
			return err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if header.Size > maxUpdateDownload {
				return fmt.Errorf("压缩包条目过大: %s", header.Name)
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(out, io.LimitReader(tr, maxUpdateDownload+1))
			closeErr := out.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		}
	}
}

func extractZipArchive(archivePath, destDir string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()
	for _, file := range reader.File {
		target, err := safeExtractPath(destDir, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if file.UncompressedSize64 > uint64(maxUpdateDownload) {
			return fmt.Errorf("压缩包条目过大: %s", file.Name)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		in, err := file.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			_ = in.Close()
			return err
		}
		_, copyErr := io.Copy(out, io.LimitReader(in, maxUpdateDownload+1))
		closeInErr := in.Close()
		closeOutErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeInErr != nil {
			return closeInErr
		}
		if closeOutErr != nil {
			return closeOutErr
		}
	}
	return nil
}

func safeExtractPath(destDir, name string) (string, error) {
	cleanName := filepath.Clean(filepath.FromSlash(name))
	if cleanName == "." || cleanName == string(filepath.Separator) {
		return "", fmt.Errorf("压缩包路径无效: %q", name)
	}
	if filepath.IsAbs(cleanName) || cleanName == ".." || strings.HasPrefix(cleanName, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("不安全的压缩包路径: %q", name)
	}
	target := filepath.Join(destDir, cleanName)
	base, err := filepath.Abs(destDir)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if resolved != base && !strings.HasPrefix(resolved, base+string(filepath.Separator)) {
		return "", fmt.Errorf("不安全的压缩包路径: %q", name)
	}
	return resolved, nil
}

func findExtractedBinary(root string) (string, error) {
	name := "chatgpt2api"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	var found string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Name() == name {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("发布包中未找到 %s", name)
	}
	return found, nil
}
