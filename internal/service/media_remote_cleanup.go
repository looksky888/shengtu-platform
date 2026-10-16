package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
)

// CleanupExpiredRemoteMedia removes expired free-tier image objects. Users
// with an active cloud-storage entitlement are excluded in one bounded query.
// It returns the number of removed assets and the first error, if any.
func (m *MediaLibrary) CleanupExpiredRemoteMedia(ctx context.Context, retentionDays int, policyStart string) (int, error) {
	if m == nil || m.repo == nil || m.objects == nil || retentionDays < 1 {
		return 0, nil
	}
	policyStart = strings.TrimSpace(policyStart)
	if policyStart == "" {
		return 0, nil
	}
	backend, ok := m.repo.(storage.MediaRetentionBackend)
	if !ok {
		return 0, fmt.Errorf("媒体存储后端不支持远端清理")
	}
	entitlements, ok := m.repo.(storage.PaymentStorageBackend)
	if !ok {
		return 0, fmt.Errorf("云存储权益后端未就绪")
	}
	now := time.Now().UTC()
	active, err := entitlements.ListActiveStorageEntitlements(now.Format(time.RFC3339Nano))
	if err != nil {
		return 0, err
	}
	cutoff := now.AddDate(0, 0, -retentionDays).Format(time.RFC3339Nano)
	var removed int
	var beforeKey, beforePath string
	for {
		if err := ctx.Err(); err != nil {
			return removed, err
		}
		items, err := backend.ListMediaAssetsBefore(policyStart, cutoff, 100, beforeKey, beforePath)
		if err != nil {
			return removed, err
		}
		if len(items) == 0 {
			return removed, nil
		}
		for _, asset := range items {
			beforeKey, beforePath = asset.CreatedAt, asset.Path
			ownerID := strings.TrimSpace(asset.OwnerID)
			entitlement, subscribed := active[ownerID]
			if subscribed && entitlement.UsedBytes <= entitlement.StorageBytes {
				continue
			}
			if asset.ThumbnailKey != "" {
				if err := m.objects.Delete(ctx, asset.ThumbnailKey); err != nil {
					return removed, err
				}
			}
			if asset.ObjectKey != "" {
				if err := m.objects.Delete(ctx, asset.ObjectKey); err != nil {
					return removed, err
				}
			}
			if err := m.repo.DeleteMediaAsset(asset.Path); err != nil {
				return removed, err
			}
			m.removeSpoolFiles(asset.ID)
			removed++
			if subscribed {
				entitlement.UsedBytes -= asset.SizeBytes
				if entitlement.UsedBytes < 0 {
					entitlement.UsedBytes = 0
				}
				active[ownerID] = entitlement
			}
		}
		if len(items) < 100 {
			return removed, nil
		}
	}
}
