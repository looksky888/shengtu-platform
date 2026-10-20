package service

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (m *MediaLibrary) ListImages(baseURL string, q ImageListQuery) (map[string]any, error) {
	if m == nil {
		return nil, errors.New("媒体库未初始化")
	}
	q.UpdatedAfter = parseUpdatedAfter(q.UpdatedAfter)
	if q.Limit < 1 {
		q.Limit = DefaultImageListLimit
	} else if q.Limit > MaxImageListLimit {
		q.Limit = MaxImageListLimit
	}
	cursor, cursorOK := decodeImageListCursor(q.Cursor)
	query := storage.MediaAssetListQuery{
		OwnerID: q.Scope.OwnerID, All: q.Scope.All, Public: q.Scope.Public,
		StartDate: q.StartDate, EndDate: q.EndDate, UpdatedAfter: q.UpdatedAfter, Limit: q.Limit,
	}
	if cursorOK && cursor.Public == q.Scope.Public {
		query.BeforeSortKey = cursor.SortKey
		query.BeforePath = cursor.Path
	}
	page, err := m.repo.ListMediaAssets(query)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(page.Items))
	for _, asset := range page.Items {
		items = append(items, mediaAssetImageItem(baseURL, asset))
	}
	nextCursor := ""
	if page.HasMore && len(page.Items) > 0 {
		last := page.Items[len(page.Items)-1]
		entry := mediaAssetIndexEntry(last)
		nextCursor = encodeImageListCursor(entry, q.Scope.Public)
	}
	return map[string]any{
		"items": items, "groups": groupImageItemsByDate(items), "total": page.Total,
		"has_more": page.HasMore, "next_cursor": nextCursor, "limit": q.Limit,
	}, nil
}

func mediaAssetIndexEntry(asset storage.MediaAssetRecord) *imageIndexEntry {
	return &imageIndexEntry{Path: asset.Path, CreatedAt: asset.CreatedAt, PublishedAt: asset.PublishedAt}
}

func mediaAssetImageItem(baseURL string, asset storage.MediaAssetRecord) map[string]any {
	createdDate := asset.CreatedAt
	if len(createdDate) >= 10 {
		createdDate = createdDate[:10]
	}
	item := map[string]any{
		"name": filepath.Base(asset.Path), "path": asset.Path, "date": createdDate,
		"size": asset.SizeBytes, "url": publicAssetURL(baseURL, "images", asset.Path),
		"created_at": asset.CreatedAt, "visibility": firstNonEmptyString(asset.Visibility, ImageVisibilityPrivate),
		"width": asset.Width, "height": asset.Height, "storage_status": asset.Status,
	}
	if asset.ThumbnailKey != "" {
		item["thumbnail_url"] = publicAssetURL(baseURL, "image-thumbnails", asset.Path+thumbnailExtension)
	} else {
		item["thumbnail_url"] = ""
	}
	if asset.OwnerID != "" {
		item["owner_id"] = asset.OwnerID
	}
	if asset.OwnerName != "" {
		item["owner_name"] = asset.OwnerName
	}
	if asset.PublishedAt != "" {
		item["published_at"] = asset.PublishedAt
	}
	if asset.ResolutionPreset != "" {
		item["resolution_preset"] = asset.ResolutionPreset
	}
	if asset.RequestedSize != "" {
		item["requested_size"] = asset.RequestedSize
	}
	if asset.OutputFormat != "" {
		item["output_format"] = asset.OutputFormat
	}
	return item
}

func (m *MediaLibrary) UpdateGeneratedImage(value, ownerID, ownerName, visibility string, metadata GeneratedImageMetadata) error {
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return err
	}
	asset, ok, err := m.repo.LoadMediaAsset(rel)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("图片不存在: %s", rel)
	}
	if ownerID = strings.TrimSpace(ownerID); ownerID != "" {
		asset.OwnerID = ownerID
	}
	if ownerName = strings.TrimSpace(ownerName); ownerName != "" {
		asset.OwnerName = ownerName
	}
	if visibility = strings.TrimSpace(visibility); visibility != "" {
		normalized, normalizeErr := NormalizeImageVisibility(visibility)
		if normalizeErr != nil {
			return normalizeErr
		}
		if normalized == ImageVisibilityPublic && asset.Visibility != ImageVisibilityPublic {
			asset.PublishedAt = util.NowISO()
		} else if normalized == ImageVisibilityPrivate {
			asset.PublishedAt = ""
		}
		asset.Visibility = normalized
	}
	if preset := NormalizeImageResolutionPreset(metadata.ResolutionPreset); preset != "" {
		asset.ResolutionPreset = preset
	}
	if requested := strings.TrimSpace(metadata.RequestedSize); requested != "" {
		asset.RequestedSize = requested
	}
	if format := NormalizeImageOutputFormat(metadata.OutputFormat); format != "" {
		asset.OutputFormat = format
	}
	asset.UpdatedAt = util.NowISO()
	return m.repo.SaveMediaAsset(asset)
}

func (m *MediaLibrary) UpdateImageVisibility(value, visibility string, scope ImageAccessScope) (map[string]any, error) {
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return nil, err
	}
	asset, ok, err := m.repo.LoadMediaAsset(rel)
	if err != nil {
		return nil, err
	}
	if !ok || (!scope.All && (scope.OwnerID == "" || asset.OwnerID != scope.OwnerID)) {
		return nil, errors.New("图片不存在")
	}
	if err := m.UpdateGeneratedImage(rel, "", "", visibility, GeneratedImageMetadata{}); err != nil {
		return nil, err
	}
	asset, _, err = m.repo.LoadMediaAsset(rel)
	if err != nil {
		return nil, err
	}
	return mediaAssetImageItem("", asset), nil
}

func (m *MediaLibrary) DeleteImages(paths []string, scope ImageAccessScope) (map[string]any, error) {
	seen := map[string]struct{}{}
	removed := make([]string, 0, len(paths))
	deleted, missing := 0, 0
	var firstErr error
	fail := func(err error) {
		if firstErr == nil {
			firstErr = err
		}
	}
	for _, value := range paths {
		rel, err := cleanImageRelativePath(value)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}
		asset, ok, err := m.repo.LoadMediaAsset(rel)
		if err != nil {
			fail(err)
			continue
		}
		if !ok || (!scope.All && (scope.OwnerID == "" || asset.OwnerID != scope.OwnerID)) {
			missing++
			continue
		}
		release := m.lockMediaAsset(asset.ID)
		asset, ok, err = m.repo.LoadMediaAsset(rel)
		if err != nil || !ok || (!scope.All && (scope.OwnerID == "" || asset.OwnerID != scope.OwnerID)) {
			release()
			if err != nil {
				fail(err)
				continue
			}
			missing++
			continue
		}
		// Tombstone the row before touching any object: from here on Delivery
		// refuses the record, so a crash or a failed remote delete can only leak
		// bytes — it can never keep signing presigned URLs for a missing object.
		if err := m.markMediaDeleting(asset); err != nil {
			release()
			fail(err)
			continue
		}
		// Remote objects, then the row. A failed object delete leaves the
		// tombstoned row (object keys intact) so a retry can finish, and the
		// remaining paths are still processed.
		if err := m.objects.Delete(context.Background(), asset.ThumbnailKey); err != nil {
			release()
			fail(fmt.Errorf("删除缩略图 %s: %w", asset.Path, err))
			continue
		}
		if err := m.objects.Delete(context.Background(), asset.ObjectKey); err != nil {
			release()
			fail(fmt.Errorf("删除原图 %s: %w", asset.Path, err))
			continue
		}
		if err := m.repo.DeleteMediaAsset(rel); err != nil {
			release()
			fail(err)
			continue
		}
		m.removeSpoolFiles(asset.ID)
		release()
		deleted++
		removed = append(removed, rel)
	}
	if firstErr != nil {
		return nil, firstErr
	}
	return map[string]any{"deleted": deleted, "missing": missing, "paths": removed}, nil
}

// markMediaDeleting persists the delete tombstone for one record.
func (m *MediaLibrary) markMediaDeleting(asset storage.MediaAssetRecord) error {
	asset.Status = mediaStatusDeleting
	asset.UpdatedAt = util.NowISO()
	return m.repo.SaveMediaAsset(asset)
}
