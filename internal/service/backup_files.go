package service

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (s *BackupService) pruneBackupsLocked(dir string, keep int) int {
	if keep <= 0 {
		keep = 20
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	type backupEntry struct {
		path string
		name string
		mod  time.Time
	}
	items := make([]backupEntry, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "shengtu-backup-") || !strings.HasSuffix(entry.Name(), ".zip") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		items = append(items, backupEntry{path: filepath.Join(dir, entry.Name()), name: entry.Name(), mod: info.ModTime()})
	}
	sort.Slice(items, func(i, j int) bool {
		if !items[i].mod.Equal(items[j].mod) {
			return items[i].mod.After(items[j].mod)
		}
		return items[i].name > items[j].name
	})
	if len(items) <= keep {
		return 0
	}
	removed := 0
	for _, item := range items[keep:] {
		if err := os.Remove(item.path); err == nil {
			removed++
		}
	}
	return removed
}

// backupCriticalDataFiles are always force-added when include contains "data".
// Covers account pool, isolation cabin, registration quota ledger, and device
// cookie secret so disaster recovery restores the same operational state.
// (Walk still picks up other .json/.db files under dataDir.)
var backupCriticalDataFiles = []string{
	"settings.env",
	"accounts.json",
	"auth_keys.json",
	"account_quarantine.json",
	"registration_quota.json",
	"device_id.secret",
	"email_settings.secret",
	"chatgpt2api.db",
	"chatgpt2api.db-wal",
	"chatgpt2api.db-shm",
}

func effectiveBackupIncludes(cfg BackupConfig) map[string]bool {
	includes := stringSet(cfg.Include)
	if len(includes) == 0 {
		includes = stringSet([]string{"config", "data", "images"})
	}
	return includes
}

func (s *BackupService) collectFiles(cfg BackupConfig) ([]backupFile, error) {
	return s.collectFilesExcluding(cfg, nil)
}

func (s *BackupService) collectFilesExcluding(cfg BackupConfig, excludedPaths []string) ([]backupFile, error) {
	includes := effectiveBackupIncludes(cfg)
	var files []backupFile
	seen := map[string]struct{}{}
	excluded := map[string]struct{}{}
	for _, path := range excludedPaths {
		if strings.TrimSpace(path) != "" {
			excluded[strings.ToLower(normalizePathKey(path))] = struct{}{}
		}
	}
	addFile := func(path string) error {
		abs, err := filepath.Abs(path)
		if err != nil {
			return fmt.Errorf("解析文件路径 %s: %w", path, err)
		}
		if _, skip := excluded[strings.ToLower(filepath.Clean(abs))]; skip {
			return nil
		}
		info, err := os.Stat(abs)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return fmt.Errorf("检查文件 %s: %w", path, err)
		}
		if info.IsDir() {
			return nil
		}
		if _, ok := seen[abs]; ok {
			return nil
		}
		seen[abs] = struct{}{}
		rel, err := filepath.Rel(s.rootDir, path)
		if err != nil || strings.HasPrefix(rel, "..") {
			rel = filepath.Base(path)
		}
		files = append(files, backupFile{Path: path, Name: rel})
		return nil
	}
	if includes["config"] {
		for _, item := range []string{".env", "config.json"} {
			if err := addFile(filepath.Join(s.rootDir, item)); err != nil {
				return nil, err
			}
		}
		if err := addFile(filepath.Join(s.dataDir, "settings.env")); err != nil {
			return nil, err
		}
		if envFile := strings.TrimSpace(os.Getenv("CHATGPT2API_SETTINGS_ENV_FILE")); envFile != "" {
			if err := addFile(envFile); err != nil {
				return nil, err
			}
		}
	}
	if includes["data"] {
		if err := filepath.WalkDir(s.dataDir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				name := strings.ToLower(d.Name())
				if name == "backups" {
					return filepath.SkipDir
				}
				if !includes["images"] && isBackupImageDirName(name) {
					return filepath.SkipDir
				}
				return nil
			}
			if backupDataFileAllowed(path) {
				return addFile(path)
			}
			return nil
		}); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		// Explicit pin: quarantine + quota ledger + device secret (and pool files).
		for _, name := range backupCriticalDataFiles {
			if err := addFile(filepath.Join(s.dataDir, name)); err != nil {
				return nil, err
			}
		}
	}
	if includes["images"] {
		for _, dir := range []string{"images", "image-thumbnails", "image_thumbnails", "login-page-images", "login_page_images", "announcement-images", "announcement_images"} {
			for _, base := range []string{filepath.Join(s.rootDir, dir), filepath.Join(s.dataDir, dir)} {
				if !dirExists(base) {
					continue
				}
				if err := filepath.WalkDir(base, func(path string, d os.DirEntry, err error) error {
					if err != nil {
						return err
					}
					if d.IsDir() {
						return nil
					}
					return addFile(path)
				}); err != nil {
					return nil, err
				}
			}
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	return files, nil
}

func backupDataFileAllowed(path string) bool {
	name := strings.ToLower(filepath.Base(path))
	// Non-json secrets / cabin / runtime settings files that must ride with account-pool backups.
	switch name {
	case "settings.env", "device_id.secret", "email_settings.secret", "account_quarantine.json", "registration_quota.json":
		return true
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ext == ".json" || ext == ".db" {
		return true
	}
	return strings.HasSuffix(name, ".db-wal") || strings.HasSuffix(name, ".db-shm")
}

func isBackupImageDirName(name string) bool {
	switch strings.ReplaceAll(name, "_", "-") {
	case "images", "image-thumbnails", "login-page-images", "announcement-images":
		return true
	default:
		return false
	}
}

type backupFile struct {
	Path string
	Name string
}

func writeBackupZip(ctx context.Context, target string, files []backupFile) error {
	if ctx == nil {
		ctx = context.Background()
	}
	part := target + ".part"
	if err := os.Remove(part); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("清理旧临时文件: %w", err)
	}
	if _, err := os.Stat(target); err == nil {
		return fmt.Errorf("备份目标已存在: %s", target)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("检查备份目标: %w", err)
	}
	out, err := os.OpenFile(part, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	removePart := true
	defer func() {
		if removePart {
			_ = os.Remove(part)
		}
	}()
	writeErr := writeBackupZipEntries(ctx, out, files)
	if writeErr == nil {
		writeErr = out.Sync()
	}
	closeErr := out.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.Rename(part, target); err != nil {
		return fmt.Errorf("提交备份文件: %w", err)
	}
	removePart = false
	return nil
}

func writeBackupZipEntries(ctx context.Context, out io.Writer, files []backupFile) error {
	zw := zip.NewWriter(out)
	for _, file := range files {
		if err := ctx.Err(); err != nil {
			return errors.Join(err, zw.Close())
		}
		in, err := os.Open(file.Path)
		if err != nil {
			lowerPath := strings.ToLower(file.Path)
			if os.IsNotExist(err) && (strings.HasSuffix(lowerPath, "-wal") || strings.HasSuffix(lowerPath, "-shm") || strings.HasSuffix(lowerPath, ".tmp")) {
				continue
			}
			return errors.Join(err, zw.Close())
		}
		w, err := zw.Create(filepath.ToSlash(file.Name))
		if err != nil {
			return errors.Join(err, in.Close(), zw.Close())
		}
		_, copyErr := io.Copy(w, contextReader{ctx: ctx, reader: in})
		if err := errors.Join(copyErr, in.Close()); err != nil {
			return errors.Join(err, zw.Close())
		}
	}
	return zw.Close()
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func stringSet(items []string) map[string]bool {
	out := map[string]bool{}
	for _, item := range items {
		if item = strings.TrimSpace(item); item != "" {
			out[item] = true
		}
	}
	return out
}

func dirExists(path string) bool { info, err := os.Stat(path); return err == nil && info.IsDir() }
