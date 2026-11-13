package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
)

const (
	maxMediaCleanupAssetsPerRun = 1000
	mediaCleanupPageSize        = 100
)

// CleanupExpiredRemoteMediaWithPolicy enforces the Cloud Storage VIP master switch
// and dual grace buffers for scheduled R2 cleanup runs.
func (m *MediaLibrary) CleanupExpiredRemoteMediaWithPolicy(ctx context.Context, settings PaymentSettingsPublic) (int, error) {
	if m == nil || !settings.CloudStorageEnabled {
		return 0, nil
	}
	policyStart := strings.TrimSpace(settings.CloudStoragePolicyStartedAt)
	if policyStart == "" {
		return 0, nil
	}
	freeRetentionDays := settings.FreeRetentionDays
	if freeRetentionDays < 1 {
		freeRetentionDays = storage.DefaultFreeRetentionDays
	}
	historicalGraceDays := settings.HistoricalGraceDays
	if historicalGraceDays < 1 {
		historicalGraceDays = storage.DefaultHistoricalGraceDays
	}
	return m.cleanupExpiredRemoteMedia(ctx, freeRetentionDays, historicalGraceDays, policyStart)
}

// CleanupExpiredRemoteMedia removes expired unprotected image objects. Users
// within active VIP validity or VIP grace (expires_at + vip_grace_days > now)
// are fully protected. Pre-policy historical assets are protected until
// now >= policyStart + historical_grace_days, then cleaned in bounded sweeps.
func (m *MediaLibrary) CleanupExpiredRemoteMedia(ctx context.Context, retentionDays int, policyStart string) (int, error) {
	if m == nil || m.repo == nil || m.objects == nil || retentionDays < 1 {
		return 0, nil
	}
	historicalGraceDays := storage.DefaultHistoricalGraceDays
	if paymentRepo, ok := m.repo.(storage.PaymentBackend); ok {
		if settings, err := paymentRepo.LoadPaymentSettings(); err == nil && settings.HistoricalGraceDays > 0 {
			historicalGraceDays = settings.HistoricalGraceDays
		}
	}
	return m.cleanupExpiredRemoteMedia(ctx, retentionDays, historicalGraceDays, policyStart)
}

func (m *MediaLibrary) cleanupExpiredRemoteMedia(ctx context.Context, retentionDays, historicalGraceDays int, policyStart string) (int, error) {
	if m == nil || m.repo == nil || m.objects == nil || retentionDays < 1 {
		return 0, nil
	}
	policyStart = strings.TrimSpace(policyStart)
	if policyStart == "" {
		return 0, nil
	}
	if historicalGraceDays < 1 {
		historicalGraceDays = storage.DefaultHistoricalGraceDays
	}
	backend, ok := m.repo.(storage.MediaRetentionBackend)
	if !ok {
		return 0, fmt.Errorf("媒体存储后端不支持远端清理")
	}
	entitlements, ok := m.repo.(storage.PaymentStorageBackend)
	if !ok {
		return 0, fmt.Errorf("云存储权益后端未就绪")
	}
	now := m.now().UTC()
	active, err := entitlements.ListActiveStorageEntitlements(now.Format(time.RFC3339Nano))
	if err != nil {
		return 0, err
	}

	var (
		attempted int
		removed   int
		firstErr  error
	)

	sweep := func(fetch func(limit int, beforeKey, beforePath string) ([]storage.MediaAssetRecord, error)) error {
		var beforeKey, beforePath string
		for attempted < maxMediaCleanupAssetsPerRun {
			if err := ctx.Err(); err != nil {
				return err
			}
			items, err := fetch(mediaCleanupPageSize, beforeKey, beforePath)
			if err != nil {
				return err
			}
			if len(items) == 0 {
				return nil
			}
			for _, asset := range items {
				if attempted >= maxMediaCleanupAssetsPerRun {
					return nil
				}
				beforeKey, beforePath = asset.CreatedAt, asset.Path
				if strings.TrimSpace(asset.Visibility) == ImageVisibilityPublic {
					continue
				}
				ownerID := strings.TrimSpace(asset.OwnerID)
				if _, protected := active[ownerID]; protected {
					continue
				}
				attempted++
				// Tombstone first: an expired row must never stay readable as ready
				// while its objects are being removed. One broken asset does not stop
				// the sweep; the first error is reported once the run completes.
				if err := m.markMediaDeleting(asset); err != nil {
					if firstErr == nil {
						firstErr = err
					}
					continue
				}
				if asset.ThumbnailKey != "" {
					if err := m.objects.Delete(ctx, asset.ThumbnailKey); err != nil {
						if firstErr == nil {
							firstErr = err
						}
						continue
					}
				}
				if err := m.objects.Delete(ctx, asset.ObjectKey); err != nil {
					if firstErr == nil {
						firstErr = err
					}
					continue
				}
				if err := m.repo.DeleteMediaAsset(asset.Path); err != nil {
					if firstErr == nil {
						firstErr = err
					}
					continue
				}
				m.removeSpoolFiles(asset.ID)
				removed++
			}
			if len(items) < mediaCleanupPageSize {
				return nil
			}
		}
		return nil
	}

	if policyStartTime, parseErr := time.Parse(time.RFC3339Nano, policyStart); parseErr == nil {
		if !now.Before(policyStartTime.UTC().AddDate(0, 0, historicalGraceDays)) {
			if err := sweep(func(limit int, beforeKey, beforePath string) ([]storage.MediaAssetRecord, error) {
				return backend.ListPrePolicyMediaAssets(policyStart, limit, beforeKey, beforePath)
			}); err != nil {
				return removed, err
			}
		}
	}

	if attempted < maxMediaCleanupAssetsPerRun {
		cutoff := now.AddDate(0, 0, -retentionDays).Format(time.RFC3339Nano)
		if err := sweep(func(limit int, beforeKey, beforePath string) ([]storage.MediaAssetRecord, error) {
			return backend.ListMediaAssetsBefore(policyStart, cutoff, limit, beforeKey, beforePath)
		}); err != nil {
			return removed, err
		}
	}

	return removed, firstErr
}
