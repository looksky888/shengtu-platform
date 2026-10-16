package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type VideoAssetService struct {
	mu         sync.Mutex
	dataDir    string
	path       string
	store      storage.JSONDocumentBackend
	items      map[string]VideoAsset
	storeReady bool
}

func NewVideoAssetService(dataDir string, backend ...storage.Backend) *VideoAssetService {
	s := &VideoAssetService{
		dataDir: dataDir,
		path:    filepath.Join(dataDir, videoAssetsDocumentName),
		store:   firstJSONDocumentStore(backend),
		items:   map[string]VideoAsset{},
	}
	raw, err := loadStoredJSONWithError(s.store, videoAssetsDocumentName, s.path)
	if err != nil {
		return s
	}
	changed := false
	for _, item := range anyList(raw) {
		itemMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		asset := videoAssetFromMap(itemMap)
		if asset.TaskID == "" || asset.OwnerID == "" {
			continue
		}
		nextID := VideoAssetID(asset.OwnerID, asset.TaskID)
		if asset.ID != nextID {
			asset.ID = nextID
			changed = true
		}
		if asset.Visibility == "" {
			asset.Visibility = VideoAssetVisibilityPrivate
			changed = true
		}
		if migrated, migrateErr := s.migrateLegacyContent(asset); migrateErr != nil {
			return s
		} else if migrated {
			changed = true
		}
		s.items[asset.ID] = asset
	}
	s.storeReady = true
	if changed {
		if err := s.saveLocked(); err != nil {
			s.storeReady = false
		}
	}
	return s
}

func videoAssetFromMap(item map[string]any) VideoAsset {
	return VideoAsset{
		ID: util.Clean(item["id"]), TaskID: util.Clean(item["task_id"]),
		OwnerID: util.Clean(item["owner_id"]), OwnerName: util.Clean(item["owner_name"]),
		Visibility: util.Clean(item["visibility"]), Prompt: util.Clean(item["prompt"]), Model: util.Clean(item["model"]),
		Seconds: util.ToInt(item["seconds"], 0), Size: util.Clean(item["size"]),
		ResolutionName: util.Clean(item["resolution_name"]), Preset: util.Clean(item["preset"]),
		ContentType: util.Clean(item["content_type"]), SizeBytes: int64(util.ToInt(item["size_bytes"], 0)),
		CreatedAt: util.Clean(item["created_at"]),
	}
}

func VideoAssetID(ownerID, taskID string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(ownerID) + "\x00" + strings.TrimSpace(taskID)))
	return hex.EncodeToString(sum[:])
}

func NormalizeVideoAssetVisibility(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case VideoAssetVisibilityPrivate:
		return VideoAssetVisibilityPrivate, nil
	case VideoAssetVisibilityPublic:
		return VideoAssetVisibilityPublic, nil
	default:
		return "", fmt.Errorf("视频可见范围必须为 private 或 public")
	}
}

func (s *VideoAssetService) Record(asset VideoAsset) (VideoAsset, error) {
	asset.TaskID = strings.TrimSpace(asset.TaskID)
	asset.OwnerID = strings.TrimSpace(asset.OwnerID)
	if asset.TaskID == "" || asset.OwnerID == "" {
		return VideoAsset{}, fmt.Errorf("视频任务和所属用户不能为空")
	}
	asset.ID = VideoAssetID(asset.OwnerID, asset.TaskID)
	if asset.Visibility == "" {
		asset.Visibility = VideoAssetVisibilityPrivate
	}
	visibility, err := NormalizeVideoAssetVisibility(asset.Visibility)
	if err != nil {
		return VideoAsset{}, err
	}
	asset.Visibility = visibility
	path := s.ContentPath(asset.OwnerID, asset.TaskID)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return VideoAsset{}, fmt.Errorf("视频文件不存在")
	}
	if asset.ContentType == "" {
		asset.ContentType = "video/mp4"
	}
	if asset.CreatedAt == "" {
		asset.CreatedAt = util.NowISO()
	}
	asset.SizeBytes = info.Size()

	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.storeReady {
		return VideoAsset{}, fmt.Errorf("视频索引未成功加载，已拒绝写入以防清空存储")
	}
	previous, existed := s.items[asset.ID]
	s.items[asset.ID] = asset
	if err := s.saveLocked(); err != nil {
		if existed {
			s.items[asset.ID] = previous
		} else {
			delete(s.items, asset.ID)
		}
		return VideoAsset{}, err
	}
	return asset, nil
}

func (s *VideoAssetService) List(scope VideoAssetScope) []VideoAsset {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listLocked(scope)
}

func (s *VideoAssetService) ListPage(scope VideoAssetScope, limit int, cursorValue string) (VideoAssetPage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := s.listLocked(scope)
	total := len(items)
	limit = normalizeMediaPageLimit(limit)
	start, err := mediaPageStart(items, cursorValue, func(item VideoAsset) (string, string) {
		return item.CreatedAt, item.ID
	})
	if err != nil {
		return VideoAssetPage{}, err
	}
	end := start + limit
	if end > total {
		end = total
	}
	pageItems := make([]VideoAsset, end-start)
	copy(pageItems, items[start:end])
	result := VideoAssetPage{Items: pageItems, Total: total, HasMore: end < total}
	if result.HasMore && len(pageItems) > 0 {
		last := pageItems[len(pageItems)-1]
		result.NextCursor = encodeMediaListCursor(last.CreatedAt, last.ID)
	}
	return result, nil
}

func (s *VideoAssetService) listLocked(scope VideoAssetScope) []VideoAsset {
	items := make([]VideoAsset, 0, len(s.items))
	for _, item := range s.items {
		if !videoAssetMatchesScope(item, scope) {
			continue
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].CreatedAt != items[j].CreatedAt {
			return items[i].CreatedAt > items[j].CreatedAt
		}
		return items[i].ID > items[j].ID
	})
	return items
}

func videoAssetMatchesScope(item VideoAsset, scope VideoAssetScope) bool {
	switch scope.Kind {
	case VideoAssetScopeAll:
		return true
	case VideoAssetScopePublic:
		return item.Visibility == VideoAssetVisibilityPublic
	default:
		return scope.OwnerID != "" && item.OwnerID == scope.OwnerID
	}
}

func (s *VideoAssetService) Find(id string, scope VideoAssetScope) (VideoAsset, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.items[strings.TrimSpace(id)]
	if !ok || !videoAssetMatchesScope(item, scope) {
		return VideoAsset{}, false
	}
	return item, true
}

func (s *VideoAssetService) FindAccessible(id, ownerID string, admin bool) (VideoAsset, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	reference := strings.TrimSpace(id)
	if item, ok := s.items[reference]; ok {
		if admin || item.OwnerID == ownerID || item.Visibility == VideoAssetVisibilityPublic {
			return item, true
		}
		return VideoAsset{}, false
	}
	var matched VideoAsset
	matches := 0
	for _, item := range s.items {
		if item.TaskID != reference || (!admin && item.OwnerID != ownerID && item.Visibility != VideoAssetVisibilityPublic) {
			continue
		}
		if item.OwnerID == ownerID {
			return item, true
		}
		matched = item
		matches++
	}
	if matches == 1 {
		return matched, true
	}
	return VideoAsset{}, false
}

// FindOwned resolves either an asset id or a task id without treating public
// visibility as access. Public protocol credentials may only read their own
// generated content; admins retain the cross-owner operational view.
func (s *VideoAssetService) FindOwned(id, ownerID string, admin bool) (VideoAsset, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	reference := strings.TrimSpace(id)
	if item, ok := s.items[reference]; ok {
		if admin || item.OwnerID == ownerID {
			return item, true
		}
		return VideoAsset{}, false
	}
	var matched VideoAsset
	matches := 0
	for _, item := range s.items {
		if item.TaskID != reference || (!admin && item.OwnerID != ownerID) {
			continue
		}
		if item.OwnerID == ownerID {
			return item, true
		}
		matched = item
		matches++
	}
	if admin && matches == 1 {
		return matched, true
	}
	return VideoAsset{}, false
}

func (s *VideoAssetService) UpdateVisibility(id, visibility string, scope VideoAssetScope) (VideoAsset, error) {
	visibility, err := NormalizeVideoAssetVisibility(visibility)
	if err != nil {
		return VideoAsset{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.items[strings.TrimSpace(id)]
	if !ok || !videoAssetMatchesScope(item, scope) {
		return VideoAsset{}, os.ErrNotExist
	}
	previous := item
	item.Visibility = visibility
	s.items[item.ID] = item
	if err := s.saveLocked(); err != nil {
		s.items[item.ID] = previous
		return VideoAsset{}, fmt.Errorf("保存视频公开状态失败: %w", err)
	}
	return item, nil
}

func (s *VideoAssetService) Delete(id string, scope VideoAssetScope) (bool, error) {
	id = strings.TrimSpace(id)
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.items[id]
	if !ok || !videoAssetMatchesScope(item, scope) {
		return false, nil
	}
	path := s.ContentPath(item.OwnerID, item.TaskID)
	trashPath := path + ".deleting"
	if err := os.Rename(path, trashPath); err != nil && !os.IsNotExist(err) {
		return false, fmt.Errorf("暂存待删除视频失败: %w", err)
	}
	delete(s.items, id)
	if err := s.saveLocked(); err != nil {
		s.items[id] = item
		_ = os.Rename(trashPath, path)
		return false, fmt.Errorf("保存视频索引失败: %w", err)
	}
	_ = os.Remove(trashPath)
	return true, nil
}

func (s *VideoAssetService) Backfill(items []VideoAsset) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.storeReady {
		return fmt.Errorf("视频索引未成功加载")
	}
	changed := false
	for _, item := range items {
		item.TaskID = strings.TrimSpace(item.TaskID)
		item.OwnerID = strings.TrimSpace(item.OwnerID)
		if item.TaskID == "" || item.OwnerID == "" {
			continue
		}
		item.ID = VideoAssetID(item.OwnerID, item.TaskID)
		if _, exists := s.items[item.ID]; exists {
			continue
		}
		if item.Visibility == "" {
			item.Visibility = VideoAssetVisibilityPrivate
		}
		if _, err := s.migrateLegacyContent(item); err != nil {
			return err
		}
		info, err := os.Stat(s.ContentPath(item.OwnerID, item.TaskID))
		if err != nil || info.IsDir() {
			continue
		}
		item.ContentType = "video/mp4"
		item.SizeBytes = info.Size()
		s.items[item.ID] = item
		changed = true
	}
	if !changed {
		return nil
	}
	return s.saveLocked()
}

func (s *VideoAssetService) ContentPath(ownerID, taskID string) string {
	return filepath.Join(s.dataDir, "videos", VideoAssetID(ownerID, taskID)+".mp4")
}

func (s *VideoAssetService) saveLocked() error {
	items := make([]VideoAsset, 0, len(s.items))
	for _, item := range s.items {
		items = append(items, item)
	}
	return saveStoredJSON(s.store, videoAssetsDocumentName, s.path, items)
}
