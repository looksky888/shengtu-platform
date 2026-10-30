package service

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

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
