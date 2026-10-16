package service

import "chatgpt2api/internal/util"

// PromptFavoriteLocalization is one language block inside a favorite.
type PromptFavoriteLocalization struct {
	Title       string `json:"title"`
	Prompt      string `json:"prompt"`
	Category    string `json:"category"`
	SubCategory string `json:"sub_category,omitempty"`
}

// PromptFavorite is the persisted prompt favorite record (storage + service memory).
type PromptFavorite struct {
	ID                 string                                `json:"id"`
	PromptID           string                                `json:"prompt_id"`
	Source             string                                `json:"source"`
	Title              string                                `json:"title"`
	Preview            string                                `json:"preview"`
	ReferenceImageURLs []string                              `json:"reference_image_urls,omitempty"`
	Prompt             string                                `json:"prompt"`
	Author             string                                `json:"author"`
	Mode               string                                `json:"mode"`
	Category           string                                `json:"category"`
	SubCategory        string                                `json:"sub_category,omitempty"`
	SourceLabel        string                                `json:"source_label,omitempty"`
	IsNSFW             bool                                  `json:"is_nsfw"`
	Link               string                                `json:"link,omitempty"`
	DedupeKey          string                                `json:"dedupe_key,omitempty"`
	Created            string                                `json:"created,omitempty"`
	Localizations      map[string]PromptFavoriteLocalization `json:"localizations,omitempty"`
	FavoritedAt        string                                `json:"favorited_at"`
	UpdatedAt          string                                `json:"updated_at"`
}

// PromptFavoritePublic is the API-facing prompt favorite item.
type PromptFavoritePublic struct {
	ID                 string   `json:"id,omitempty"`
	PromptID           string   `json:"prompt_id,omitempty"`
	Source             string   `json:"source,omitempty"`
	Title              string   `json:"title,omitempty"`
	Preview            string   `json:"preview,omitempty"`
	ReferenceImageURLs []string `json:"reference_image_urls,omitempty"`
	Prompt             string   `json:"prompt,omitempty"`
	Author             string   `json:"author,omitempty"`
	Mode               string   `json:"mode,omitempty"`
	Category           string   `json:"category,omitempty"`
	SubCategory        string   `json:"sub_category,omitempty"`
	SourceLabel        string   `json:"source_label,omitempty"`
	IsNSFW             bool     `json:"is_nsfw"`
	Link               string   `json:"link,omitempty"`
	DedupeKey          string   `json:"dedupe_key,omitempty"`
	Created            string   `json:"created,omitempty"`
	Localizations      any      `json:"localizations,omitempty"`
	FavoritedAt        string   `json:"favorited_at,omitempty"`
	UpdatedAt          string   `json:"updated_at,omitempty"`
}

func (p PromptFavorite) toMap() map[string]any {
	out := map[string]any{
		"id":                   p.ID,
		"prompt_id":            p.PromptID,
		"source":               p.Source,
		"title":                p.Title,
		"preview":              p.Preview,
		"reference_image_urls": append([]string(nil), p.ReferenceImageURLs...),
		"prompt":               p.Prompt,
		"author":               p.Author,
		"mode":                 p.Mode,
		"category":             p.Category,
		"source_label":         p.SourceLabel,
		"is_nsfw":              p.IsNSFW,
		"favorited_at":         p.FavoritedAt,
		"updated_at":           p.UpdatedAt,
	}
	if p.SubCategory != "" {
		out["sub_category"] = p.SubCategory
	}
	if p.Link != "" {
		out["link"] = p.Link
	}
	if p.DedupeKey != "" {
		out["dedupe_key"] = p.DedupeKey
	}
	if p.Created != "" {
		out["created"] = p.Created
	}
	if len(p.Localizations) > 0 {
		locs := map[string]any{}
		for lang, loc := range p.Localizations {
			entry := map[string]any{
				"title":    loc.Title,
				"prompt":   loc.Prompt,
				"category": loc.Category,
			}
			if loc.SubCategory != "" {
				entry["sub_category"] = loc.SubCategory
			}
			locs[lang] = entry
		}
		out["localizations"] = locs
	}
	return out
}

// PromptFavoritePublicFromRecord converts a stored favorite into a typed public item.
func PromptFavoritePublicFromRecord(item PromptFavorite) PromptFavoritePublic {
	var locs any
	if len(item.Localizations) > 0 {
		out := map[string]any{}
		for lang, loc := range item.Localizations {
			entry := map[string]any{
				"title":    loc.Title,
				"prompt":   loc.Prompt,
				"category": loc.Category,
			}
			if loc.SubCategory != "" {
				entry["sub_category"] = loc.SubCategory
			}
			out[lang] = entry
		}
		locs = out
	}
	return PromptFavoritePublic{
		ID:                 item.ID,
		PromptID:           item.PromptID,
		Source:             item.Source,
		Title:              item.Title,
		Preview:            item.Preview,
		ReferenceImageURLs: append([]string(nil), item.ReferenceImageURLs...),
		Prompt:             item.Prompt,
		Author:             item.Author,
		Mode:               item.Mode,
		Category:           item.Category,
		SubCategory:        item.SubCategory,
		SourceLabel:        item.SourceLabel,
		IsNSFW:             item.IsNSFW,
		Link:               item.Link,
		DedupeKey:          item.DedupeKey,
		Created:            item.Created,
		Localizations:      locs,
		FavoritedAt:        item.FavoritedAt,
		UpdatedAt:          item.UpdatedAt,
	}
}

// PromptFavoritePublicFromMap converts a stored favorite map into a typed public item.
func PromptFavoritePublicFromMap(item map[string]any) PromptFavoritePublic {
	if item == nil {
		return PromptFavoritePublic{}
	}
	return PromptFavoritePublic{
		ID:                 util.Clean(item["id"]),
		PromptID:           util.Clean(item["prompt_id"]),
		Source:             util.Clean(item["source"]),
		Title:              util.Clean(item["title"]),
		Preview:            util.Clean(item["preview"]),
		ReferenceImageURLs: util.AsStringSlice(item["reference_image_urls"]),
		Prompt:             util.Clean(item["prompt"]),
		Author:             util.Clean(item["author"]),
		Mode:               util.Clean(item["mode"]),
		Category:           util.Clean(item["category"]),
		SubCategory:        util.Clean(item["sub_category"]),
		SourceLabel:        util.Clean(item["source_label"]),
		IsNSFW:             util.ToBool(item["is_nsfw"]),
		Link:               util.Clean(item["link"]),
		DedupeKey:          util.Clean(item["dedupe_key"]),
		Created:            util.Clean(item["created"]),
		Localizations:      item["localizations"],
		FavoritedAt:        util.Clean(item["favorited_at"]),
		UpdatedAt:          util.Clean(item["updated_at"]),
	}
}

// PromptFavoritePublicListFromMaps converts a slice of favorite maps.
func PromptFavoritePublicListFromMaps(items []map[string]any) []PromptFavoritePublic {
	out := make([]PromptFavoritePublic, 0, len(items))
	for _, item := range items {
		out = append(out, PromptFavoritePublicFromMap(item))
	}
	return out
}

// PromptFavoritePublicListFromRecords converts stored favorites for API.
func PromptFavoritePublicListFromRecords(items []PromptFavorite) []PromptFavoritePublic {
	out := make([]PromptFavoritePublic, 0, len(items))
	for _, item := range items {
		out = append(out, PromptFavoritePublicFromRecord(item))
	}
	return out
}

// ListTyped returns typed favorites for an owner.
func (s *PromptFavoriteService) ListTyped(ownerID string) []PromptFavoritePublic {
	return PromptFavoritePublicListFromRecords(s.listRecords(ownerID))
}
