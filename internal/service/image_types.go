package service

import "chatgpt2api/internal/util"

// ImagePublic is a typed view of gallery image fields for API boundaries.
// Listing still builds map[string]any internally; convert at the HTTP edge.
type ImagePublic struct {
	Name             string `json:"name,omitempty"`
	Path             string `json:"path,omitempty"`
	OwnerID          string `json:"owner_id,omitempty"`
	OwnerName        string `json:"owner_name,omitempty"`
	Visibility       string `json:"visibility,omitempty"`
	Date             string `json:"date,omitempty"`
	Size             int64  `json:"size"`
	URL              string `json:"url,omitempty"`
	ThumbnailURL     string `json:"thumbnail_url,omitempty"`
	Width            any    `json:"width,omitempty"`
	Height           any    `json:"height,omitempty"`
	Resolution       string `json:"resolution,omitempty"`
	ResolutionPreset string `json:"resolution_preset,omitempty"`
	RequestedSize    string `json:"requested_size,omitempty"`
	OutputFormat     string `json:"output_format,omitempty"`
	AspectRatio      string `json:"aspect_ratio,omitempty"`
	Orientation      string `json:"orientation,omitempty"`
	Megapixels       any    `json:"megapixels,omitempty"`
	CreatedAt        string `json:"created_at,omitempty"`
	PublishedAt      string `json:"published_at,omitempty"`
}

// ImageGroupPublic groups images by date for the gallery UI.
type ImageGroupPublic struct {
	Date  string        `json:"date,omitempty"`
	Items []ImagePublic `json:"items"`
}

// ImageListResponse is the typed list payload for GET /api/images.
type ImageListResponse struct {
	Items      []ImagePublic      `json:"items"`
	Groups     []ImageGroupPublic `json:"groups"`
	Total      int                `json:"total"`
	HasMore    bool               `json:"has_more"`
	NextCursor string             `json:"next_cursor"`
	Limit      int                `json:"limit"`
}

// ImagePublicFromMap converts a ListImages/decorate item map into a typed struct.
func ImagePublicFromMap(item map[string]any) ImagePublic {
	if item == nil {
		return ImagePublic{}
	}
	return ImagePublic{
		Name:             util.Clean(item["name"]),
		Path:             util.Clean(item["path"]),
		OwnerID:          util.Clean(item["owner_id"]),
		OwnerName:        util.Clean(item["owner_name"]),
		Visibility:       util.Clean(item["visibility"]),
		Date:             util.Clean(item["date"]),
		Size:             int64(util.ToInt(item["size"], 0)),
		URL:              util.Clean(item["url"]),
		ThumbnailURL:     util.Clean(item["thumbnail_url"]),
		Width:            item["width"],
		Height:           item["height"],
		Resolution:       util.Clean(item["resolution"]),
		ResolutionPreset: util.Clean(item["resolution_preset"]),
		RequestedSize:    util.Clean(item["requested_size"]),
		OutputFormat:     util.Clean(item["output_format"]),
		AspectRatio:      util.Clean(item["aspect_ratio"]),
		Orientation:      util.Clean(item["orientation"]),
		Megapixels:       item["megapixels"],
		CreatedAt:        util.Clean(item["created_at"]),
		PublishedAt:      util.Clean(item["published_at"]),
	}
}

// ImagePublicListFromMaps converts a slice of image maps.
func ImagePublicListFromMaps(items []map[string]any) []ImagePublic {
	out := make([]ImagePublic, 0, len(items))
	for _, item := range items {
		out = append(out, ImagePublicFromMap(item))
	}
	return out
}

// ImageListFromPayload converts ListImages map payload (after decorate) to typed response.
func ImageListFromPayload(payload map[string]any) ImageListResponse {
	if payload == nil {
		return ImageListResponse{Items: []ImagePublic{}, Groups: []ImageGroupPublic{}, Limit: DefaultImageListLimit}
	}
	items := util.AsMapSlice(payload["items"])
	groupsRaw := util.AsMapSlice(payload["groups"])
	groups := make([]ImageGroupPublic, 0, len(groupsRaw))
	for _, group := range groupsRaw {
		groups = append(groups, ImageGroupPublic{
			Date:  util.Clean(group["date"]),
			Items: ImagePublicListFromMaps(util.AsMapSlice(group["items"])),
		})
	}
	if groups == nil {
		groups = []ImageGroupPublic{}
	}
	return ImageListResponse{
		Items:      ImagePublicListFromMaps(items),
		Groups:     groups,
		Total:      util.ToInt(payload["total"], len(items)),
		HasMore:    util.ToBool(payload["has_more"]),
		NextCursor: util.Clean(payload["next_cursor"]),
		Limit:      util.ToInt(payload["limit"], 0),
	}
}
