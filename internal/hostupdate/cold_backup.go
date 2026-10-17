package hostupdate

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type backupStore interface {
	Create(context.Context, string) (BackupArtifact, error)
	Restore(context.Context, BackupArtifact) error
}

type coldBackupStore struct {
	installDir   string
	dataDir      string
	backupDir    string
	stateDir     string
	composeFiles []string
}

func newColdBackupStore(opts Options) *coldBackupStore {
	return &coldBackupStore{
		installDir: opts.InstallDir, dataDir: opts.DataDir, backupDir: opts.BackupDir,
		stateDir: opts.StateDir, composeFiles: append([]string(nil), opts.ComposeFiles...),
	}
}

func (s *coldBackupStore) Create(ctx context.Context, taskID string) (BackupArtifact, error) {
	if !versionPattern.MatchString(taskID) {
		return BackupArtifact{}, errors.New("备份任务 ID 格式无效")
	}
	if err := os.MkdirAll(s.backupDir, 0o700); err != nil {
		return BackupArtifact{}, fmt.Errorf("创建更新备份目录: %w", err)
	}
	tmp, err := os.CreateTemp(s.backupDir, ".update-*.zip.tmp")
	if err != nil {
		return BackupArtifact{}, fmt.Errorf("创建更新备份: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return BackupArtifact{}, err
	}
	archive := zip.NewWriter(tmp)
	add := func(source, archiveName string) error {
		return addBackupFile(ctx, archive, source, archiveName)
	}
	if err := s.addDeploymentFiles(add); err != nil {
		_ = archive.Close()
		_ = tmp.Close()
		return BackupArtifact{}, err
	}
	if err := s.addDataFiles(ctx, add); err != nil {
		_ = archive.Close()
		_ = tmp.Close()
		return BackupArtifact{}, err
	}
	if err := archive.Close(); err != nil {
		_ = tmp.Close()
		return BackupArtifact{}, fmt.Errorf("完成更新备份: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return BackupArtifact{}, err
	}
	if err := tmp.Close(); err != nil {
		return BackupArtifact{}, err
	}
	finalPath := filepath.Join(s.backupDir, "update-"+taskID+".zip")
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return BackupArtifact{}, fmt.Errorf("提交更新备份: %w", err)
	}
	hash, size, err := hashFile(finalPath)
	if err != nil {
		return BackupArtifact{}, err
	}
	return BackupArtifact{Path: finalPath, SHA256: hash, Size: size, CreatedAt: nowISO()}, nil
}

func (s *coldBackupStore) addDeploymentFiles(add func(string, string) error) error {
	seen := map[string]struct{}{}
	candidates := append([]string{filepath.Join(s.installDir, ".env")}, s.composeFiles...)
	for _, candidate := range candidates {
		if !filepath.IsAbs(candidate) {
			candidate = filepath.Join(s.installDir, candidate)
		}
		candidate = filepath.Clean(candidate)
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		info, err := os.Stat(candidate)
		if errors.Is(err, os.ErrNotExist) && filepath.Base(candidate) == ".env" {
			continue
		}
		if err != nil {
			return fmt.Errorf("读取部署配置 %s: %w", candidate, err)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("部署配置不是普通文件: %s", candidate)
		}
		rel, err := safeRelative(s.installDir, candidate)
		if err != nil {
			return fmt.Errorf("部署配置必须位于安装目录: %w", err)
		}
		if err := add(candidate, filepath.ToSlash(filepath.Join("install", rel))); err != nil {
			return err
		}
	}
	return nil
}

func (s *coldBackupStore) addDataFiles(ctx context.Context, add func(string, string) error) error {
	root, err := filepath.EvalSymlinks(s.dataDir)
	if err != nil {
		return fmt.Errorf("解析数据目录: %w", err)
	}
	excluded := map[string]struct{}{
		"announcement_images": {}, "backups": {}, "grok-runtime": {}, "host-updater": {},
		"icloud-privacy-mail": {}, "image_metadata": {}, "image_thumbnails": {}, "images": {}, "login_page_images": {},
		"logs": {}, "media-spool": {}, "update-backups": {}, "video-reference-assets": {}, "videos": {},
	}
	return filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		rel, err := filepath.Rel(root, path)
		if err != nil || rel == "." {
			return err
		}
		first := strings.ToLower(strings.Split(filepath.ToSlash(rel), "/")[0])
		if _, skip := excluded[first]; skip {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("数据目录包含不受支持的符号链接: %s", path)
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("数据目录包含不受支持的文件类型: %s", path)
		}
		if !coldBackupDataFileAllowed(path) {
			return nil
		}
		return add(path, filepath.ToSlash(filepath.Join("data", rel)))
	})
}

func coldBackupDataFileAllowed(path string) bool {
	name := strings.ToLower(filepath.Base(path))
	ext := strings.ToLower(filepath.Ext(name))
	if ext == ".json" || ext == ".db" || ext == ".env" || ext == ".secret" {
		return true
	}
	return strings.HasSuffix(name, ".db-wal") || strings.HasSuffix(name, ".db-shm")
}

func addBackupFile(ctx context.Context, archive *zip.Writer, source, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	file, err := os.Open(source)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name, header.Method = name, zip.Store
	writer, err := archive.CreateHeader(header)
	if err != nil {
		return err
	}
	if _, err := io.Copy(writer, &contextReader{ctx: ctx, reader: file}); err != nil {
		return fmt.Errorf("备份 %s: %w", source, err)
	}
	return nil
}

func safeRelative(root, target string) (string, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("路径超出允许目录")
	}
	return rel, nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}
