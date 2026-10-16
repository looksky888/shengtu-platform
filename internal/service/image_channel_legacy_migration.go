package service

import (
	"encoding/json"
	"fmt"
	"strings"
)

// legacyImageChannelDocument is the persisted 4.2/4.4 array shape. It is
// decoded only during startup migration and is never used by the new runtime.
type legacyImageChannelDocument struct {
	ID               string                            `json:"id"`
	Name             string                            `json:"name"`
	Kind             string                            `json:"kind"`
	BaseURL          string                            `json:"base_url"`
	APIKey           string                            `json:"api_key"`
	Enabled          bool                              `json:"enabled"`
	SortOrder        int                               `json:"sort_order"`
	ConcurrencyLimit int                               `json:"concurrency_limit"`
	TimeoutSeconds   int                               `json:"timeout_seconds"`
	MaxRetries       int                               `json:"max_retries"`
	DownloadURLs     bool                              `json:"download_urls"`
	Models           []legacyImageChannelModelDocument `json:"models"`
	CreatedAt        string                            `json:"created_at"`
	UpdatedAt        string                            `json:"updated_at"`
}

type legacyImageChannelModelDocument struct {
	VideoDurations     []int    `json:"video_durations"`
	VideoSizes         []string `json:"video_sizes"`
	ID                 string   `json:"id"`
	ProviderModel      string   `json:"provider_model"`
	DisplayName        string   `json:"display_name"`
	Protocol           string   `json:"protocol"`
	CreditCost         int      `json:"credit_cost"`
	Enabled            bool     `json:"enabled"`
	SortOrder          int      `json:"sort_order"`
	SupportsGeneration bool     `json:"supports_generation"`
	SupportsEdit       bool     `json:"supports_edit"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

func migrateLegacyImageChannelDocument(raw any, key []byte) (imageChannelState, error) {
	data, err := json.Marshal(raw)
	if err != nil {
		return imageChannelState{}, fmt.Errorf("编码旧生图渠道: %w", err)
	}
	var legacy []legacyImageChannelDocument
	if err := json.Unmarshal(data, &legacy); err != nil {
		return imageChannelState{}, fmt.Errorf("解析旧生图渠道: %w", err)
	}
	state := imageChannelState{Version: 1, Channels: make([]ImageChannel, 0, len(legacy))}
	for _, oldChannel := range legacy {
		channelType, system, err := migrateLegacyImageChannelType(oldChannel.Kind)
		if err != nil {
			return imageChannelState{}, err
		}
		ciphertext, err := encryptImageChannelSecret(key, strings.TrimSpace(oldChannel.APIKey))
		if err != nil {
			return imageChannelState{}, fmt.Errorf("加密旧生图渠道 %s: %w", oldChannel.Name, err)
		}
		channel := ImageChannel{
			ID: oldChannel.ID, Name: oldChannel.Name, Type: channelType, BaseURL: strings.TrimRight(strings.TrimSpace(oldChannel.BaseURL), "/"),
			APIKeyCiphertext: ciphertext, Enabled: oldChannel.Enabled, System: system, Sort: oldChannel.SortOrder,
			MaxConcurrency: oldChannel.ConcurrencyLimit, TimeoutSeconds: oldChannel.TimeoutSeconds, MaxRetries: oldChannel.MaxRetries,
			DownloadURLs: oldChannel.DownloadURLs, CreatedAt: oldChannel.CreatedAt, UpdatedAt: oldChannel.UpdatedAt,
		}
		if channel.MaxConcurrency < 1 {
			channel.MaxConcurrency = 3
		}
		if channel.TimeoutSeconds < 1 {
			channel.TimeoutSeconds = 600
		}
		for _, oldModel := range oldChannel.Models {
			model := ImageChannelModel{
				ID: oldModel.ID, ChannelID: channel.ID, DisplayName: oldModel.DisplayName, UpstreamModel: oldModel.ProviderModel,
				Capabilities: migrateLegacyImageCapabilities(oldModel), Resolutions: migrateLegacyImageResolutions(oldModel),
				Formats: migrateLegacyImageFormats(oldModel), CreditCost: oldModel.CreditCost,
				Enabled: oldModel.Enabled, Sort: oldModel.SortOrder, CreatedAt: oldModel.CreatedAt, UpdatedAt: oldModel.UpdatedAt,
			}
			if model.DisplayName == "" {
				model.DisplayName = model.UpstreamModel
			}
			if model.UpstreamModel == "" || model.ID == "" {
				return imageChannelState{}, fmt.Errorf("旧生图渠道 %s 的模型数据不完整", oldChannel.Name)
			}
			if model.CreditCost > 0 {
				model.CreditCosts = map[string]int{"1k": model.CreditCost}
			}
			state.Models = append(state.Models, model)
		}
		state.Channels = append(state.Channels, channel)
	}
	return state, nil
}

func migrateLegacyImageChannelType(kind string) (string, bool, error) {
	switch strings.TrimSpace(kind) {
	case "local_gpt":
		return ImageChannelTypeAccountPool, true, nil
	case "local_grok":
		return ImageChannelTypeGrokRuntime, true, nil
	case "relay":
		return ImageChannelTypeOpenAICompatible, false, nil
	default:
		return "", false, fmt.Errorf("旧生图渠道类型无效: %s", kind)
	}
}

func migrateLegacyImageCapabilities(model legacyImageChannelModelDocument) []string {
	capabilities := make([]string, 0, 2)
	if model.SupportsGeneration {
		capabilities = append(capabilities, ImageCapabilityGenerate)
	}
	if model.SupportsEdit {
		capabilities = append(capabilities, ImageCapabilityEdit)
	}
	return capabilities
}

func migrateLegacyImageResolutions(model legacyImageChannelModelDocument) []string {
	if strings.Contains(strings.ToLower(model.Protocol), "video") {
		return nil
	}
	return []string{"1k"}
}

func migrateLegacyImageFormats(model legacyImageChannelModelDocument) []string {
	if strings.Contains(strings.ToLower(model.Protocol), "video") {
		return nil
	}
	return []string{"png", "jpeg", "webp"}
}
