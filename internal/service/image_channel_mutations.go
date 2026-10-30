package service

import (
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
)

func (s *ImageChannelService) CreateChannel(input ImageChannelInput) (ImageChannelAdmin, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	channel, err := s.channelFromInput(ImageChannel{}, input, false)
	if err != nil {
		return ImageChannelAdmin{}, err
	}
	now := nowImageChannelTimestamp()
	channel.ID = newImageChannelID("channel")
	channel.CreatedAt, channel.UpdatedAt = now, now
	s.state.Channels = append(s.state.Channels, channel)
	if err := s.saveLocked(); err != nil {
		s.state.Channels = s.state.Channels[:len(s.state.Channels)-1]
		return ImageChannelAdmin{}, err
	}
	return imageChannelAdmin(channel), nil
}

func (s *ImageChannelService) UpdateChannel(id string, input ImageChannelInput) (ImageChannelAdmin, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index := s.channelIndexLocked(id)
	if index < 0 {
		return ImageChannelAdmin{}, errors.New("生图渠道不存在")
	}
	current := s.state.Channels[index]
	updated, err := s.channelFromInput(current, input, current.System)
	if err != nil {
		return ImageChannelAdmin{}, err
	}
	updated.ID, updated.System, updated.CreatedAt = current.ID, current.System, current.CreatedAt
	updated.UpdatedAt = nowImageChannelTimestamp()
	s.state.Channels[index] = updated
	if err := s.saveLocked(); err != nil {
		s.state.Channels[index] = current
		return ImageChannelAdmin{}, err
	}
	item := imageChannelAdmin(updated)
	for _, model := range s.state.Models {
		if model.ChannelID == id {
			item.ModelCount++
			if model.Enabled {
				item.EnabledModels++
			}
		}
	}
	return item, nil
}

func (s *ImageChannelService) DeleteChannel(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	index := s.channelIndexLocked(id)
	if index < 0 {
		return errors.New("生图渠道不存在")
	}
	if s.state.Channels[index].System {
		return errors.New("系统渠道不可删除")
	}
	oldChannels := append([]ImageChannel(nil), s.state.Channels...)
	oldModels := append([]ImageChannelModel(nil), s.state.Models...)
	s.state.Channels = append(s.state.Channels[:index], s.state.Channels[index+1:]...)
	kept := s.state.Models[:0]
	for _, model := range s.state.Models {
		if model.ChannelID != id {
			kept = append(kept, model)
		}
	}
	s.state.Models = kept
	if err := s.saveLocked(); err != nil {
		s.state.Channels, s.state.Models = oldChannels, oldModels
		return err
	}
	return nil
}

func (s *ImageChannelService) CreateModel(channelID string, input ImageChannelModelInput) (ImageChannelModel, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.channelIndexLocked(channelID) < 0 {
		return ImageChannelModel{}, errors.New("生图渠道不存在")
	}
	model, err := normalizeImageChannelModelInput(input)
	if err != nil {
		return ImageChannelModel{}, err
	}
	if s.hasUpstreamModelLocked(channelID, model.UpstreamModel, "") {
		return ImageChannelModel{}, errors.New("该渠道已存在相同上游模型")
	}
	now := nowImageChannelTimestamp()
	model.ID, model.ChannelID = newImageChannelID("model"), channelID
	model.CreatedAt, model.UpdatedAt = now, now
	s.state.Models = append(s.state.Models, model)
	if err := s.saveLocked(); err != nil {
		s.state.Models = s.state.Models[:len(s.state.Models)-1]
		return ImageChannelModel{}, err
	}
	return cloneImageChannelModel(model), nil
}

func (s *ImageChannelService) UpdateModel(channelID, modelID string, input ImageChannelModelInput) (ImageChannelModel, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index := s.modelIndexLocked(channelID, modelID)
	if index < 0 {
		return ImageChannelModel{}, errors.New("生图渠道模型不存在")
	}
	updated, err := normalizeImageChannelModelInput(input)
	if err != nil {
		return ImageChannelModel{}, err
	}
	if s.hasUpstreamModelLocked(channelID, updated.UpstreamModel, modelID) {
		return ImageChannelModel{}, errors.New("该渠道已存在相同上游模型")
	}
	current := s.state.Models[index]
	updated.ID, updated.ChannelID, updated.CreatedAt = current.ID, current.ChannelID, current.CreatedAt
	updated.UpdatedAt = nowImageChannelTimestamp()
	s.state.Models[index] = updated
	if err := s.saveLocked(); err != nil {
		s.state.Models[index] = current
		return ImageChannelModel{}, err
	}
	return cloneImageChannelModel(updated), nil
}

func (s *ImageChannelService) DeleteModel(channelID, modelID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	index := s.modelIndexLocked(channelID, modelID)
	if index < 0 {
		return errors.New("生图渠道模型不存在")
	}
	old := append([]ImageChannelModel(nil), s.state.Models...)
	s.state.Models = append(s.state.Models[:index], s.state.Models[index+1:]...)
	if err := s.saveLocked(); err != nil {
		s.state.Models = old
		return err
	}
	return nil
}

func (s *ImageChannelService) channelFromInput(current ImageChannel, input ImageChannelInput, system bool) (ImageChannel, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return ImageChannel{}, errors.New("请填写渠道名称")
	}
	typeName := strings.TrimSpace(input.Type)
	if system {
		typeName = current.Type
	}
	if typeName != ImageChannelTypeAccountPool && typeName != ImageChannelTypeOpenAICompatible && typeName != ImageChannelTypeGrokRuntime {
		return ImageChannel{}, errors.New("生图渠道类型无效")
	}
	baseURL := strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	if system {
		baseURL = current.BaseURL
	}
	if typeName == ImageChannelTypeOpenAICompatible {
		parsed, err := url.Parse(baseURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return ImageChannel{}, errors.New("中转站 Base URL 必须是有效的 HTTP(S) 地址")
		}
	}
	ciphertext := current.APIKeyCiphertext
	if input.ClearAPIKey && !system {
		ciphertext = ""
	}
	if apiKey := strings.TrimSpace(input.APIKey); apiKey != "" && !system {
		var err error
		ciphertext, err = encryptImageChannelSecret(s.key, apiKey)
		if err != nil {
			return ImageChannel{}, fmt.Errorf("加密渠道 API Key: %w", err)
		}
	}
	maxConcurrency := input.MaxConcurrency
	if maxConcurrency < 1 || maxConcurrency > 100 {
		return ImageChannel{}, errors.New("渠道最大并发必须在 1 到 100 之间")
	}
	timeout := input.TimeoutSeconds
	if timeout < 30 || timeout > 3600 {
		return ImageChannel{}, errors.New("渠道超时必须在 30 到 3600 秒之间")
	}
	if input.MaxRetries < 0 || input.MaxRetries > 5 {
		return ImageChannel{}, errors.New("渠道重试次数必须在 0 到 5 之间")
	}
	return ImageChannel{
		Name: name, Alias: strings.TrimSpace(input.Alias), Type: typeName, BaseURL: baseURL,
		APIKeyCiphertext: ciphertext, Enabled: input.Enabled, Sort: input.Sort,
		MaxConcurrency: maxConcurrency, TimeoutSeconds: timeout, MaxRetries: input.MaxRetries,
		DownloadURLs: input.DownloadURLs,
	}, nil
}

func isVideoUpstreamChannelModel(upstream string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(upstream)), "video")
}

func normalizeImageChannelModelInput(input ImageChannelModelInput) (ImageChannelModel, error) {
	upstream := strings.TrimSpace(input.UpstreamModel)
	if upstream == "" {
		return ImageChannelModel{}, errors.New("请填写上游模型 ID")
	}
	capabilities := uniqueAllowedValues(input.Capabilities, []string{ImageCapabilityGenerate, ImageCapabilityEdit})
	if len(capabilities) == 0 && !isVideoUpstreamChannelModel(upstream) {
		return ImageChannelModel{}, errors.New("至少选择一种图片能力")
	}
	if input.CreditCost < 1 || input.CreditCost > 1000000 {
		return ImageChannelModel{}, errors.New("模型积分价格必须在 1 到 1000000 之间")
	}
	creditCosts := make(map[string]int, len(input.CreditCosts))
	for resolution, cost := range input.CreditCosts {
		resolution = strings.ToLower(strings.TrimSpace(resolution))
		if !slices.Contains([]string{"1k", "2k", "4k"}, resolution) {
			continue
		}
		if cost < 1 || cost > 1000000 {
			return ImageChannelModel{}, fmt.Errorf("%s 积分价格必须在 1 到 1000000 之间", strings.ToUpper(resolution))
		}
		creditCosts[resolution] = cost
	}
	return ImageChannelModel{
		DisplayName: firstNonEmpty(strings.TrimSpace(input.DisplayName), upstream), UpstreamModel: upstream,
		Capabilities: capabilities, Resolutions: uniqueAllowedValues(input.Resolutions, []string{"1k", "2k", "4k"}),
		Formats: uniqueAllowedValues(input.Formats, []string{"png", "jpeg", "webp"}), CreditCost: input.CreditCost,
		CreditCosts: creditCosts,
		Enabled:     input.Enabled, Sort: input.Sort,
	}, nil
}

func uniqueAllowedValues(values, allowed []string) []string {
	out := make([]string, 0, len(values))
	for _, raw := range values {
		value := strings.ToLower(strings.TrimSpace(raw))
		if value == "" || !slices.Contains(allowed, value) || slices.Contains(out, value) {
			continue
		}
		out = append(out, value)
	}
	return out
}

func (s *ImageChannelService) channelIndexLocked(id string) int {
	for index := range s.state.Channels {
		if s.state.Channels[index].ID == strings.TrimSpace(id) {
			return index
		}
	}
	return -1
}

func (s *ImageChannelService) modelIndexLocked(channelID, modelID string) int {
	for index := range s.state.Models {
		if s.state.Models[index].ChannelID == channelID && s.state.Models[index].ID == modelID {
			return index
		}
	}
	return -1
}

func (s *ImageChannelService) hasUpstreamModelLocked(channelID, upstream, exceptID string) bool {
	for _, model := range s.state.Models {
		if model.ChannelID == channelID && model.ID != exceptID && strings.EqualFold(model.UpstreamModel, upstream) {
			return true
		}
	}
	return false
}

func (s *ImageChannelService) migrateLegacyProxyLocked(legacy ImageChannelLegacyConfig) error {
	baseURL, apiKey := strings.TrimRight(strings.TrimSpace(legacy.ProxyBaseURL), "/"), strings.TrimSpace(legacy.ProxyAPIKey)
	if baseURL == "" && apiKey == "" {
		return nil
	}
	ciphertext, err := encryptImageChannelSecret(s.key, apiKey)
	if err != nil {
		return fmt.Errorf("迁移旧中转站 API Key: %w", err)
	}
	now := nowImageChannelTimestamp()
	channel := ImageChannel{
		ID: "legacy-proxy", Name: "中转站", Alias: "渠道 2", Type: ImageChannelTypeOpenAICompatible,
		BaseURL: baseURL, APIKeyCiphertext: ciphertext, Enabled: legacy.ProxyEnabled && baseURL != "" && apiKey != "",
		Sort: 30, MaxConcurrency: 3, TimeoutSeconds: clampImageChannelInt(legacy.TimeoutSeconds, 30, 3600, 300),
		MaxRetries: clampImageChannelInt(legacy.MaxRetries, 0, 5, 1), DownloadURLs: legacy.DownloadURLs,
		CreatedAt: now, UpdatedAt: now,
	}
	s.state.Channels = append(s.state.Channels, channel)
	models := append([]string(nil), legacy.ProxyModels...)
	if legacy.ProxyModel != "" && !slices.Contains(models, legacy.ProxyModel) {
		models = append([]string{legacy.ProxyModel}, models...)
	}
	for index, modelID := range models {
		modelID = strings.TrimSpace(modelID)
		if modelID == "" {
			continue
		}
		cost := legacy.GPTModelCosts[modelID]
		if cost < 1 {
			cost = 1
		}
		s.state.Models = append(s.state.Models, ImageChannelModel{
			ID: newImageChannelID("model"), ChannelID: channel.ID, DisplayName: modelID, UpstreamModel: modelID,
			Capabilities: []string{ImageCapabilityGenerate, ImageCapabilityEdit}, Resolutions: []string{"1k", "2k", "4k"},
			Formats: []string{"png", "jpeg", "webp"}, CreditCost: cost, CreditCosts: map[string]int{"1k": cost},
			Enabled: true, Sort: (index + 1) * 10,
			CreatedAt: now, UpdatedAt: now,
		})
	}
	return nil
}

func clampImageChannelInt(value, minValue, maxValue, fallback int) int {
	if value < minValue || value > maxValue {
		return fallback
	}
	return value
}
