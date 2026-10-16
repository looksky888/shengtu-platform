package service

import (
	"crypto/rand"
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

const videoReferenceAssetsDocumentName = "video_reference_assets.json"

const maxVideoReferenceAssetsPerOwner = 500

type VideoReferenceAssetPage struct {
	Items      []VideoReferenceAsset
	Total      int
	NextCursor string
	HasMore    bool
}

type VideoReferenceAsset struct {
	ID        string `json:"id"`
	OwnerID   string `json:"owner_id"`
	Name      string `json:"name"`
	MIMEType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt string `json:"created_at"`
	URL       string `json:"url,omitempty"`
}

type VideoReferenceAssetService struct {
	mu      sync.Mutex
	dataDir string
	path    string
	store   storage.JSONDocumentBackend
	items   map[string]VideoReferenceAsset
	ready   bool
}

func NewVideoReferenceAssetService(dataDir string, backend storage.Backend) *VideoReferenceAssetService {
	s := &VideoReferenceAssetService{dataDir: dataDir, path: filepath.Join(dataDir, videoReferenceAssetsDocumentName), items: map[string]VideoReferenceAsset{}}
	s.store, _ = backend.(storage.JSONDocumentBackend)
	if raw, err := loadStoredJSONWithError(s.store, videoReferenceAssetsDocumentName, s.path); err == nil {
		for _, value := range anyList(raw) {
			if item, ok := value.(map[string]any); ok {
				asset := VideoReferenceAsset{ID: util.Clean(item["id"]), OwnerID: util.Clean(item["owner_id"]), Name: util.Clean(item["name"]), MIMEType: util.Clean(item["mime_type"]), SizeBytes: int64(util.ToInt(item["size_bytes"], 0)), CreatedAt: util.Clean(item["created_at"])}
				if isVideoReferenceAssetID(asset.ID) && asset.OwnerID != "" {
					s.items[asset.ID] = asset
				}
			}
		}
		s.ready = true
	}
	return s
}

func (s *VideoReferenceAssetService) List(ownerID string) []VideoReferenceAsset {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listLocked(ownerID)
}

func (s *VideoReferenceAssetService) ListPage(ownerID string, limit int, cursorValue string) (VideoReferenceAssetPage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := s.listLocked(ownerID)
	total := len(items)
	limit = normalizeMediaPageLimit(limit)
	start, err := mediaPageStart(items, cursorValue, func(item VideoReferenceAsset) (string, string) {
		return item.CreatedAt, item.ID
	})
	if err != nil {
		return VideoReferenceAssetPage{}, err
	}
	end := start + limit
	if end > total {
		end = total
	}
	pageItems := make([]VideoReferenceAsset, end-start)
	copy(pageItems, items[start:end])
	result := VideoReferenceAssetPage{Items: pageItems, Total: total, HasMore: end < total}
	if result.HasMore && len(pageItems) > 0 {
		last := pageItems[len(pageItems)-1]
		result.NextCursor = encodeMediaListCursor(last.CreatedAt, last.ID)
	}
	return result, nil
}

func (s *VideoReferenceAssetService) listLocked(ownerID string) []VideoReferenceAsset {
	items := make([]VideoReferenceAsset, 0)
	for _, item := range s.items {
		if item.OwnerID == ownerID {
			items = append(items, item)
		}
	}
	sortVideoReferenceAssets(items)
	return items
}

func (s *VideoReferenceAssetService) New(ownerID, name, mime string, data []byte) (VideoReferenceAsset, error) {
	if strings.TrimSpace(ownerID) == "" || len(data) == 0 {
		return VideoReferenceAsset{}, fmt.Errorf("参考图片不能为空")
	}
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		return VideoReferenceAsset{}, err
	}
	id := hex.EncodeToString(idBytes)
	asset := VideoReferenceAsset{ID: id, OwnerID: strings.TrimSpace(ownerID), Name: filepath.Base(name), MIMEType: mime, SizeBytes: int64(len(data)), CreatedAt: util.NowISO()}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.ready {
		return VideoReferenceAsset{}, fmt.Errorf("参考图资产库未成功加载")
	}
	count := 0
	for _, item := range s.items {
		if item.OwnerID == asset.OwnerID {
			count++
		}
	}
	if count >= maxVideoReferenceAssetsPerOwner {
		return VideoReferenceAsset{}, fmt.Errorf("参考图资产库最多保存 %d 张图片", maxVideoReferenceAssetsPerOwner)
	}
	path := s.ContentPath(ownerID, id)
	if err := storage.AtomicWriteFile(path, data, 0o600); err != nil {
		return VideoReferenceAsset{}, err
	}
	s.items[id] = asset
	if err := s.saveLocked(); err != nil {
		delete(s.items, id)
		_ = os.Remove(path)
		return VideoReferenceAsset{}, err
	}
	return asset, nil
}

func (s *VideoReferenceAssetService) Delete(ownerID, id string) error {
	if !isVideoReferenceAssetID(id) {
		return os.ErrNotExist
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	asset, ok := s.items[id]
	if !ok || asset.OwnerID != ownerID {
		return os.ErrNotExist
	}
	delete(s.items, id)
	if err := s.saveLocked(); err != nil {
		s.items[id] = asset
		return err
	}
	if err := os.Remove(s.ContentPath(ownerID, id)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *VideoReferenceAssetService) Resolve(ownerID, id string) (string, VideoReferenceAsset, error) {
	if !isVideoReferenceAssetID(id) {
		return "", VideoReferenceAsset{}, os.ErrNotExist
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	asset, ok := s.items[id]
	if !ok || asset.OwnerID != ownerID {
		return "", VideoReferenceAsset{}, os.ErrNotExist
	}
	path := s.ContentPath(ownerID, id)
	if _, err := os.Stat(path); err != nil {
		return "", VideoReferenceAsset{}, err
	}
	return path, asset, nil
}

func (s *VideoReferenceAssetService) ContentPath(ownerID, id string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(ownerID)))
	return filepath.Join(s.dataDir, "video-reference-assets", hex.EncodeToString(sum[:]), id)
}

func (s *VideoReferenceAssetService) saveLocked() error {
	items := make([]VideoReferenceAsset, 0, len(s.items))
	for _, item := range s.items {
		items = append(items, item)
	}
	sortVideoReferenceAssets(items)
	return saveStoredJSON(s.store, videoReferenceAssetsDocumentName, s.path, items)
}

func isVideoReferenceAssetID(id string) bool {
	if len(id) != 32 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

func sortVideoReferenceAssets(items []VideoReferenceAsset) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt == items[j].CreatedAt {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt > items[j].CreatedAt
	})
}
