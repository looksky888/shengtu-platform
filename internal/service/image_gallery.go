package service

import (
	"errors"
	"os"
	"path/filepath"
)

// ListImages returns the first gallery page. Prefer ListImagesQuery for cursor pagination.
func (s *ImageService) ListImages(baseURL, startDate, endDate string, scope ImageAccessScope) (map[string]any, error) {
	return s.ListImagesQuery(baseURL, ImageListQuery{
		StartDate: startDate,
		EndDate:   endDate,
		Scope:     scope,
		Limit:     DefaultImageListLimit,
	})
}

// ListImagesQuery lists images from the gallery index with cursor pagination.
func (s *ImageService) ListImagesQuery(baseURL string, q ImageListQuery) (map[string]any, error) {
	if s.media != nil {
		return s.media.ListImages(baseURL, q)
	}
	cleanupOldImagesIfDue(s.config)
	q.UpdatedAfter = parseUpdatedAfter(q.UpdatedAfter)
	if q.Limit < 1 {
		q.Limit = DefaultImageListLimit
	} else if q.Limit > MaxImageListLimit {
		q.Limit = MaxImageListLimit
	}
	return s.listFromGalleryIndex(baseURL, q)
}

func (s *ImageService) UpdateImageVisibility(value, visibility string, scope ImageAccessScope) (map[string]any, error) {
	visibility, err := NormalizeImageVisibility(visibility)
	if err != nil {
		return nil, err
	}
	if s.media != nil {
		return s.media.UpdateImageVisibility(value, visibility, scope)
	}
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return nil, err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	ref, err := s.imageFileRef(imageRoot, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("图片不存在")
		}
		return nil, err
	}
	meta := s.imageMetadata(ref.rel)
	if !scope.All && (scope.OwnerID == "" || meta.OwnerID != scope.OwnerID) {
		return nil, errors.New("图片不存在")
	}
	if err := s.writeImageMetadataForRef(ref, "", "", visibility); err != nil {
		return nil, err
	}
	if err := s.upsertGalleryIndexEntry(ref.rel, ref.info); err != nil {
		return nil, err
	}
	nextMeta := s.imageMetadata(ref.rel)
	item := map[string]any{
		"name":       filepath.Base(ref.path),
		"path":       ref.rel,
		"date":       imageDay(ref.rel, ref.info.ModTime()),
		"size":       ref.info.Size(),
		"visibility": nextMeta.Visibility,
		"created_at": ref.info.ModTime().Format("2006-01-02 15:04:05"),
	}
	if nextMeta.OwnerID != "" {
		item["owner_id"] = nextMeta.OwnerID
	}
	if nextMeta.OwnerName != "" {
		item["owner_name"] = nextMeta.OwnerName
	}
	if nextMeta.PublishedAt != "" {
		item["published_at"] = nextMeta.PublishedAt
	}
	if nextMeta.ResolutionPreset != "" {
		item["resolution_preset"] = nextMeta.ResolutionPreset
	}
	if nextMeta.RequestedSize != "" {
		item["requested_size"] = nextMeta.RequestedSize
	}
	if width, height, ok := imageFileDimensions(ref.path); ok {
		setImageItemDimensions(item, width, height)
	}
	return item, nil
}

func (s *ImageService) ImageFileAccess(value string, scope ImageAccessScope) (ImageFileAccess, error) {
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return ImageFileAccess{}, err
	}
	if s.media != nil {
		asset, ok, loadErr := s.media.Load(rel)
		if loadErr != nil {
			return ImageFileAccess{}, loadErr
		}
		if !ok || asset.DeletedAt != "" || (asset.Visibility != ImageVisibilityPublic && !scope.All && (scope.OwnerID == "" || asset.OwnerID != scope.OwnerID)) {
			return ImageFileAccess{}, errors.New("图片不存在")
		}
		return ImageFileAccess{Rel: asset.Path, Visibility: asset.Visibility, OwnerID: asset.OwnerID, Remote: true, Asset: asset}, nil
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return ImageFileAccess{}, err
	}
	ref, err := s.imageFileRef(imageRoot, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ImageFileAccess{}, errors.New("图片不存在")
		}
		return ImageFileAccess{}, err
	}
	meta := s.imageMetadata(ref.rel)
	if !imageMetadataAllowsAccess(meta, scope) {
		return ImageFileAccess{}, errors.New("图片不存在")
	}
	return ImageFileAccess{
		Rel:        ref.rel,
		Path:       ref.path,
		Info:       ref.info,
		Visibility: meta.Visibility,
		OwnerID:    meta.OwnerID,
	}, nil
}

func (s *ImageService) DeleteImages(paths []string, scope ImageAccessScope) (map[string]any, error) {
	if len(paths) == 0 {
		return nil, errors.New("请提供图片路径")
	}
	if s.media != nil {
		return s.media.DeleteImages(paths, scope)
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	thumbnailRoot, err := filepath.Abs(s.config.ImageThumbnailsDir())
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(paths))
	deleted := 0
	missing := 0
	removedPaths := make([]string, 0, len(paths))
	for _, value := range paths {
		rel, err := cleanImageRelativePath(value)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}

		imagePath := filepath.Join(imageRoot, filepath.FromSlash(rel))
		if !pathInsideRoot(imageRoot, imagePath) {
			return nil, errors.New("图片路径无效")
		}
		if !scope.All && (scope.OwnerID == "" || s.imageOwner(rel) != scope.OwnerID) {
			missing++
			continue
		}
		if err := s.removeImageThumbnail(thumbnailRoot, rel); err != nil {
			return nil, err
		}
		if err := s.removeImageOwner(rel); err != nil {
			return nil, err
		}
		info, err := os.Stat(imagePath)
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return nil, err
			}
			missing++
		} else if info.IsDir() {
			return nil, errors.New("图片路径不是文件")
		} else if err := os.Remove(imagePath); err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return nil, err
			}
			missing++
		} else {
			deleted++
		}

		removeEmptyParentDirs(imageRoot, filepath.Dir(imagePath))
		removedPaths = append(removedPaths, rel)
	}
	if err := s.removeGalleryIndexEntries(removedPaths); err != nil {
		return nil, err
	}
	return map[string]any{"deleted": deleted, "missing": missing, "paths": removedPaths}, nil
}
