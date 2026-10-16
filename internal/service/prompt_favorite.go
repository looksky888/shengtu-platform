package service

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const promptFavoritesDocumentDir = "prompt_favorites"

type PromptFavoriteService struct {
	mu      sync.Mutex
	dataDir string
	store   storage.JSONDocumentBackend
}

func NewPromptFavoriteService(dataDir string, backend ...storage.Backend) *PromptFavoriteService {
	return &PromptFavoriteService{dataDir: dataDir, store: firstJSONDocumentStore(backend)}
}

func (s *PromptFavoriteService) List(ownerID string) []map[string]any {
	items := s.listRecords(ownerID)
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, item.toMap())
	}
	return out
}

func (s *PromptFavoriteService) listRecords(ownerID string) []PromptFavorite {
	ownerID = util.Clean(ownerID)
	if ownerID == "" {
		return []PromptFavorite{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	items, _ := s.loadLocked(ownerID)
	return append([]PromptFavorite(nil), items...)
}

func (s *PromptFavoriteService) Upsert(ownerID string, body map[string]any) (map[string]any, error) {
	ownerID = util.Clean(ownerID)
	if ownerID == "" {
		return nil, fmt.Errorf("需要绑定用户账号")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	items, err := s.loadLocked(ownerID)
	if err != nil {
		return nil, fmt.Errorf("加载提示词收藏失败: %w", err)
	}
	now := util.NowISO()
	existingIndex := -1
	existingFavoritedAt := ""
	bodySource := util.Clean(body["source"])
	bodyPromptID := util.Clean(body["prompt_id"])
	bodyDedupeKey := util.Clean(body["dedupe_key"])
	for index, item := range items {
		if item.Source != bodySource {
			continue
		}
		if item.PromptID != bodyPromptID && (bodyDedupeKey == "" || promptFavoriteDedupeKey(item) != bodyDedupeKey) {
			continue
		}
		existingIndex = index
		existingFavoritedAt = item.FavoritedAt
		break
	}

	item, err := normalizePromptFavoriteInput(body, now, existingFavoritedAt)
	if err != nil {
		return nil, err
	}
	if existingIndex >= 0 {
		items[existingIndex] = item
	} else {
		items = append(items, item)
	}
	sortPromptFavorites(items)
	if err := s.saveLocked(ownerID, items); err != nil {
		return nil, err
	}
	return item.toMap(), nil
}

func (s *PromptFavoriteService) Delete(ownerID, id string) (bool, error) {
	ownerID = util.Clean(ownerID)
	id = util.Clean(id)
	if ownerID == "" || id == "" {
		return false, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	items, err := s.loadLocked(ownerID)
	if err != nil {
		return false, fmt.Errorf("加载提示词收藏失败: %w", err)
	}
	next := make([]PromptFavorite, 0, len(items))
	removed := false
	for _, item := range items {
		if item.ID == id {
			removed = true
			continue
		}
		next = append(next, item)
	}
	if !removed {
		return false, nil
	}
	if err := s.saveLocked(ownerID, next); err != nil {
		return false, err
	}
	return true, nil
}

func (s *PromptFavoriteService) loadLocked(ownerID string) ([]PromptFavorite, error) {
	name := promptFavoriteDocumentName(ownerID)
	path := filepath.Join(s.dataDir, promptFavoritesDocumentDir, util.SHA256Hex(ownerID)+".json")
	raw, err := loadStoredJSONWithError(s.store, name, path)
	if err != nil {
		return nil, err
	}
	items := make([]PromptFavorite, 0)
	for _, item := range util.AsMapSlice(util.StringMap(raw)["items"]) {
		if normalized := normalizeStoredPromptFavorite(item); normalized != nil {
			items = append(items, *normalized)
		}
	}
	sortPromptFavorites(items)
	return items, nil
}

func (s *PromptFavoriteService) saveLocked(ownerID string, items []PromptFavorite) error {
	name := promptFavoriteDocumentName(ownerID)
	path := filepath.Join(s.dataDir, promptFavoritesDocumentDir, util.SHA256Hex(ownerID)+".json")
	return saveStoredJSON(s.store, name, path, map[string]any{"items": items})
}

func promptFavoriteDocumentName(ownerID string) string {
	return promptFavoritesDocumentDir + "/" + util.SHA256Hex(ownerID) + ".json"
}

func normalizePromptFavoriteInput(body map[string]any, now, existingFavoritedAt string) (PromptFavorite, error) {
	promptID := util.Clean(body["prompt_id"])
	if promptID == "" {
		return PromptFavorite{}, fmt.Errorf("请提供 prompt_id")
	}
	source := normalizePromptFavoriteSource(util.Clean(body["source"]))
	if source == "" {
		return PromptFavorite{}, fmt.Errorf("请提供来源")
	}
	title := util.Clean(body["title"])
	if title == "" {
		return PromptFavorite{}, fmt.Errorf("请填写标题")
	}
	prompt := util.Clean(body["prompt"])
	if prompt == "" {
		return PromptFavorite{}, fmt.Errorf("请填写提示词")
	}
	preview := util.Clean(body["preview"])
	if preview == "" {
		return PromptFavorite{}, fmt.Errorf("请提供预览")
	}
	author := util.Clean(body["author"])
	if author == "" {
		return PromptFavorite{}, fmt.Errorf("请提供作者")
	}
	category := util.Clean(body["category"])
	if category == "" {
		category = "未分类"
	}
	mode := normalizePromptFavoriteMode(util.Clean(body["mode"]))
	sourceLabel := util.Clean(body["source_label"])
	if sourceLabel == "" {
		sourceLabel = source
	}
	favoritedAt := existingFavoritedAt
	if favoritedAt == "" {
		favoritedAt = now
	}

	item := PromptFavorite{
		ID:                 promptFavoriteID(source, promptID),
		PromptID:           promptID,
		Source:             source,
		Title:              title,
		Preview:            preview,
		ReferenceImageURLs: normalizePromptFavoriteStringList(body["reference_image_urls"]),
		Prompt:             prompt,
		Author:             author,
		Mode:               mode,
		Category:           category,
		SourceLabel:        sourceLabel,
		IsNSFW:             util.ToBool(body["is_nsfw"]),
		FavoritedAt:        favoritedAt,
		UpdatedAt:          now,
	}
	if link := util.Clean(body["link"]); link != "" {
		item.Link = link
	}
	if dedupeKey := util.Clean(body["dedupe_key"]); dedupeKey != "" {
		item.DedupeKey = dedupeKey
	}
	if subCategory := util.Clean(body["sub_category"]); subCategory != "" {
		item.SubCategory = subCategory
	}
	if created := util.Clean(body["created"]); created != "" {
		item.Created = created
	}
	if localizations := normalizePromptFavoriteLocalizations(body["localizations"]); len(localizations) > 0 {
		item.Localizations = localizations
	}
	return item, nil
}

func normalizeStoredPromptFavorite(raw map[string]any) *PromptFavorite {
	item, err := normalizePromptFavoriteInput(raw, firstNonEmpty(util.Clean(raw["updated_at"]), util.NowISO()), util.Clean(raw["favorited_at"]))
	if err != nil {
		return nil
	}
	item.ID = firstNonEmpty(util.Clean(raw["id"]), item.ID)
	item.FavoritedAt = firstNonEmpty(util.Clean(raw["favorited_at"]), item.FavoritedAt)
	item.UpdatedAt = firstNonEmpty(util.Clean(raw["updated_at"]), item.UpdatedAt)
	return &item
}

func promptFavoriteDedupeKey(item PromptFavorite) string {
	if key := util.Clean(item.DedupeKey); key != "" {
		return key
	}
	source := util.Clean(item.Source)
	title := strings.ToLower(util.Clean(item.Title))
	category := strings.ToLower(util.Clean(item.Category))
	link := util.Clean(item.Link)
	if source == "" || title == "" {
		return ""
	}
	return util.SHA1Short(source+":"+category+":"+title+":"+link, 16)
}

func promptFavoriteID(source, promptID string) string {
	return "pf_" + util.SHA256Hex(source + "\n" + promptID)[:24]
}

func normalizePromptFavoriteSource(source string) string {
	switch source {
	case "manual":
		return source
	default:
		return ""
	}
}

func normalizePromptFavoriteMode(mode string) string {
	if mode == "edit" {
		return "edit"
	}
	return "generate"
}

func normalizePromptFavoriteStringList(value any) []string {
	items := util.AsStringSlice(value)
	out := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		cleaned := util.Clean(item)
		if cleaned == "" {
			continue
		}
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		out = append(out, cleaned)
	}
	return out
}

func normalizePromptFavoriteLocalizations(value any) map[string]PromptFavoriteLocalization {
	raw, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	out := map[string]PromptFavoriteLocalization{}
	for _, language := range []string{"zh-CN", "en"} {
		item, ok := raw[language].(map[string]any)
		if !ok {
			continue
		}
		title := util.Clean(item["title"])
		prompt := util.Clean(item["prompt"])
		category := util.Clean(item["category"])
		if title == "" || prompt == "" || category == "" {
			continue
		}
		normalized := PromptFavoriteLocalization{
			Title:    title,
			Prompt:   prompt,
			Category: category,
		}
		if subCategory := util.Clean(item["sub_category"]); subCategory != "" {
			normalized.SubCategory = subCategory
		}
		out[language] = normalized
	}
	return out
}

func sortPromptFavorites(items []PromptFavorite) {
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].FavoritedAt > items[j].FavoritedAt
	})
}
