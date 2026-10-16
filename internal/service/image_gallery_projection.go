package service

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

func indexEntryMatchesQuery(e *imageIndexEntry, q ImageListQuery) bool {
	if e == nil || e.Path == "" {
		return false
	}
	if q.StartDate != "" && e.Date < q.StartDate {
		return false
	}
	if q.EndDate != "" && e.Date > q.EndDate {
		return false
	}
	if q.Scope.Public {
		if e.Visibility != ImageVisibilityPublic {
			return false
		}
	} else if !q.Scope.All && (q.Scope.OwnerID == "" || e.OwnerID != q.Scope.OwnerID) {
		return false
	}
	if after := strings.TrimSpace(q.UpdatedAfter); after != "" {
		// Prefer UpdatedAt, fall back to CreatedAt / PublishedAt.
		stamp := firstNonEmptyString(e.UpdatedAt, e.PublishedAt, e.CreatedAt)
		if stamp == "" || stamp <= after {
			return false
		}
	}
	return true
}

func (s *ImageService) indexEntryToListItem(baseURL string, e *imageIndexEntry) map[string]any {
	item := map[string]any{
		"name":       e.Name,
		"path":       e.Path,
		"date":       e.Date,
		"size":       e.Size,
		"url":        publicAssetURL(baseURL, "images", e.Path),
		"created_at": e.CreatedAt,
		"visibility": firstNonEmptyString(e.Visibility, ImageVisibilityPrivate),
	}
	if e.OwnerID != "" {
		item["owner_id"] = e.OwnerID
	}
	if e.OwnerName != "" {
		item["owner_name"] = e.OwnerName
	}
	if e.PublishedAt != "" {
		item["published_at"] = e.PublishedAt
	}
	if e.UpdatedAt != "" {
		item["updated_at"] = e.UpdatedAt
	}
	if e.ResolutionPreset != "" {
		item["resolution_preset"] = e.ResolutionPreset
	}
	if e.RequestedSize != "" {
		item["requested_size"] = e.RequestedSize
	}
	if e.OutputFormat != "" {
		item["output_format"] = e.OutputFormat
	}
	// Thumbnail: prefer existing info without forcing sync generation.
	if e.Path != "" {
		path := filepath.Join(s.config.ImagesDir(), filepath.FromSlash(e.Path))
		if info, err := os.Stat(path); err == nil {
			thumb := s.thumbnailInfo(e.Path, info)
			if thumbRel, ok := thumb["thumbnail_rel"].(string); ok && thumbRel != "" {
				item["thumbnail_url"] = thumbnailURL(baseURL, thumbRel, info.ModTime())
			} else {
				item["thumbnail_url"] = ""
			}
			if !setImageItemDimensions(item, thumb["width"], thumb["height"]) {
				if e.Width > 0 && e.Height > 0 {
					setImageItemDimensions(item, e.Width, e.Height)
				}
			}
		} else if e.Width > 0 && e.Height > 0 {
			setImageItemDimensions(item, e.Width, e.Height)
			item["thumbnail_url"] = ""
		}
	}
	return item
}

func groupImageItemsByDate(items []map[string]any) []map[string]any {
	groupMap := map[string][]map[string]any{}
	var order []string
	for _, item := range items {
		day := toString(item["date"])
		if _, ok := groupMap[day]; !ok {
			order = append(order, day)
		}
		groupMap[day] = append(groupMap[day], item)
	}
	groups := make([]map[string]any, 0, len(order))
	for _, day := range order {
		groups = append(groups, map[string]any{"date": day, "items": groupMap[day]})
	}
	return groups
}

// parseUpdatedAfter normalizes client timestamps for comparison with index UpdatedAt.
func parseUpdatedAfter(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			return t.Format("2006-01-02 15:04:05")
		}
	}
	return value
}
