package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

func seedImageChannelState(legacy ImageChannelLegacyConfig) imageChannelState {
	now := nowImageChannelTimestamp()
	maxConcurrency := legacy.MaxConcurrency
	if maxConcurrency < 1 {
		maxConcurrency = 3
	}
	local := ImageChannel{
		ID: "local-account-pool", Name: "本地号池", Alias: "渠道 1", Type: ImageChannelTypeAccountPool,
		Enabled: true, System: true, Sort: 10, MaxConcurrency: maxConcurrency, TimeoutSeconds: 600,
		MaxRetries: 0, DownloadURLs: true, CreatedAt: now, UpdatedAt: now,
	}
	grok := ImageChannel{
		ID: "local-grok-runtime", Name: "Grok 号池", Alias: "Grok", Type: ImageChannelTypeGrokRuntime,
		Enabled: true, System: true, Sort: 20, MaxConcurrency: maxConcurrency, TimeoutSeconds: 600,
		MaxRetries: 0, DownloadURLs: true, CreatedAt: now, UpdatedAt: now,
	}
	state := imageChannelState{Version: 1, Channels: []ImageChannel{local, grok}}
	models := []string{util.ImageModelGPT, util.ImageModelGPT25, util.ImageModelGPT25Flare, util.ImageModelGPT25Sunburst}
	for index, model := range models {
		cost := legacy.GPTModelCosts[model]
		if cost < 1 {
			cost = index + 1
		}
		state.Models = append(state.Models, ImageChannelModel{
			ID: "local-" + strings.ReplaceAll(model, ".", "-"), ChannelID: local.ID,
			DisplayName: model, UpstreamModel: model, Capabilities: []string{ImageCapabilityGenerate, ImageCapabilityEdit},
			Resolutions: []string{"1k"}, Formats: []string{"png", "jpeg", "webp"}, CreditCost: cost,
			CreditCosts: map[string]int{"1k": cost},
			Enabled:     true, Sort: (index + 1) * 10, CreatedAt: now, UpdatedAt: now,
		})
	}
	grokCost := legacy.GrokImageCost1K
	if grokCost < 1 {
		grokCost = 1
	}
	grokCost2K := legacy.GrokImageCost2K
	if grokCost2K < 1 {
		grokCost2K = grokCost
	}
	state.Models = append(state.Models, ImageChannelModel{
		ID: "local-grok-imagine-image", ChannelID: grok.ID, DisplayName: util.ImageModelGrokImagine,
		UpstreamModel: util.ImageModelGrokImagine, Capabilities: []string{ImageCapabilityGenerate, ImageCapabilityEdit},
		Resolutions: []string{"1k", "2k"}, Formats: []string{"png", "jpeg", "webp"}, CreditCost: grokCost,
		CreditCosts: map[string]int{"1k": grokCost, "2k": grokCost2K},
		Enabled:     true, Sort: 10, CreatedAt: now, UpdatedAt: now,
	})
	return state
}
