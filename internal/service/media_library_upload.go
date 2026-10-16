package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func acquireMediaSemaphore(ctx context.Context, sem chan struct{}) (func(), bool) {
	if sem == nil {
		return func() {}, true
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case sem <- struct{}{}:
		return func() { <-sem }, true
	case <-ctx.Done():
		return nil, false
	}
}

func (m *MediaLibrary) spoolPath(id, variant string) string {
	return filepath.Join(m.spoolDir, id+"."+variant)
}

func (m *MediaLibrary) uploadPending(ctx context.Context, asset storage.MediaAssetRecord) error {
	releaseUpload, ok := acquireMediaSemaphore(ctx, m.uploadSem)
	if !ok {
		return ctx.Err()
	}
	defer releaseUpload()
	release := m.lockMediaAsset(asset.ID)
	defer release()
	current, ok, err := m.repo.LoadMediaAssetByID(asset.ID)
	if err != nil {
		return err
	}
	if ok {
		if current.Status == mediaStatusReady {
			return nil
		}
		asset = current
	} else {
		return nil
	}
	if err := m.objects.PutFile(ctx, asset.ObjectKey, m.spoolPath(asset.ID, "original"), asset.ContentType, asset.SHA256); err != nil {
		return err
	}
	info, err := m.objects.Head(ctx, asset.ObjectKey)
	if err != nil {
		return err
	}
	if info.SizeBytes != asset.SizeBytes || (info.SHA256 != "" && info.SHA256 != asset.SHA256) {
		return fmt.Errorf("R2 原图校验失败：size=%d/%d sha256=%s/%s", info.SizeBytes, asset.SizeBytes, info.SHA256, asset.SHA256)
	}
	if asset.ThumbnailKey != "" {
		thumbPath := m.spoolPath(asset.ID, "thumbnail")
		thumbData, readErr := os.ReadFile(thumbPath)
		if readErr != nil {
			return fmt.Errorf("读取缩略图缓冲: %w", readErr)
		}
		thumbHash := sha256.Sum256(thumbData)
		thumbSHA := hex.EncodeToString(thumbHash[:])
		if err := m.objects.PutFile(ctx, asset.ThumbnailKey, thumbPath, "image/jpeg", thumbSHA); err != nil {
			return err
		}
		thumbInfo, err := m.objects.Head(ctx, asset.ThumbnailKey)
		if err != nil {
			return err
		}
		if thumbInfo.SizeBytes != int64(len(thumbData)) || (thumbInfo.SHA256 != "" && thumbInfo.SHA256 != thumbSHA) {
			return fmt.Errorf("R2 缩略图校验失败：size=%d/%d sha256=%s/%s", thumbInfo.SizeBytes, len(thumbData), thumbInfo.SHA256, thumbSHA)
		}
	}
	return m.repo.UpdateMediaAssetUploadState(asset.ID, mediaStatusReady, util.NowISO(), "", "")
}

func (m *MediaLibrary) recordUploadFailure(asset storage.MediaAssetRecord, uploadErr error) {
	retryAt := util.NowChina().Add(time.Minute).Format(time.RFC3339Nano)
	if saveErr := m.repo.UpdateMediaAssetUploadState(asset.ID, mediaStatusPending, util.NowISO(), retryAt, uploadErr.Error()); saveErr != nil && m.logger != nil {
		m.logger.Error("persist pending media upload failed", "media_id", asset.ID, "error", saveErr.Error())
	}
	if m.logger != nil {
		m.logger.Warning("media upload queued for retry", "media_id", asset.ID, "error", uploadErr.Error())
	}
}

func (m *MediaLibrary) Start(ctx context.Context) {
	if m == nil {
		return
	}
	if ctx == nil {
		ctx = m.rootCtx
	}
	if ctx == nil {
		ctx = context.Background()
	}
	m.startOnce.Do(func() {
		if m.uploadQueue == nil {
			m.uploadQueue = make(chan storage.MediaAssetRecord, defaultMediaUploadQueueCapacity)
		}
		for range defaultMediaUploadConcurrency {
			go m.runUploadWorker(ctx)
		}
		go m.runPendingUploadDispatcher(ctx)
	})
}

func (m *MediaLibrary) enqueueUpload(asset storage.MediaAssetRecord) bool {
	if m == nil || m.uploadQueue == nil {
		return false
	}
	select {
	case m.uploadQueue <- asset:
		return true
	default:
		return false
	}
}

func (m *MediaLibrary) runUploadWorker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case asset := <-m.uploadQueue:
			if err := m.uploadPending(ctx, asset); err != nil {
				m.recordUploadFailure(asset, err)
				continue
			}
			m.removeSpoolFiles(asset.ID)
		}
	}
}

func (m *MediaLibrary) runPendingUploadDispatcher(ctx context.Context) {
	m.dispatchPending(ctx)
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.dispatchPending(ctx)
		}
	}
}

func (m *MediaLibrary) dispatchPending(ctx context.Context) {
	items, err := m.repo.ListPendingMediaAssets(100)
	if err != nil {
		if m.logger != nil {
			m.logger.Warning("list pending media uploads failed", "error", err.Error())
		}
		return
	}
	for _, item := range items {
		select {
		case <-ctx.Done():
			return
		case m.uploadQueue <- item:
		}
	}
}

func (m *MediaLibrary) retryPending(ctx context.Context) {
	items, err := m.repo.ListPendingMediaAssets(100)
	if err != nil {
		if m.logger != nil {
			m.logger.Warning("list pending media uploads failed", "error", err.Error())
		}
		return
	}
	for _, item := range items {
		if ctx.Err() != nil {
			return
		}
		if err := m.uploadPending(ctx, item); err != nil {
			m.recordUploadFailure(item, err)
			continue
		}
		m.removeSpoolFiles(item.ID)
	}
}

func (m *MediaLibrary) removeSpoolFiles(id string) {
	_ = os.Remove(m.spoolPath(id, "original"))
	_ = os.Remove(m.spoolPath(id, "thumbnail"))
}
