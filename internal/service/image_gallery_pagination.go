package service

import (
	"encoding/base64"
	"encoding/json"
	"sort"
	"strings"
)

const imageListCursorVersion = 1

type imageListCursor struct {
	Version int    `json:"v"`
	SortKey string `json:"sort_key"`
	Path    string `json:"path"`
	Public  bool   `json:"public"`
}

func (s *ImageService) orderedGalleryEntriesLocked(public bool) []*imageIndexEntry {
	if public && s.galleryPublicOrder != nil {
		return s.galleryPublicOrder
	}
	if !public && s.galleryPrivateOrder != nil {
		return s.galleryPrivateOrder
	}
	entries := make([]*imageIndexEntry, 0, len(s.galleryIndex.Entries))
	for _, entry := range s.galleryIndex.Entries {
		if entry != nil {
			entries = append(entries, entry)
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		left := indexSortKey(entries[i], public)
		right := indexSortKey(entries[j], public)
		if left != right {
			return left > right
		}
		return entries[i].Path < entries[j].Path
	})
	if public {
		s.galleryPublicOrder = entries
	} else {
		s.galleryPrivateOrder = entries
	}
	return entries
}

func (s *ImageService) invalidateGalleryOrderLocked() {
	s.galleryPrivateOrder = nil
	s.galleryPublicOrder = nil
}

func indexSortKey(entry *imageIndexEntry, public bool) string {
	if entry == nil {
		return ""
	}
	if public {
		return firstNonEmptyString(entry.PublishedAt, entry.CreatedAt)
	}
	return entry.CreatedAt
}

func imageListStart(entries []*imageIndexEntry, value string, public bool) int {
	cursor, ok := decodeImageListCursor(value)
	if !ok || cursor.Public != public {
		return 0
	}
	return sort.Search(len(entries), func(index int) bool {
		entry := entries[index]
		sortKey := indexSortKey(entry, public)
		if sortKey != cursor.SortKey {
			return sortKey < cursor.SortKey
		}
		return entry.Path > cursor.Path
	})
}

func encodeImageListCursor(entry *imageIndexEntry, public bool) string {
	if entry == nil {
		return ""
	}
	data, err := json.Marshal(imageListCursor{
		Version: imageListCursorVersion,
		SortKey: indexSortKey(entry, public),
		Path:    entry.Path,
		Public:  public,
	})
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeImageListCursor(value string) (imageListCursor, bool) {
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return imageListCursor{}, false
	}
	var cursor imageListCursor
	if err := json.Unmarshal(data, &cursor); err != nil {
		return imageListCursor{}, false
	}
	if cursor.Version != imageListCursorVersion || cursor.SortKey == "" || cursor.Path == "" {
		return imageListCursor{}, false
	}
	return cursor, true
}
