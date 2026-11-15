package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const imageChannelsDocumentName = "image_channels.json"

type ImageChannelService struct {
	mu    sync.RWMutex
	store storage.JSONDocumentBackend
	key   []byte
	state imageChannelState
}

func NewImageChannelService(dataDir string, backend storage.Backend, legacy ImageChannelLegacyConfig) (*ImageChannelService, error) {
	store := jsonDocumentStoreFromBackend(backend)
	if store == nil {
		return nil, errors.New("生图渠道需要 JSON 文档存储")
	}
	key, err := loadOrCreateImageChannelKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("加载生图渠道密钥: %w", err)
	}
	s := &ImageChannelService{store: store, key: key}
	if err := s.loadOrSeed(legacy); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *ImageChannelService) loadOrSeed(legacy ImageChannelLegacyConfig) error {
	raw, err := s.store.LoadJSONDocument(imageChannelsDocumentName)
	if err != nil {
		return fmt.Errorf("加载生图渠道: %w", err)
	}
	if raw != nil {
		data, err := json.Marshal(raw)
		if err != nil {
			return fmt.Errorf("编码生图渠道: %w", err)
		}
		if len(strings.TrimSpace(string(data))) > 0 && strings.TrimSpace(string(data))[0] == '[' {
			migrated, migrateErr := migrateLegacyImageChannelDocument(raw, s.key)
			if migrateErr != nil {
				return fmt.Errorf("迁移旧生图渠道: %w", migrateErr)
			}
			s.state = migrated
			s.ensureBuiltinAccountPoolModelsLocked(legacy)
			if err := s.validateStoredState(); err != nil {
				return err
			}
			if err := s.saveLocked(); err != nil {
				return fmt.Errorf("保存迁移后的生图渠道: %w", err)
			}
			return nil
		}
		if err := json.Unmarshal(data, &s.state); err != nil {
			return fmt.Errorf("解析生图渠道: %w", err)
		}
		if s.state.Version != 1 {
			return fmt.Errorf("不支持的生图渠道数据版本: %d", s.state.Version)
		}
		if err := s.validateStoredState(); err != nil {
			return err
		}
		if s.ensureBuiltinAccountPoolModelsLocked(legacy) {
			if err := s.validateStoredState(); err != nil {
				return err
			}
			if err := s.saveLocked(); err != nil {
				return fmt.Errorf("保存补齐后的生图渠道模型: %w", err)
			}
		}
		return nil
	}
	s.state = seedImageChannelState(legacy)
	if err := s.migrateLegacyProxyLocked(legacy); err != nil {
		return err
	}
	return s.saveLocked()
}

func (s *ImageChannelService) validateStoredState() error {
	seenChannels := map[string]struct{}{}
	for _, channel := range s.state.Channels {
		if channel.ID == "" || channel.Name == "" {
			return errors.New("生图渠道数据缺少 ID 或名称")
		}
		if _, ok := seenChannels[channel.ID]; ok {
			return fmt.Errorf("生图渠道 ID 重复: %s", channel.ID)
		}
		seenChannels[channel.ID] = struct{}{}
		if channel.APIKeyCiphertext != "" {
			if _, err := decryptImageChannelSecret(s.key, channel.APIKeyCiphertext); err != nil {
				return fmt.Errorf("解密生图渠道 %s: %w", channel.Name, err)
			}
		}
	}
	seenModels := map[string]struct{}{}
	for _, model := range s.state.Models {
		if model.ID == "" || model.ChannelID == "" || model.UpstreamModel == "" {
			return errors.New("生图渠道模型数据不完整")
		}
		if _, ok := seenModels[model.ID]; ok {
			return fmt.Errorf("生图渠道模型 ID 重复: %s", model.ID)
		}
		seenModels[model.ID] = struct{}{}
		if _, ok := seenChannels[model.ChannelID]; !ok {
			return fmt.Errorf("生图渠道模型引用不存在的渠道: %s", model.ChannelID)
		}
	}
	return nil
}

func (s *ImageChannelService) saveLocked() error {
	if err := s.store.SaveJSONDocument(imageChannelsDocumentName, s.state); err != nil {
		return fmt.Errorf("保存生图渠道: %w", err)
	}
	return nil
}

func (s *ImageChannelService) ListAdmin() []ImageChannelAdmin {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]ImageChannelAdmin, 0, len(s.state.Channels))
	for _, channel := range s.state.Channels {
		item := imageChannelAdmin(channel)
		for _, model := range s.state.Models {
			if model.ChannelID != channel.ID {
				continue
			}
			item.ModelCount++
			if model.Enabled {
				item.EnabledModels++
			}
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Sort != items[j].Sort {
			return items[i].Sort < items[j].Sort
		}
		return items[i].Name < items[j].Name
	})
	return items
}

func (s *ImageChannelService) ListAllModels() []ImageChannelModel {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]ImageChannelModel, 0, len(s.state.Models))
	for _, model := range s.state.Models {
		items = append(items, cloneImageChannelModel(model))
	}
	sortImageChannelModels(items)
	return items
}

type ImageChannelSettingsSync struct {
	GPTModelCosts   map[string]int
	GrokImageCost1K *int
	GrokImageCost2K *int
	MaxConcurrency  *int
	UpdateProxy     bool
	LegacyProxy     ImageChannelLegacyConfig
}

// SyncSettings synchronizes updated /api/settings defaults (credit costs,
// concurrency limit, and legacy image proxy fields) onto the built-in system
// account_pool / grok_runtime / legacy-proxy channels so channel billing and
// concurrency stay aligned with settings.
func (s *ImageChannelService) SyncSettings(syncCfg ImageChannelSettingsSync) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	changed := false
	now := nowImageChannelTimestamp()
	poolChannelID := s.findBuiltinAccountPoolChannelIDLocked()

	if syncCfg.MaxConcurrency != nil && *syncCfg.MaxConcurrency >= 1 {
		limit := *syncCfg.MaxConcurrency
		for idx := range s.state.Channels {
			ch := &s.state.Channels[idx]
			if ch.ID == poolChannelID || (ch.System && (ch.Type == ImageChannelTypeAccountPool || ch.Type == ImageChannelTypeGrokRuntime)) {
				if ch.MaxConcurrency != limit {
					ch.MaxConcurrency = limit
					ch.UpdatedAt = now
					changed = true
				}
			}
		}
	}

	if len(syncCfg.GPTModelCosts) > 0 && poolChannelID != "" {
		for idx := range s.state.Models {
			model := &s.state.Models[idx]
			if model.ChannelID != poolChannelID {
				continue
			}
			for upstream, cost := range syncCfg.GPTModelCosts {
				if cost < 1 || !strings.EqualFold(model.UpstreamModel, upstream) {
					continue
				}
				if model.CreditCost != cost || model.CreditCosts["1k"] != cost {
					model.CreditCost = cost
					if model.CreditCosts == nil {
						model.CreditCosts = map[string]int{}
					}
					model.CreditCosts["1k"] = cost
					model.UpdatedAt = now
					changed = true
				}
			}
		}
	}

	if syncCfg.GrokImageCost1K != nil || syncCfg.GrokImageCost2K != nil {
		grokChannelIDs := map[string]struct{}{}
		for _, ch := range s.state.Channels {
			if ch.System && ch.Type == ImageChannelTypeGrokRuntime {
				grokChannelIDs[ch.ID] = struct{}{}
			}
		}
		for idx := range s.state.Models {
			model := &s.state.Models[idx]
			if _, ok := grokChannelIDs[model.ChannelID]; !ok {
				continue
			}
			if !strings.EqualFold(model.UpstreamModel, util.ImageModelGrokImagine) {
				continue
			}
			if model.CreditCosts == nil {
				model.CreditCosts = map[string]int{}
			}
			if syncCfg.GrokImageCost1K != nil && *syncCfg.GrokImageCost1K >= 1 {
				c1 := *syncCfg.GrokImageCost1K
				if model.CreditCost != c1 || model.CreditCosts["1k"] != c1 {
					model.CreditCost = c1
					model.CreditCosts["1k"] = c1
					model.UpdatedAt = now
					changed = true
				}
			}
			if syncCfg.GrokImageCost2K != nil && *syncCfg.GrokImageCost2K >= 1 {
				c2 := *syncCfg.GrokImageCost2K
				if model.CreditCosts["2k"] != c2 {
					model.CreditCosts["2k"] = c2
					model.UpdatedAt = now
					changed = true
				}
			}
		}
	}

	if syncCfg.UpdateProxy {
		legacyIdx := s.channelIndexLocked("legacy-proxy")
		baseURL := strings.TrimRight(strings.TrimSpace(syncCfg.LegacyProxy.ProxyBaseURL), "/")
		apiKey := strings.TrimSpace(syncCfg.LegacyProxy.ProxyAPIKey)
		if legacyIdx < 0 {
			if baseURL != "" || apiKey != "" {
				if err := s.migrateLegacyProxyLocked(syncCfg.LegacyProxy); err != nil {
					return err
				}
				changed = true
			}
		} else {
			ch := &s.state.Channels[legacyIdx]
			if baseURL != ch.BaseURL {
				ch.BaseURL = baseURL
				changed = true
			}
			if apiKey != "" {
				ciphertext, err := encryptImageChannelSecret(s.key, apiKey)
				if err != nil {
					return fmt.Errorf("加密中转站 API Key: %w", err)
				}
				if ch.APIKeyCiphertext != ciphertext {
					ch.APIKeyCiphertext = ciphertext
					changed = true
				}
			}
			nextEnabled := syncCfg.LegacyProxy.ProxyEnabled && ch.BaseURL != "" && ch.APIKeyCiphertext != ""
			if ch.Enabled != nextEnabled {
				ch.Enabled = nextEnabled
				changed = true
			}
			nextTimeout := clampImageChannelInt(syncCfg.LegacyProxy.TimeoutSeconds, 30, 3600, 300)
			if ch.TimeoutSeconds != nextTimeout {
				ch.TimeoutSeconds = nextTimeout
				changed = true
			}
			nextRetries := clampImageChannelInt(syncCfg.LegacyProxy.MaxRetries, 0, 5, 1)
			if ch.MaxRetries != nextRetries {
				ch.MaxRetries = nextRetries
				changed = true
			}
			if ch.DownloadURLs != syncCfg.LegacyProxy.DownloadURLs {
				ch.DownloadURLs = syncCfg.LegacyProxy.DownloadURLs
				changed = true
			}
			models := append([]string(nil), syncCfg.LegacyProxy.ProxyModels...)
			if syncCfg.LegacyProxy.ProxyModel != "" && !slices.Contains(models, syncCfg.LegacyProxy.ProxyModel) {
				models = append([]string{syncCfg.LegacyProxy.ProxyModel}, models...)
			}
			for index, modelID := range models {
				modelID = strings.TrimSpace(modelID)
				if modelID == "" || s.hasUpstreamModelLocked(ch.ID, modelID, "") {
					continue
				}
				cost := syncCfg.LegacyProxy.GPTModelCosts[modelID]
				if cost < 1 {
					cost = 1
				}
				s.state.Models = append(s.state.Models, ImageChannelModel{
					ID: newImageChannelID("model"), ChannelID: ch.ID, DisplayName: modelID, UpstreamModel: modelID,
					Capabilities: []string{ImageCapabilityGenerate, ImageCapabilityEdit}, Resolutions: []string{"1k", "2k", "4k"},
					Formats: defaultModelFormats(modelID), CreditCost: cost, CreditCosts: map[string]int{"1k": cost},
					Enabled: true, Sort: (index + 1) * 10, CreatedAt: now, UpdatedAt: now,
				})
				changed = true
			}
			if changed {
				ch.UpdatedAt = now
			}
		}
	}

	if !changed {
		return nil
	}
	if err := s.validateStoredState(); err != nil {
		return err
	}
	return s.saveLocked()
}

func (s *ImageChannelService) ListModels(channelID string, includeDisabled bool) []ImageChannelModel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]ImageChannelModel, 0)
	for _, model := range s.state.Models {
		if model.ChannelID != channelID || !includeDisabled && !model.Enabled {
			continue
		}
		items = append(items, cloneImageChannelModel(model))
	}
	sortImageChannelModels(items)
	return items
}

func (s *ImageChannelService) ListPublicModels() []ImageChannelModelPublic {
	s.mu.RLock()
	defer s.mu.RUnlock()
	channels := make(map[string]ImageChannel, len(s.state.Channels))
	for _, channel := range s.state.Channels {
		if channel.Enabled {
			channels[channel.ID] = channel
		}
	}
	items := make([]ImageChannelModelPublic, 0, len(s.state.Models))
	for _, model := range s.state.Models {
		channel, ok := channels[model.ChannelID]
		if !ok || !model.Enabled {
			continue
		}
		items = append(items, publicImageChannelModel(channel, model))
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].ChannelSort != items[j].ChannelSort {
			return items[i].ChannelSort < items[j].ChannelSort
		}
		if items[i].Sort != items[j].Sort {
			return items[i].Sort < items[j].Sort
		}
		return items[i].DisplayName < items[j].DisplayName
	})
	return items
}

func (s *ImageChannelService) ResolveModel(id string) (ResolvedImageChannelModel, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id = strings.TrimSpace(id)
	for _, model := range s.state.Models {
		if model.ID != id {
			continue
		}
		return s.resolveModelLocked(model)
	}
	return ResolvedImageChannelModel{}, errors.New("所选生图模型不存在")
}

// ResolveSystemModelByUpstream resolves only built-in account-pool/runtime
// models. It lets the server recover the authoritative route and price when a
// stale client submits a model name without channel_model_id, while relay
// models still require an explicit ID to avoid ambiguous routing.
func (s *ImageChannelService) ResolveSystemModelByUpstream(upstreamModel, capability string) (ResolvedImageChannelModel, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	upstreamModel = strings.TrimSpace(upstreamModel)
	if upstreamModel == "" {
		return ResolvedImageChannelModel{}, false, nil
	}
	systemChannels := make(map[string]struct{}, len(s.state.Channels))
	for _, channel := range s.state.Channels {
		if channel.System {
			systemChannels[channel.ID] = struct{}{}
		}
	}
	var matched *ImageChannelModel
	for index := range s.state.Models {
		model := &s.state.Models[index]
		if _, ok := systemChannels[model.ChannelID]; !ok || !strings.EqualFold(model.UpstreamModel, upstreamModel) {
			continue
		}
		if matched != nil {
			return ResolvedImageChannelModel{}, true, errors.New("本地生图模型配置重复，请联系管理员")
		}
		matched = model
	}
	if matched == nil {
		return ResolvedImageChannelModel{}, false, nil
	}
	if !containsImageCapability(matched.Capabilities, capability) {
		return ResolvedImageChannelModel{}, true, errors.New("所选生图模型不支持当前操作")
	}
	resolved, err := s.resolveModelLocked(*matched)
	return resolved, true, err
}

// ResolveEnabledModelByUpstream resolves an upstream image model name when no
// explicit channel_model_id is supplied (e.g. external /v1/images/* callers).
// It prefers an enabled built-in system channel model first, then falls back
// to enabled custom openai_compatible channels sorted by channel/model sort.
func (s *ImageChannelService) ResolveEnabledModelByUpstream(upstreamModel, capability string) (ResolvedImageChannelModel, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	upstreamModel = strings.TrimSpace(upstreamModel)
	if upstreamModel == "" {
		return ResolvedImageChannelModel{}, false, nil
	}

	channelsByID := make(map[string]ImageChannel, len(s.state.Channels))
	for _, ch := range s.state.Channels {
		channelsByID[ch.ID] = ch
	}

	var sysMatched *ImageChannelModel
	for index := range s.state.Models {
		model := &s.state.Models[index]
		ch, ok := channelsByID[model.ChannelID]
		if !ok || !ch.System || !strings.EqualFold(model.UpstreamModel, upstreamModel) {
			continue
		}
		if sysMatched != nil {
			return ResolvedImageChannelModel{}, true, errors.New("本地生图模型配置重复，请联系管理员")
		}
		sysMatched = model
	}

	var sysErr error
	if sysMatched != nil {
		if !containsImageCapability(sysMatched.Capabilities, capability) {
			sysErr = errors.New("所选生图模型不支持当前操作")
		} else {
			resolved, err := s.resolveModelLocked(*sysMatched)
			if err == nil {
				return resolved, true, nil
			}
			sysErr = err
		}
	}

	type customCandidate struct {
		channel ImageChannel
		model   ImageChannelModel
	}
	candidates := make([]customCandidate, 0)
	for _, model := range s.state.Models {
		ch, ok := channelsByID[model.ChannelID]
		if !ok || ch.System || ch.Type != ImageChannelTypeOpenAICompatible {
			continue
		}
		if !strings.EqualFold(model.UpstreamModel, upstreamModel) {
			continue
		}
		candidates = append(candidates, customCandidate{channel: ch, model: model})
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].channel.Sort != candidates[j].channel.Sort {
			return candidates[i].channel.Sort < candidates[j].channel.Sort
		}
		if candidates[i].model.Sort != candidates[j].model.Sort {
			return candidates[i].model.Sort < candidates[j].model.Sort
		}
		return candidates[i].model.DisplayName < candidates[j].model.DisplayName
	})

	var customErr error
	for _, cand := range candidates {
		if !containsImageCapability(cand.model.Capabilities, capability) {
			if customErr == nil {
				customErr = errors.New("所选生图模型不支持当前操作")
			}
			continue
		}
		resolved, err := s.resolveModelLocked(cand.model)
		if err == nil {
			return resolved, true, nil
		}
		if customErr == nil {
			customErr = err
		}
	}

	if sysErr != nil {
		return ResolvedImageChannelModel{}, true, sysErr
	}
	if customErr != nil {
		return ResolvedImageChannelModel{}, true, customErr
	}
	return ResolvedImageChannelModel{}, false, nil
}

func (s *ImageChannelService) resolveModelLocked(model ImageChannelModel) (ResolvedImageChannelModel, error) {
	if !model.Enabled {
		return ResolvedImageChannelModel{}, errors.New("所选生图模型已停用")
	}
	for _, channel := range s.state.Channels {
		if channel.ID != model.ChannelID {
			continue
		}
		if !channel.Enabled {
			return ResolvedImageChannelModel{}, errors.New("所选生图渠道已停用")
		}
		apiKey, err := decryptImageChannelSecret(s.key, channel.APIKeyCiphertext)
		if err != nil {
			return ResolvedImageChannelModel{}, fmt.Errorf("读取生图渠道密钥: %w", err)
		}
		if channel.Type == ImageChannelTypeOpenAICompatible && (channel.BaseURL == "" || apiKey == "") {
			return ResolvedImageChannelModel{}, errors.New("所选中转站配置不完整")
		}
		return ResolvedImageChannelModel{
			ImageChannelModelPublic: publicImageChannelModel(channel, model), BaseURL: channel.BaseURL,
			APIKey: apiKey, MaxConcurrency: channel.MaxConcurrency, TimeoutSeconds: channel.TimeoutSeconds,
			MaxRetries: channel.MaxRetries, DownloadURLs: channel.DownloadURLs,
		}, nil
	}
	return ResolvedImageChannelModel{}, errors.New("所选生图渠道不存在")
}

func containsImageCapability(capabilities []string, target string) bool {
	for _, capability := range capabilities {
		if capability == target {
			return true
		}
	}
	return false
}

func (s *ImageChannelService) ResolveChannel(id string) (ResolvedImageChannel, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, channel := range s.state.Channels {
		if channel.ID != strings.TrimSpace(id) {
			continue
		}
		apiKey, err := decryptImageChannelSecret(s.key, channel.APIKeyCiphertext)
		if err != nil {
			return ResolvedImageChannel{}, fmt.Errorf("读取生图渠道密钥: %w", err)
		}
		return ResolvedImageChannel{
			ID: channel.ID, Name: channel.Name, Type: channel.Type, BaseURL: channel.BaseURL, APIKey: apiKey,
			Enabled: channel.Enabled, MaxConcurrency: channel.MaxConcurrency, TimeoutSeconds: channel.TimeoutSeconds,
			MaxRetries: channel.MaxRetries, DownloadURLs: channel.DownloadURLs,
		}, nil
	}
	return ResolvedImageChannel{}, errors.New("生图渠道不存在")
}

func imageChannelAdmin(channel ImageChannel) ImageChannelAdmin {
	return ImageChannelAdmin{
		ID: channel.ID, Name: channel.Name, Alias: channel.Alias, Type: channel.Type, BaseURL: channel.BaseURL,
		Enabled: channel.Enabled, System: channel.System, Sort: channel.Sort, MaxConcurrency: channel.MaxConcurrency,
		TimeoutSeconds: channel.TimeoutSeconds, MaxRetries: channel.MaxRetries, DownloadURLs: channel.DownloadURLs,
		APIKeyConfigured: channel.APIKeyCiphertext != "", APIKeyMasked: maskImageChannelSecret(channel.APIKeyCiphertext),
		CreatedAt: channel.CreatedAt, UpdatedAt: channel.UpdatedAt,
	}
}

func publicImageChannelModel(channel ImageChannel, model ImageChannelModel) ImageChannelModelPublic {
	return ImageChannelModelPublic{
		ID: model.ID, ChannelID: channel.ID, ChannelName: channel.Name, ChannelAlias: channel.Alias,
		ChannelType: channel.Type, DisplayName: model.DisplayName, UpstreamModel: model.UpstreamModel,
		Capabilities: cloneNonNilStringSlice(model.Capabilities), Resolutions: cloneNonNilStringSlice(model.Resolutions),
		Formats: cloneNonNilStringSlice(model.Formats), CreditCost: model.CreditCost,
		CreditCosts: cloneImageChannelCreditCosts(model.CreditCosts), Sort: model.Sort, ChannelSort: channel.Sort,
	}
}

func cloneImageChannelModel(model ImageChannelModel) ImageChannelModel {
	model.Capabilities = cloneNonNilStringSlice(model.Capabilities)
	model.Resolutions = cloneNonNilStringSlice(model.Resolutions)
	model.Formats = cloneNonNilStringSlice(model.Formats)
	model.CreditCosts = cloneImageChannelCreditCosts(model.CreditCosts)
	return model
}

func cloneNonNilSlice[T any](values []T) []T {
	if len(values) == 0 {
		return []T{}
	}
	out := make([]T, len(values))
	copy(out, values)
	return out
}

func cloneNonNilStringSlice(values []string) []string {
	return cloneNonNilSlice(values)
}

func cloneImageChannelCreditCosts(costs map[string]int) map[string]int {
	if len(costs) == 0 {
		return nil
	}
	cloned := make(map[string]int, len(costs))
	for resolution, cost := range costs {
		cloned[resolution] = cost
	}
	return cloned
}

// ImageChannelModelCreditCost returns the resolution-specific price and falls
// back to the model base price for upstreams that use one flat rate.
func ImageChannelModelCreditCost(model ResolvedImageChannelModel, resolution string) int {
	normalized := NormalizeImageResolutionPreset(resolution)
	if normalized == "" {
		normalized = strings.ToLower(strings.TrimSpace(resolution))
	}
	if normalized == "1080p" {
		normalized = "1k"
	}
	if cost := model.CreditCosts[normalized]; cost > 0 {
		return cost
	}
	return model.CreditCost
}

func sortImageChannelModels(items []ImageChannelModel) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Sort != items[j].Sort {
			return items[i].Sort < items[j].Sort
		}
		return items[i].DisplayName < items[j].DisplayName
	})
}

func maskImageChannelSecret(ciphertext string) string {
	if strings.TrimSpace(ciphertext) == "" {
		return ""
	}
	return "••••••••"
}

func nowImageChannelTimestamp() string { return time.Now().Format(time.RFC3339Nano) }

func newImageChannelID(prefix string) string { return prefix + "_" + util.NewHex(10) }
