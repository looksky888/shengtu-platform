package service

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
)

type dueImageCleaner interface {
	CleanupOldImagesIfDue() int
}

func cleanupOldImagesIfDue(config ImageConfig) int {
	if config == nil {
		return 0
	}
	if cleaner, ok := config.(dueImageCleaner); ok {
		return cleaner.CleanupOldImagesIfDue()
	}
	return config.CleanupOldImages()
}

// SweepOrphanedImageDocuments removes image_metadata/* and image_thumbnails/*
// JSON documents whose corresponding local image file no longer exists on disk,
// and evicts those stale relative paths from the local gallery index.
// R2 assets live in media_assets and are never affected by this sweep.
func (s *ImageService) SweepOrphanedImageDocuments() int {
	if s == nil || s.config == nil || s.store == nil {
		return 0
	}
	if s.media != nil && s.media.MigrationStatus().State == "running" {
		return 0
	}
	prefixStore, ok := s.store.(storage.JSONDocumentPrefixBackend)
	if !ok {
		return 0
	}
	imagesDir := strings.TrimSpace(s.config.ImagesDir())
	if imagesDir == "" {
		return 0
	}
	imagesRoot, err := filepath.Abs(imagesDir)
	if err != nil {
		return 0
	}

	var orphanDocs []string
	orphanRelSet := make(map[string]struct{})
	checkAndCollect := func(docName, rawRel string) {
		rel, relErr := cleanImageRelativePath(rawRel)
		if relErr != nil {
			return
		}
		target := filepath.Join(imagesRoot, filepath.FromSlash(rel))
		if !pathInsideRoot(imagesRoot, target) {
			return
		}
		if _, statErr := os.Stat(target); errors.Is(statErr, os.ErrNotExist) {
			orphanDocs = append(orphanDocs, docName)
			orphanRelSet[rel] = struct{}{}
		}
	}

	if metaNames, listErr := prefixStore.ListJSONDocumentNamesByPrefix("image_metadata"); listErr == nil {
		for _, docName := range metaNames {
			if !strings.HasPrefix(docName, "image_metadata/") || !strings.HasSuffix(docName, ".json") {
				continue
			}
			rawRel := strings.TrimSuffix(strings.TrimPrefix(docName, "image_metadata/"), ".json")
			checkAndCollect(docName, rawRel)
		}
	}

	thumbSuffix := thumbnailExtension + ".json"
	if thumbNames, listErr := prefixStore.ListJSONDocumentNamesByPrefix("image_thumbnails"); listErr == nil {
		for _, docName := range thumbNames {
			if !strings.HasPrefix(docName, "image_thumbnails/") || !strings.HasSuffix(docName, thumbSuffix) {
				continue
			}
			rawRel := strings.TrimSuffix(strings.TrimPrefix(docName, "image_thumbnails/"), thumbSuffix)
			checkAndCollect(docName, rawRel)
		}
	}

	// Also prune stale entries in galleryIndex whose local file was removed by retention/R2 cleanup.
	s.indexMu().Lock()
	idx := s.loadGalleryIndexLocked()
	for rel := range idx.Entries {
		cleanRel, relErr := cleanImageRelativePath(rel)
		if relErr != nil {
			continue
		}
		target := filepath.Join(imagesRoot, filepath.FromSlash(cleanRel))
		if pathInsideRoot(imagesRoot, target) {
			if _, statErr := os.Stat(target); errors.Is(statErr, os.ErrNotExist) {
				orphanRelSet[cleanRel] = struct{}{}
			}
		}
	}
	s.indexMu().Unlock()

	if len(orphanRelSet) > 0 {
		rels := make([]string, 0, len(orphanRelSet))
		for rel := range orphanRelSet {
			rels = append(rels, rel)
		}
		_ = s.removeGalleryIndexEntries(rels)
	}

	if len(orphanDocs) == 0 {
		return 0
	}
	removed, err := prefixStore.DeleteJSONDocumentsBatch(orphanDocs)
	if err != nil {
		return removed
	}
	return removed
}


func isMediaOwnerProtected(ownerID string, sets ...map[string]storage.PaymentStorageEntitlementSummary) bool {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return false
	}
	for _, set := range sets {
		if _, ok := set[ownerID]; ok {
			return true
		}
	}
	return false
}

// CleanupOldImages removes expired local image files while preserving public
// Inspiration Gallery artworks and active/grace VIP owners.
func (s *ImageService) CleanupOldImages(retentionDays int, protectedOwnerSets ...map[string]storage.PaymentStorageEntitlementSummary) int {
	if s == nil || s.config == nil || s.media != nil {
		return 0
	}
	if toggle, ok := s.config.(interface{ MediaAutoCleanupEnabled() bool }); ok && !toggle.MediaAutoCleanupEnabled() {
		return 0
	}
	if retentionDays < 1 {
		if cfg, ok := s.config.(interface{ ImageRetentionDays() int }); ok && cfg.ImageRetentionDays() > 0 {
			retentionDays = cfg.ImageRetentionDays()
		} else {
			retentionDays = 7
		}
	}
	imagesDir := strings.TrimSpace(s.config.ImagesDir())
	if imagesDir == "" {
		return 0
	}
	imagesRoot, err := filepath.Abs(imagesDir)
	if err != nil {
		return 0
	}
	thumbnailRoot, _ := filepath.Abs(s.config.ImageThumbnailsDir())
	cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)

	removed := 0
	var removedRels []string
	_ = filepath.WalkDir(imagesRoot, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || d.IsDir() {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(d.Name()), ".tmp") {
			return nil
		}
		info, statErr := d.Info()
		if statErr != nil || !info.ModTime().Before(cutoff) {
			return nil
		}
		relPath, relErr := filepath.Rel(imagesRoot, path)
		if relErr != nil {
			return nil
		}
		rel, cleanErr := cleanImageRelativePath(filepath.ToSlash(relPath))
		if cleanErr != nil {
			return nil
		}
		meta := s.imageMetadata(rel)
		if meta.Visibility == ImageVisibilityPublic || isMediaOwnerProtected(meta.OwnerID, protectedOwnerSets...) {
			return nil
		}
		if os.Remove(path) == nil {
			removed++
			removedRels = append(removedRels, rel)
			if thumbnailRoot != "" {
				_ = s.removeImageThumbnail(thumbnailRoot, rel)
			}
			_ = s.removeImageOwner(rel)
			removeEmptyParentDirs(imagesRoot, filepath.Dir(path))
		}
		return nil
	})
	if len(removedRels) > 0 {
		_ = s.removeGalleryIndexEntries(removedRels)
	}
	return removed
}
