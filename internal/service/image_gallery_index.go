package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"chatgpt2api/internal/util"
)

const (
	imageGalleryIndexDocName = "image_gallery_index.json"
	imageGalleryIndexVersion = 1
	// DefaultImageListLimit is the server page size when clients omit limit.
	DefaultImageListLimit = 100
	// MaxImageListLimit is the largest accepted server page size.
	MaxImageListLimit = 200
)

var ErrImageGalleryIndexPersistence = errors.New("image gallery index persistence failed")

// ImageListQuery controls gallery listing (pagination + incremental refresh).
type ImageListQuery struct {
	StartDate    string
	EndDate      string
	Scope        ImageAccessScope
	Limit        int    // page size; ListImagesQuery defaults values below 1 to 100
	Cursor       string // opaque next-page cursor
	UpdatedAfter string // ISO / "2006-01-02 15:04:05" — return items updated strictly after
}

type imageIndexEntry struct {
	Path             string `json:"path"`
	Name             string `json:"name"`
	Date             string `json:"date"`
	OwnerID          string `json:"owner_id,omitempty"`
	OwnerName        string `json:"owner_name,omitempty"`
	Visibility       string `json:"visibility,omitempty"`
	Size             int64  `json:"size"`
	Width            int    `json:"width,omitempty"`
	Height           int    `json:"height,omitempty"`
	CreatedAt        string `json:"created_at"`
	PublishedAt      string `json:"published_at,omitempty"`
	UpdatedAt        string `json:"updated_at,omitempty"`
	ResolutionPreset string `json:"resolution_preset,omitempty"`
	RequestedSize    string `json:"requested_size,omitempty"`
	OutputFormat     string `json:"output_format,omitempty"`
}

type imageGalleryIndex struct {
	Version int    `json:"version"`
	BuiltAt string `json:"built_at,omitempty"`
	// Complete is true only after a full filesystem rebuild. Partial upserts must not skip rebuild.
	Complete bool                        `json:"complete,omitempty"`
	Entries  map[string]*imageIndexEntry `json:"entries"`
}

func (s *ImageService) indexMu() *sync.Mutex {
	// lazy-init via package-level pattern on service fields — use dedicated lock field.
	return &s.galleryIndexMu
}

func (s *ImageService) loadGalleryIndexLocked() *imageGalleryIndex {
	if s.galleryIndex != nil {
		return s.galleryIndex
	}
	idx := &imageGalleryIndex{Version: imageGalleryIndexVersion, Entries: map[string]*imageIndexEntry{}}
	raw := loadStoredJSON(s.store, imageGalleryIndexDocName, s.galleryIndexPath())
	if raw != nil {
		if data, err := json.Marshal(raw); err == nil {
			_ = json.Unmarshal(data, idx)
		}
	}
	if idx.Entries == nil {
		idx.Entries = map[string]*imageIndexEntry{}
	}
	idx.Version = imageGalleryIndexVersion
	s.galleryIndex = idx
	return idx
}

func (s *ImageService) galleryIndexPath() string {
	if s.config == nil {
		return "image_gallery_index.json"
	}
	// Prefer data dir sibling of images.
	return filepath.Join(filepath.Dir(s.config.ImagesDir()), "image_gallery_index.json")
}

func (s *ImageService) saveGalleryIndexLocked() error {
	if s.galleryIndex == nil {
		return nil
	}
	s.galleryIndex.Version = imageGalleryIndexVersion
	if err := saveStoredJSON(s.store, imageGalleryIndexDocName, s.galleryIndexPath(), s.galleryIndex); err != nil {
		return fmt.Errorf("%w: %v", ErrImageGalleryIndexPersistence, err)
	}
	return nil
}

// RebuildGalleryIndex scans the filesystem once and replaces the in-memory index.
func (s *ImageService) RebuildGalleryIndex() error {
	s.indexMu().Lock()
	defer s.indexMu().Unlock()
	return s.rebuildGalleryIndexLocked()
}

func (s *ImageService) rebuildGalleryIndexLocked() error {
	root := s.config.ImagesDir()
	entries := map[string]*imageIndexEntry{}
	if err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		entry := s.indexEntryFromFile(rel, info)
		entries[rel] = entry
		return nil
	}); err != nil {
		return fmt.Errorf("scan image gallery: %w", err)
	}
	s.galleryIndex = &imageGalleryIndex{
		Version:  imageGalleryIndexVersion,
		BuiltAt:  util.NowISO(),
		Complete: true,
		Entries:  entries,
	}
	s.invalidateGalleryOrderLocked()
	if err := s.saveGalleryIndexLocked(); err != nil {
		s.galleryIndex.Complete = false
		return err
	}
	return nil
}

func (s *ImageService) ensureGalleryIndexLocked() error {
	idx := s.loadGalleryIndexLocked()
	if idx.Complete {
		return nil
	}
	// Missing/incomplete index: one-time WalkDir rebuild (F-09 migration path).
	return s.rebuildGalleryIndexLocked()
}

func (s *ImageService) indexEntryFromFile(rel string, info os.FileInfo) *imageIndexEntry {
	meta := s.imageMetadata(rel)
	day := imageDay(rel, info.ModTime())
	created := info.ModTime().Format("2006-01-02 15:04:05")
	entry := &imageIndexEntry{
		Path:             rel,
		Name:             filepath.Base(rel),
		Date:             day,
		OwnerID:          meta.OwnerID,
		OwnerName:        meta.OwnerName,
		Visibility:       firstNonEmptyString(meta.Visibility, ImageVisibilityPrivate),
		Size:             info.Size(),
		CreatedAt:        created,
		PublishedAt:      meta.PublishedAt,
		UpdatedAt:        util.NowLocal(),
		ResolutionPreset: meta.ResolutionPreset,
		RequestedSize:    meta.RequestedSize,
		OutputFormat:     meta.OutputFormat,
	}
	if width, height, ok := imageFileDimensions(filepath.Join(s.config.ImagesDir(), filepath.FromSlash(rel))); ok {
		entry.Width = width
		entry.Height = height
	}
	return entry
}

func (s *ImageService) upsertGalleryIndexEntry(rel string, info os.FileInfo) error {
	if rel == "" {
		return nil
	}
	s.indexMu().Lock()
	defer s.indexMu().Unlock()
	idx := s.loadGalleryIndexLocked()
	// If we never completed a full rebuild, keep Complete=false so the next list rebuilds.
	if info == nil {
		path := filepath.Join(s.config.ImagesDir(), filepath.FromSlash(rel))
		st, err := os.Stat(path)
		if err != nil {
			return err
		}
		info = st
	}
	idx.Entries[rel] = s.indexEntryFromFile(rel, info)
	s.invalidateGalleryOrderLocked()
	if err := s.saveGalleryIndexLocked(); err != nil {
		idx.Complete = false
		return err
	}
	return nil
}

func (s *ImageService) removeGalleryIndexEntries(paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	s.indexMu().Lock()
	defer s.indexMu().Unlock()
	idx := s.loadGalleryIndexLocked()
	changed := false
	for _, p := range paths {
		rel := filepath.ToSlash(strings.TrimSpace(p))
		if rel == "" {
			continue
		}
		if _, ok := idx.Entries[rel]; ok {
			delete(idx.Entries, rel)
			changed = true
		}
	}
	if changed {
		s.invalidateGalleryOrderLocked()
		if err := s.saveGalleryIndexLocked(); err != nil {
			idx.Complete = false
			return err
		}
	}
	return nil
}

func (s *ImageService) listFromGalleryIndex(baseURL string, q ImageListQuery) (map[string]any, error) {
	s.indexMu().Lock()
	if err := s.ensureGalleryIndexLocked(); err != nil {
		s.indexMu().Unlock()
		return nil, err
	}
	// Copy pointers under lock for filtering without holding lock during URL build.
	all := append([]*imageIndexEntry(nil), s.orderedGalleryEntriesLocked(q.Scope.Public)...)
	s.indexMu().Unlock()

	filtered := make([]*imageIndexEntry, 0, len(all))
	for _, e := range all {
		if !indexEntryMatchesQuery(e, q) {
			continue
		}
		filtered = append(filtered, e)
	}
	total := len(filtered)
	start := imageListStart(filtered, q.Cursor, q.Scope.Public)
	limit := q.Limit
	if limit < 1 {
		limit = DefaultImageListLimit
	}
	if limit > MaxImageListLimit {
		limit = MaxImageListLimit
	}
	end := start + limit
	if end > total {
		end = total
	}
	page := filtered[start:end]
	hasMore := end < total
	nextCursor := ""
	if hasMore && len(page) > 0 {
		nextCursor = encodeImageListCursor(page[len(page)-1], q.Scope.Public)
	}

	items := make([]map[string]any, 0, len(page))
	for _, e := range page {
		items = append(items, s.indexEntryToListItem(baseURL, e))
	}
	groups := groupImageItemsByDate(items)
	result := map[string]any{
		"items":       items,
		"groups":      groups,
		"total":       total,
		"has_more":    hasMore,
		"next_cursor": nextCursor,
		"limit":       limit,
	}
	return result, nil
}
