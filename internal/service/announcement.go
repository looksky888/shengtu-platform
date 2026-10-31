package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

var ErrAnnouncementDisabled = errors.New("请先启用该公告后再发起全员弹窗")

type AnnouncementService struct {
	mu         sync.Mutex
	path       string
	store      storage.JSONDocumentBackend
	items      []Announcement
	docName    string
	storeReady bool

	subMu       sync.Mutex
	subscribers map[chan struct{}]struct{}
	closed      bool
}

func NewAnnouncementService(dataDir string, backend ...storage.Backend) *AnnouncementService {
	s := &AnnouncementService{
		path:        filepath.Join(dataDir, "announcements.json"),
		store:       firstJSONDocumentStore(backend),
		docName:     "announcements.json",
		subscribers: make(map[chan struct{}]struct{}),
	}
	s.items, s.storeReady = s.load()
	return s
}

func (s *AnnouncementService) Close() {
	s.subMu.Lock()
	defer s.subMu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	for ch := range s.subscribers {
		delete(s.subscribers, ch)
		close(ch)
	}
}

func (s *AnnouncementService) Subscribe(ctx context.Context) <-chan struct{} {
	ch := make(chan struct{}, 1)
	ch <- struct{}{}

	s.subMu.Lock()
	if s.closed {
		s.subMu.Unlock()
		close(ch)
		return ch
	}
	if s.subscribers == nil {
		s.subscribers = make(map[chan struct{}]struct{})
	}
	s.subscribers[ch] = struct{}{}
	s.subMu.Unlock()

	go func() {
		<-ctx.Done()
		s.subMu.Lock()
		if _, exists := s.subscribers[ch]; exists {
			delete(s.subscribers, ch)
			close(ch)
		}
		s.subMu.Unlock()
	}()
	return ch
}

func (s *AnnouncementService) notifySubscribers() {
	s.subMu.Lock()
	defer s.subMu.Unlock()
	for ch := range s.subscribers {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
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
	broadcastNow := util.ToBool(updates["broadcast_now"])
	base := map[string]any{
		"id":            id,
		"enabled":       true,
		"popup_version": 1,
		"created_at":    now,
		"updated_at":    now,
	}
	item := announcementFromMap(mergeMaps(base, updates, map[string]any{
		"id":         id,
		"created_at": now,
		"updated_at": now,
	}))
	if broadcastNow && item.Enabled {
		item.LastBroadcastAt = now
	}
	s.mu.Lock()
	prev := append([]Announcement(nil), s.items...)
	s.items = append(s.items, item)
	if err := s.saveLocked(); err != nil {
		s.items = prev
		s.mu.Unlock()
		return nil, fmt.Errorf("保存公告失败: %w", err)
	}
	out := item.toMap()
	s.mu.Unlock()
	s.notifySubscribers()
	return out, nil
}

func (s *AnnouncementService) Update(id string, updates map[string]any) (map[string]any, error) {
	id = util.Clean(id)
	if id == "" {
		return nil, nil
	}
	broadcastNow := util.ToBool(updates["broadcast_now"])
	now := util.NowISO()
	s.mu.Lock()
	for index, item := range s.items {
		if item.ID != id {
			continue
		}
		prevVersion := item.PopupVersion
		if prevVersion < 1 {
			prevVersion = 1
		}
		next := announcementFromMap(mergeMaps(item.toMap(), updates, map[string]any{
			"id":            id,
			"popup_version": prevVersion,
			"created_at":    item.CreatedAt,
			"updated_at":    now,
		}))
		if broadcastNow && next.Enabled {
			next.PopupVersion = prevVersion + 1
			next.LastBroadcastAt = now
		}
		prev := item
		s.items[index] = next
		if err := s.saveLocked(); err != nil {
			s.items[index] = prev
			s.mu.Unlock()
			return nil, fmt.Errorf("保存公告失败: %w", err)
		}
		out := next.toMap()
		s.mu.Unlock()
		s.notifySubscribers()
		return out, nil
	}
	s.mu.Unlock()
	return nil, nil
}

func (s *AnnouncementService) Broadcast(id string) (map[string]any, error) {
	id = util.Clean(id)
	if id == "" {
		return nil, nil
	}
	now := util.NowISO()
	s.mu.Lock()
	for index, item := range s.items {
		if item.ID != id {
			continue
		}
		if !item.Enabled {
			s.mu.Unlock()
			return nil, ErrAnnouncementDisabled
		}
		prevVersion := item.PopupVersion
		if prevVersion < 1 {
			prevVersion = 1
		}
		next := item
		next.PopupVersion = prevVersion + 1
		next.LastBroadcastAt = now
		next.UpdatedAt = now
		s.items[index] = next
		if err := s.saveLocked(); err != nil {
			s.items[index] = item
			s.mu.Unlock()
			return nil, fmt.Errorf("保存公告广播失败: %w", err)
		}
		out := next.toMap()
		s.mu.Unlock()
		s.notifySubscribers()
		return out, nil
	}
	s.mu.Unlock()
	return nil, nil
}

func (s *AnnouncementService) Delete(id string) (bool, error) {
	id = util.Clean(id)
	if id == "" {
		return false, nil
	}
	s.mu.Lock()
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
		s.mu.Unlock()
		return false, nil
	}
	s.items = next
	if err := s.saveLocked(); err != nil {
		s.items = prev
		s.mu.Unlock()
		return false, fmt.Errorf("保存公告删除失败: %w", err)
	}
	s.mu.Unlock()
	s.notifySubscribers()
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
	popupVersion := item.PopupVersion
	if popupVersion < 1 {
		popupVersion = 1
	}
	out := map[string]any{
		"id":            item.ID,
		"title":         item.Title,
		"content":       item.Content,
		"image_url":     item.ImageURL,
		"show_login":    item.ShowLogin,
		"show_image":    item.ShowImage,
		"popup_version": popupVersion,
	}
	if item.LastBroadcastAt != "" {
		out["last_broadcast_at"] = item.LastBroadcastAt
	}
	return out
}
