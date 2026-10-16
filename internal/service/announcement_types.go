package service

import "chatgpt2api/internal/util"

// Announcement is the persisted announcement record (storage + service memory).
type Announcement struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	ImageURL  string `json:"image_url"`
	Enabled   bool   `json:"enabled"`
	ShowLogin bool   `json:"show_login"`
	ShowImage bool   `json:"show_image"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// AnnouncementPublic is the API-facing announcement view.
type AnnouncementPublic struct {
	ID        string `json:"id,omitempty"`
	Title     string `json:"title,omitempty"`
	Content   string `json:"content,omitempty"`
	ImageURL  string `json:"image_url,omitempty"`
	Enabled   *bool  `json:"enabled,omitempty"`
	ShowLogin bool   `json:"show_login"`
	ShowImage bool   `json:"show_image"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// AnnouncementPublicFromRecord converts a stored announcement for API responses.
// When includeAdminMeta is true, enabled/created_at/updated_at are included (admin list).
func AnnouncementPublicFromRecord(item Announcement, includeAdminMeta bool) AnnouncementPublic {
	out := AnnouncementPublic{
		ID:        item.ID,
		Title:     item.Title,
		Content:   item.Content,
		ImageURL:  item.ImageURL,
		ShowLogin: item.ShowLogin,
		ShowImage: item.ShowImage,
	}
	if includeAdminMeta {
		enabled := item.Enabled
		out.Enabled = &enabled
		out.CreatedAt = item.CreatedAt
		out.UpdatedAt = item.UpdatedAt
	}
	return out
}

// AnnouncementPublicListFromRecords converts a slice of stored announcements.
func AnnouncementPublicListFromRecords(items []Announcement, includeAdminMeta bool) []AnnouncementPublic {
	out := make([]AnnouncementPublic, 0, len(items))
	for _, item := range items {
		out = append(out, AnnouncementPublicFromRecord(item, includeAdminMeta))
	}
	return out
}

// AnnouncementPublicFromMap converts a map (legacy Create/Update return) into public view.
func AnnouncementPublicFromMap(item map[string]any, includeAdminMeta bool) AnnouncementPublic {
	return AnnouncementPublicFromRecord(announcementFromMap(item), includeAdminMeta)
}

// AnnouncementPublicListFromMaps converts map slices (compat helper).
func AnnouncementPublicListFromMaps(items []map[string]any, includeAdminMeta bool) []AnnouncementPublic {
	out := make([]AnnouncementPublic, 0, len(items))
	for _, item := range items {
		out = append(out, AnnouncementPublicFromMap(item, includeAdminMeta))
	}
	return out
}

// ListVisibleTyped returns typed public announcements for a target (login/image).
func (s *AnnouncementService) ListVisibleTyped(target string) []AnnouncementPublic {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]AnnouncementPublic, 0, len(s.items))
	for _, item := range s.items {
		if !item.isVisible(target) {
			continue
		}
		out = append(out, AnnouncementPublicFromRecord(item, false))
	}
	return out
}

// ListAllTyped returns typed admin announcements including enabled/timestamps.
func (s *AnnouncementService) ListAllTyped() []AnnouncementPublic {
	s.mu.Lock()
	defer s.mu.Unlock()
	return AnnouncementPublicListFromRecords(append([]Announcement(nil), s.items...), true)
}

func announcementFromMap(raw map[string]any) Announcement {
	if raw == nil {
		raw = map[string]any{}
	}
	now := util.NowISO()
	id := util.Clean(raw["id"])
	if id == "" {
		id = util.NewHex(12)
	}
	createdAt := util.Clean(raw["created_at"])
	if createdAt == "" {
		createdAt = now
	}
	updatedAt := util.Clean(raw["updated_at"])
	if updatedAt == "" {
		updatedAt = createdAt
	}
	title := util.Clean(raw["title"])
	if title == "" {
		title = "公告"
	}
	return Announcement{
		ID:        id,
		Title:     title,
		Content:   util.Clean(raw["content"]),
		ImageURL:  util.Clean(raw["image_url"]),
		Enabled:   util.ToBool(util.ValueOr(raw["enabled"], true)),
		ShowLogin: util.ToBool(raw["show_login"]),
		ShowImage: util.ToBool(raw["show_image"]),
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}
}

func (a Announcement) toMap() map[string]any {
	return map[string]any{
		"id":         a.ID,
		"title":      a.Title,
		"content":    a.Content,
		"image_url":  a.ImageURL,
		"enabled":    a.Enabled,
		"show_login": a.ShowLogin,
		"show_image": a.ShowImage,
		"created_at": a.CreatedAt,
		"updated_at": a.UpdatedAt,
	}
}

func (a Announcement) isVisible(target string) bool {
	if !a.Enabled || a.Content == "" {
		return false
	}
	switch target {
	case "login":
		return a.ShowLogin
	case "image":
		return a.ShowImage
	default:
		return a.ShowLogin || a.ShowImage
	}
}
