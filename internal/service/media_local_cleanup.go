package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"

	"github.com/google/uuid"
)

const mediaLocalCleanupPageSize = 200

type MediaLocalCleanupStatus struct {
	State             string `json:"state"`
	Mode              string `json:"mode"`
	Total             int    `json:"total"`
	Processed         int    `json:"processed"`
	Eligible          int    `json:"eligible"`
	Verified          int    `json:"verified"`
	Skipped           int    `json:"skipped"`
	Failed            int    `json:"failed"`
	RemovedFiles      int    `json:"removed_files"`
	ReclaimableBytes  int64  `json:"reclaimable_bytes"`
	FreedBytes        int64  `json:"freed_bytes"`
	ConfirmationToken string `json:"confirmation_token,omitempty"`
	StartedAt         string `json:"started_at,omitempty"`
	FinishedAt        string `json:"finished_at,omitempty"`
	Error             string `json:"error,omitempty"`
}

type mediaLocalCleanupRuntime struct {
	mu     sync.RWMutex
	status MediaLocalCleanupStatus
}

type localMediaCopy struct {
	path string
	size int64
}

func (m *MediaLibrary) LocalCleanupStatus() MediaLocalCleanupStatus {
	if m == nil {
		return MediaLocalCleanupStatus{State: "idle"}
	}
	m.cleanup.mu.RLock()
	status := m.cleanup.status
	m.cleanup.mu.RUnlock()
	if status.State == "" {
		status.State = "idle"
	}
	return status
}

func (m *MediaLibrary) TriggerLocalCleanup(mode, confirmationToken string) MediaLocalCleanupStatus {
	if m == nil {
		return MediaLocalCleanupStatus{State: "failed", Mode: mode, Error: "R2 媒体存储未初始化"}
	}
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode != "verify" && mode != "delete" {
		return MediaLocalCleanupStatus{State: "failed", Mode: mode, Error: "本地副本任务模式无效"}
	}
	if m.MigrationStatus().State == "running" {
		return MediaLocalCleanupStatus{State: "failed", Mode: mode, Error: "旧图片迁移正在运行，请等待完成"}
	}
	m.cleanup.mu.Lock()
	current := m.cleanup.status
	if current.State == "running" {
		m.cleanup.mu.Unlock()
		return current
	}
	if mode == "delete" && (current.State != "succeeded" || current.Mode != "verify" || current.ConfirmationToken == "" || current.ConfirmationToken != strings.TrimSpace(confirmationToken)) {
		m.cleanup.mu.Unlock()
		return MediaLocalCleanupStatus{State: "failed", Mode: mode, Error: "请先完成 R2 副本验证，再确认清理"}
	}
	status := MediaLocalCleanupStatus{State: "running", Mode: mode, StartedAt: util.NowISO()}
	m.cleanup.status = status
	m.cleanup.mu.Unlock()
	ctx := m.rootCtx
	if ctx == nil {
		ctx = context.Background()
	}
	go m.runLocalCleanup(ctx, mode)
	return status
}

func (m *MediaLibrary) runLocalCleanup(ctx context.Context, mode string) {
	assets, err := m.listReadyMediaAssets()
	if err != nil {
		m.finishLocalCleanup(err)
		return
	}
	m.updateLocalCleanup(func(status *MediaLocalCleanupStatus) { status.Total = len(assets) })
	for _, asset := range assets {
		if err := ctx.Err(); err != nil {
			m.finishLocalCleanup(err)
			return
		}
		copies, verifyErr := m.verifyLocalMediaCopy(ctx, asset)
		m.updateLocalCleanup(func(status *MediaLocalCleanupStatus) {
			status.Processed++
			if verifyErr != nil {
				status.Failed++
				status.Error = verifyErr.Error()
				return
			}
			status.Verified++
			if len(copies) == 0 {
				status.Skipped++
				return
			}
			status.Eligible++
			for _, copy := range copies {
				status.ReclaimableBytes += copy.size
			}
		})
		if verifyErr != nil || mode != "delete" {
			continue
		}
		if len(copies) == 0 {
			m.deleteLocalImageDocuments(asset.Path)
			continue
		}
		removed, freed, removeErr := removeLocalMediaCopies(copies)
		if removeErr == nil {
			m.deleteLocalImageDocuments(asset.Path)
		}
		m.updateLocalCleanup(func(status *MediaLocalCleanupStatus) {
			status.RemovedFiles += removed
			status.FreedBytes += freed
			if removeErr != nil {
				status.Failed++
				status.Error = removeErr.Error()
			}
		})
	}
	m.finishLocalCleanup(nil)
}

func (m *MediaLibrary) listReadyMediaAssets() ([]storage.MediaAssetRecord, error) {
	items := make([]storage.MediaAssetRecord, 0)
	query := storage.MediaAssetListQuery{All: true, Limit: mediaLocalCleanupPageSize}
	for {
		page, err := m.repo.ListMediaAssets(query)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			if item.Status == mediaStatusReady {
				items = append(items, item)
			}
		}
		if !page.HasMore || len(page.Items) == 0 {
			return items, nil
		}
		last := page.Items[len(page.Items)-1]
		query.BeforeSortKey = last.CreatedAt
		query.BeforePath = last.Path
	}
}

func (m *MediaLibrary) verifyLocalMediaCopy(ctx context.Context, asset storage.MediaAssetRecord) ([]localMediaCopy, error) {
	if asset.Status != mediaStatusReady || strings.TrimSpace(asset.ObjectKey) == "" {
		return nil, errors.New("媒体记录尚未完成 R2 上传")
	}
	rel, err := cleanImageRelativePath(asset.Path)
	if err != nil {
		return nil, fmt.Errorf("媒体记录路径无效: %w", err)
	}
	info, err := m.objects.Head(ctx, asset.ObjectKey)
	if err != nil {
		return nil, err
	}
	if info.SizeBytes != asset.SizeBytes || info.SHA256 == "" || info.SHA256 != asset.SHA256 {
		return nil, fmt.Errorf("R2 原图校验失败：%s", asset.Path)
	}
	copies := make([]localMediaCopy, 0, 3)
	original := filepath.Join(m.config.ImagesDir(), filepath.FromSlash(rel))
	if copy, ok, err := inspectLocalCopy(original); err != nil {
		return nil, err
	} else if ok {
		if copy.size != asset.SizeBytes {
			return nil, fmt.Errorf("本地原图大小与记录不一致：%s", asset.Path)
		}
		hash, err := localMediaFileSHA256(copy.path)
		if err != nil {
			return nil, err
		}
		if hash != asset.SHA256 {
			return nil, fmt.Errorf("本地原图摘要与记录不一致：%s", asset.Path)
		}
		copies = append(copies, copy)
	}
	thumbnail := filepath.Join(m.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+thumbnailExtension)
	if asset.ThumbnailKey != "" {
		thumbInfo, err := m.objects.Head(ctx, asset.ThumbnailKey)
		if err != nil {
			return nil, err
		}
		if thumbInfo.SizeBytes <= 0 || thumbInfo.SHA256 == "" {
			return nil, fmt.Errorf("R2 缩略图校验失败：%s", asset.Path)
		}
		if copy, ok, err := inspectLocalCopy(thumbnail); err != nil {
			return nil, err
		} else if ok {
			hash, err := localMediaFileSHA256(copy.path)
			if err != nil {
				return nil, err
			}
			if copy.size != thumbInfo.SizeBytes || hash != thumbInfo.SHA256 {
				return nil, fmt.Errorf("本地缩略图与 R2 不一致：%s", asset.Path)
			}
			copies = append(copies, copy)
		}
	}
	metadata := filepath.Join(m.config.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
	if copy, ok, err := inspectLocalCopy(metadata); err != nil {
		return nil, err
	} else if ok {
		copies = append(copies, copy)
	}
	return copies, nil
}

func inspectLocalCopy(path string) (localMediaCopy, bool, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return localMediaCopy{}, false, nil
	}
	if err != nil {
		return localMediaCopy{}, false, err
	}
	if info.IsDir() {
		return localMediaCopy{}, false, fmt.Errorf("本地媒体路径不是文件：%s", path)
	}
	return localMediaCopy{path: path, size: info.Size()}, true, nil
}

func localMediaFileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	_, copyErr := io.Copy(hash, file)
	closeErr := file.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func removeLocalMediaCopies(copies []localMediaCopy) (int, int64, error) {
	removed := 0
	var freed int64
	for _, copy := range copies {
		if err := os.Remove(copy.path); err != nil {
			return removed, freed, fmt.Errorf("删除本地媒体副本 %s: %w", copy.path, err)
		}
		removed++
		freed += copy.size
	}
	return removed, freed, nil
}

func (m *MediaLibrary) deleteLocalImageDocuments(assetPath string) {
	if m == nil || m.documents == nil {
		return
	}
	rel, err := cleanImageRelativePath(assetPath)
	if err != nil {
		return
	}
	if _, statErr := os.Stat(filepath.Join(m.config.ImagesDir(), filepath.FromSlash(rel))); !errors.Is(statErr, os.ErrNotExist) {
		return
	}
	_ = m.documents.DeleteJSONDocument(imageOwnerDocumentName(rel))
	_ = m.documents.DeleteJSONDocument(thumbnailMetadataDocumentName(rel))
}

func (m *MediaLibrary) updateLocalCleanup(update func(*MediaLocalCleanupStatus)) {
	m.cleanup.mu.Lock()
	update(&m.cleanup.status)
	m.cleanup.mu.Unlock()
}

func (m *MediaLibrary) finishLocalCleanup(err error) {
	m.updateLocalCleanup(func(status *MediaLocalCleanupStatus) {
		status.FinishedAt = util.NowISO()
		if err != nil {
			status.State = "failed"
			status.Error = strings.TrimSpace(err.Error())
			return
		}
		status.State = "succeeded"
		if status.Mode == "verify" {
			status.ConfirmationToken = uuid.NewString()
		}
	})
}
