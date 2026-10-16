package service

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type AnnouncementService struct {
	mu         sync.Mutex
	path       string
	store      storage.JSONDocumentBackend
	items      []Announcement
	docName    string
	storeReady bool
}

func NewAnnouncementService(dataDir string, backend ...storage.Backend) *AnnouncementService {
	s := &AnnouncementService{path: filepath.Join(dataDir, "announcements.json"), store: firstJSONDocumentStore(backend), docName: "announcements.json"}
	s.items, s.storeReady = s.load()
	return s
}

func (s *AnnouncementService) ListAll() []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]map[string]any, 0, len(s.items))
	for _, item := range s.items {
		out = append(out, item.toMap())
	}
	return out
}

func (s *AnnouncementService) ListVisible(target string) []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]map[string]any, 0, len(s.items))
	for _, item := range s.items {
		if !item.isVisible(target) {
			continue
		}
		out = append(out, publicAnnouncement(item))
	}
	return out
}

func (s *AnnouncementService) Create(updates map[string]any) (map[string]any, error) {
	now := util.NowISO()
	id := util.NewHex(12)
	base := map[string]any{
		"id":         id,
		"enabled":    true,
		"created_at": now,
		"updated_at": now,
	}
	item := announcementFromMap(mergeMaps(base, updates, map[string]any{
		"id":         id,
		"created_at": now,
		"updated_at": now,
	}))
	s.mu.Lock()
	defer s.mu.Unlock()
	prev := append([]Announcement(nil), s.items...)
	s.items = append(s.items, item)
	if err := s.saveLocked(); err != nil {
		s.items = prev
		return nil, fmt.Errorf("保存公告失败: %w", err)
	}
	return item.toMap(), nil
}

func (s *AnnouncementService) Update(id string, updates map[string]any) (map[string]any, error) {
	id = util.Clean(id)
	if id == "" {
		return nil, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for index, item := range s.items {
		if item.ID != id {
			continue
		}
		next := announcementFromMap(mergeMaps(item.toMap(), updates, map[string]any{
			"id":         id,
			"created_at": item.CreatedAt,
			"updated_at": util.NowISO(),
		}))
		prev := item
		s.items[index] = next
		if err := s.saveLocked(); err != nil {
			s.items[index] = prev
			return nil, fmt.Errorf("保存公告失败: %w", err)
		}
		return next.toMap(), nil
	}
	return nil, nil
}

func (s *AnnouncementService) Delete(id string) (bool, error) {
	id = util.Clean(id)
	if id == "" {
		return false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	prev := append([]Announcement(nil), s.items...)
	next := make([]Announcement, 0, len(s.items))
	removed := false
	for _, item := range s.items {
		if item.ID == id {
			removed = true
			continue
		}
		next = append(next, item)
	}
	if !removed {
		return false, nil
	}
	s.items = next
	if err := s.saveLocked(); err != nil {
		s.items = prev
		return false, fmt.Errorf("保存公告删除失败: %w", err)
	}
	return true, nil
}

func (s *AnnouncementService) load() ([]Announcement, bool) {
	raw, err := loadStoredJSONWithError(s.store, s.docName, s.path)
	if err != nil {
		return []Announcement{}, false
	}
	// Prefer direct JSON decode into typed records when possible.
	if data, err := json.Marshal(raw); err == nil {
		var typed []Announcement
		if err := json.Unmarshal(data, &typed); err == nil && typed != nil {
			out := make([]Announcement, 0, len(typed))
			for _, item := range typed {
				normalized := announcementFromMap(item.toMap())
				if normalized.Content != "" {
					out = append(out, normalized)
				}
			}
			return out, true
		}
	}
	items := make([]Announcement, 0)
	for _, item := range anyList(raw) {
		if itemMap, ok := item.(map[string]any); ok {
			normalized := announcementFromMap(itemMap)
			if normalized.Content != "" {
				items = append(items, normalized)
			}
		}
	}
	return items, true
}

func (s *AnnouncementService) saveLocked() error {
	if !s.storeReady {
		return fmt.Errorf("公告数据未成功加载，已拒绝写入以防清空存储")
	}
	return saveStoredJSON(s.store, s.docName, s.path, s.items)
}

func publicAnnouncement(item Announcement) map[string]any {
	return map[string]any{
		"id":         item.ID,
		"title":      item.Title,
		"content":    item.Content,
		"image_url":  item.ImageURL,
		"show_login": item.ShowLogin,
		"show_image": item.ShowImage,
	}
}
