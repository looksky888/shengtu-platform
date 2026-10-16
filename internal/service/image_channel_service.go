package service

import (
	"encoding/json"
	"errors"
	"fmt"
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
		return s.validateStoredState()
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
	return ResolvedImageChannelModel{}, errors.New("所选生图模型不存在")
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
		Capabilities: append([]string{}, model.Capabilities...), Resolutions: append([]string(nil), model.Resolutions...),
		Formats: append([]string(nil), model.Formats...), CreditCost: model.CreditCost,
		CreditCosts: cloneImageChannelCreditCosts(model.CreditCosts), Sort: model.Sort, ChannelSort: channel.Sort,
	}
}

func cloneImageChannelModel(model ImageChannelModel) ImageChannelModel {
	model.Capabilities = append([]string(nil), model.Capabilities...)
	model.Resolutions = append([]string(nil), model.Resolutions...)
	model.Formats = append([]string(nil), model.Formats...)
	model.CreditCosts = cloneImageChannelCreditCosts(model.CreditCosts)
	return model
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
	resolution = strings.ToLower(strings.TrimSpace(resolution))
	if resolution == "1080p" {
		resolution = "1k"
	}
	if cost := model.CreditCosts[resolution]; cost > 0 {
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
