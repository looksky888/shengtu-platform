package hostupdate

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func (s *coldBackupStore) Restore(ctx context.Context, artifact BackupArtifact) error {
	hash, size, err := hashFile(artifact.Path)
	if err != nil {
		return err
	}
	if hash != artifact.SHA256 || size != artifact.Size {
		return errors.New("更新备份完整性校验失败")
	}
	archive, err := zip.OpenReader(artifact.Path)
	if err != nil {
		return fmt.Errorf("打开更新备份: %w", err)
	}
	defer archive.Close()
	for _, entry := range archive.File {
		if err := ctx.Err(); err != nil {
			return err
		}
		root, target, err := s.restoreTarget(entry.Name)
		if err != nil {
			return err
		}
		if err := restoreBackupEntry(entry, root, target); err != nil {
			return err
		}
	}
	return nil
}

func (s *coldBackupStore) restoreTarget(name string) (string, string, error) {
	clean := filepath.Clean(filepath.FromSlash(name))
	parts := strings.Split(clean, string(filepath.Separator))
	if len(parts) < 2 || parts[0] == "." || parts[1] == "" {
		return "", "", fmt.Errorf("备份条目路径无效: %s", name)
	}
	var configuredRoot string
	switch parts[0] {
	case "install":
		configuredRoot = s.installDir
	case "data":
		configuredRoot = s.dataDir
	default:
		return "", "", fmt.Errorf("备份条目根目录无效: %s", name)
	}
	root, err := filepath.EvalSymlinks(configuredRoot)
	if err != nil {
		return "", "", fmt.Errorf("解析备份恢复目录: %w", err)
	}
	target := filepath.Join(root, filepath.Join(parts[1:]...))
	if _, err := safeRelative(root, target); err != nil {
		return "", "", err
	}
	return root, target, nil
}

func restoreBackupEntry(entry *zip.File, root, target string) error {
	if entry.FileInfo().IsDir() {
		return nil
	}
	if entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() {
		return fmt.Errorf("备份条目不是普通文件: %s", entry.Name)
	}
	if err := makeSafeParent(root, filepath.Dir(target)); err != nil {
		return err
	}
	if info, err := os.Lstat(target); err == nil && (!info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0) {
		return fmt.Errorf("拒绝覆盖非普通文件: %s", target)
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	source, err := entry.Open()
	if err != nil {
		return err
	}
	defer source.Close()
	tmp, err := os.CreateTemp(filepath.Dir(target), ".restore-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := io.Copy(tmp, source); err != nil {
		_ = tmp.Close()
		return err
	}
	mode := entry.Mode().Perm()
	if mode == 0 {
		mode = 0o600
	}
	if err := tmp.Chmod(mode); err != nil {
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
	return replaceFile(tmpPath, target)
}

func makeSafeParent(root, parent string) error {
	rel, err := safeRelative(root, parent)
	if err != nil {
		return err
	}
	current := root
	if rel == "." {
		return nil
	}
	for _, part := range strings.Split(rel, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) {
			if err := os.Mkdir(current, 0o700); err != nil && !errors.Is(err, os.ErrExist) {
				return err
			}
			info, err = os.Lstat(current)
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("恢复路径包含非目录或符号链接: %s", current)
		}
	}
	return nil
}

func replaceFile(source, target string) error {
	if err := os.Rename(source, target); err == nil {
		return nil
	} else if _, statErr := os.Lstat(target); statErr != nil {
		return err
	}
	placeholder, err := os.CreateTemp(filepath.Dir(target), ".replace-old-*.tmp")
	if err != nil {
		return err
	}
	oldPath := placeholder.Name()
	if err := placeholder.Close(); err != nil {
		return err
	}
	if err := os.Remove(oldPath); err != nil {
		return err
	}
	if err := os.Rename(target, oldPath); err != nil {
		return err
	}
	if err := os.Rename(source, target); err != nil {
		_ = os.Rename(oldPath, target)
		return err
	}
	return os.Remove(oldPath)
}

func hashFile(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, file)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(hash.Sum(nil)), size, nil
}

