package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"

	"github.com/google/uuid"
)

type MediaMigrationStatus struct {
	State      string `json:"state"`
	Total      int    `json:"total"`
	Processed  int    `json:"processed"`
	Migrated   int    `json:"migrated"`
	Skipped    int    `json:"skipped"`
	Pending    int    `json:"pending"`
	Failed     int    `json:"failed"`
	StartedAt  string `json:"started_at,omitempty"`
	FinishedAt string `json:"finished_at,omitempty"`
	Error      string `json:"error,omitempty"`
}

type mediaMigrationRuntime struct {
	mu     sync.RWMutex
	status MediaMigrationStatus
}

func (m *MediaLibrary) MigrationStatus() MediaMigrationStatus {
	if m == nil {
		return MediaMigrationStatus{State: "idle"}
	}
	m.migrate.mu.RLock()
	status := m.migrate.status
	m.migrate.mu.RUnlock()
	if status.State == "" {
		status.State = "idle"
	}
	return status
}

func (m *MediaLibrary) TriggerLegacyImageMigration() MediaMigrationStatus {
	if m == nil {
		return MediaMigrationStatus{State: "failed", Error: "R2 媒体存储未初始化"}
	}
	if m.LocalCleanupStatus().State == "running" {
		return MediaMigrationStatus{State: "failed", Error: "本地副本验证或清理正在运行，请等待完成"}
	}
	m.migrate.mu.Lock()
	if m.migrate.status.State == "running" {
		status := m.migrate.status
		m.migrate.mu.Unlock()
		return status
	}
	status := MediaMigrationStatus{State: "running", StartedAt: util.NowISO()}
	m.migrate.status = status
	m.migrate.mu.Unlock()
	ctx := m.rootCtx
	if ctx == nil {
		ctx = context.Background()
	}
	go m.runLegacyImageMigration(ctx)
	return status
}

func (m *MediaLibrary) runLegacyImageMigration(ctx context.Context) {
	paths, err := collectLegacyImagePaths(m.config.ImagesDir())
	if err != nil {
		m.finishMigration(err)
		return
	}
	m.updateMigration(func(status *MediaMigrationStatus) { status.Total = len(paths) })
	for _, rel := range paths {
		if err := ctx.Err(); err != nil {
			m.finishMigration(err)
			return
		}
		result, migrateErr := m.migrateLegacyImage(ctx, rel)
		m.updateMigration(func(status *MediaMigrationStatus) {
			status.Processed++
			switch result {
			case "migrated":
				status.Migrated++
			case "pending":
				status.Migrated++
				status.Pending++
			case "skipped":
				status.Skipped++
			default:
				status.Failed++
			}
			if migrateErr != nil {
				status.Error = migrateErr.Error()
			}
		})
	}
	m.finishMigration(nil)
}

func collectLegacyImagePaths(root string) ([]string, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	paths := []string{}
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel, err = cleanImageRelativePath(filepath.ToSlash(rel))
		if err == nil {
			paths = append(paths, rel)
		}
		return nil
	})
	if errors.Is(err, os.ErrNotExist) {
		return paths, nil
	}
	return paths, err
}

func (m *MediaLibrary) migrateLegacyImage(ctx context.Context, rel string) (string, error) {
	if _, exists, err := m.repo.LoadMediaAsset(rel); err != nil {
		return "failed", err
	} else if exists {
		return "skipped", nil
	}
	path := filepath.Join(m.config.ImagesDir(), filepath.FromSlash(rel))
	data, err := os.ReadFile(path)
	if err != nil {
		return "failed", err
	}
	decoded, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "skipped", nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return "failed", err
	}
	meta := m.legacyImageMetadata(rel)
	id := uuid.NewString()
	ext := mediaImageExtension(meta.OutputFormat, format)
	created := info.ModTime().In(time.FixedZone("CST", 8*60*60))
	ownerSegment := mediaOwnerSegment(meta.OwnerID)
	objectKey := m.objectKey("images", ownerSegment, created.Format("2006"), created.Format("01"), id+ext)
	thumbnailKey := m.objectKey("thumbnails", ownerSegment, created.Format("2006"), created.Format("01"), id+".jpg")
	sha := sha256.Sum256(data)
	if err := storage.AtomicWriteFile(m.spoolPath(id, "original"), data, 0o600); err != nil {
		return "failed", err
	}
	thumbnail, thumbErr := mediaThumbnailBytes(data)
	if thumbErr != nil {
		thumbnailKey = ""
	} else if err := storage.AtomicWriteFile(m.spoolPath(id, "thumbnail"), thumbnail, 0o600); err != nil {
		m.removeSpoolFiles(id)
		return "failed", err
	}
	createdAt := created.Format(time.RFC3339Nano)
	asset := storage.MediaAssetRecord{
		ID: id, Path: rel, OwnerID: meta.OwnerID, OwnerName: meta.OwnerName, MediaType: "image",
		ObjectKey: objectKey, ThumbnailKey: thumbnailKey, ContentType: http.DetectContentType(data), SizeBytes: info.Size(),
		SHA256: hex.EncodeToString(sha[:]), Width: decoded.Width, Height: decoded.Height,
		Visibility: firstNonEmptyString(meta.Visibility, ImageVisibilityPrivate), Status: mediaStatusPending,
		ResolutionPreset: meta.ResolutionPreset, RequestedSize: meta.RequestedSize, OutputFormat: meta.OutputFormat,
		CreatedAt: createdAt, PublishedAt: meta.PublishedAt, UpdatedAt: util.NowISO(), RetryAt: util.NowISO(),
	}
	if err := m.repo.SaveMediaAsset(asset); err != nil {
		m.removeSpoolFiles(id)
		return "failed", err
	}
	if err := m.uploadPending(ctx, asset); err != nil {
		m.recordUploadFailure(asset, err)
		return "pending", err
	}
	m.removeSpoolFiles(id)
	return "migrated", nil
}

func (m *MediaLibrary) legacyImageMetadata(rel string) imageMetadata {
	metaPath := filepath.Join(m.config.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
	var documents storage.JSONDocumentBackend
	if backend, ok := m.repo.(storage.JSONDocumentBackend); ok {
		documents = backend
	}
	raw := loadStoredJSON(documents, imageOwnerDocumentName(rel), metaPath)
	if data, ok := raw.(map[string]any); ok {
		return normalizeImageMetadata(data)
	}
	return imageMetadata{Visibility: ImageVisibilityPrivate}
}

func (m *MediaLibrary) updateMigration(update func(*MediaMigrationStatus)) {
	m.migrate.mu.Lock()
	update(&m.migrate.status)
	m.migrate.mu.Unlock()
}

func (m *MediaLibrary) finishMigration(err error) {
	m.updateMigration(func(status *MediaMigrationStatus) {
		status.FinishedAt = util.NowISO()
		if err != nil {
			status.State = "failed"
			status.Error = strings.TrimSpace(err.Error())
			return
		}
		status.State = "succeeded"
	})
	if m.logger != nil {
		status := m.MigrationStatus()
		if err != nil {
			m.logger.Error("legacy image migration failed", "processed", status.Processed, "error", err.Error())
		} else {
			m.logger.Info("legacy image migration completed", "processed", status.Processed, "migrated", status.Migrated, "pending", status.Pending, "failed", status.Failed)
		}
	}
}

type MediaR2ConnectionConfig struct {
	AccountID       string `json:"account_id"`
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	Bucket          string `json:"bucket"`
}

func TestMediaR2Connection(ctx context.Context, cfg MediaR2ConnectionConfig) error {
	objects, err := newR2ObjectStore(ctx, r2ObjectStoreConfig(cfg))
	if err != nil {
		return fmt.Errorf("初始化 R2 连接: %w", err)
	}
	return objects.Health(ctx)
}
