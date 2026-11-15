package service

import (
	"slices"
	"strings"

	"chatgpt2api/internal/util"
)

type builtinAccountPoolModelSpec struct {
	Model        string
	DefaultCost  int
	Formats      []string
	SeedSort     int
	BackfillSort int
}

var builtinAccountPoolModelSpecs = []builtinAccountPoolModelSpec{
	{
		Model:        util.ImageModelGPT26Flare,
		DefaultCost:  util.DefaultGPTImage26CreditCost,
		Formats:      []string{"png", "jpeg", "webp", "gif"},
		SeedSort:     10,
		BackfillSort: 5,
	},
	{
		Model:        util.ImageModelGPT26,
		DefaultCost:  util.DefaultGPTImage26CreditCost,
		Formats:      []string{"png", "jpeg", "webp", "gif"},
		SeedSort:     20,
		BackfillSort: 6,
	},
	{
		Model:        util.ImageModelGPT26Sunburst,
		DefaultCost:  util.DefaultGPTImage26CreditCost,
		Formats:      []string{"png", "jpeg", "webp", "gif"},
		SeedSort:     30,
		BackfillSort: 7,
	},
	{
		Model:        util.ImageModelGPT,
		DefaultCost:  1,
		Formats:      []string{"png", "jpeg", "webp"},
		SeedSort:     40,
		BackfillSort: 40,
	},
	{
		Model:        util.ImageModelGPT25,
		DefaultCost:  2,
		Formats:      []string{"png", "jpeg", "webp"},
		SeedSort:     50,
		BackfillSort: 50,
	},
	{
		Model:        util.ImageModelGPT25Flare,
		DefaultCost:  3,
		Formats:      []string{"png", "jpeg", "webp"},
		SeedSort:     60,
		BackfillSort: 60,
	},
	{
		Model:        util.ImageModelGPT25Sunburst,
		DefaultCost:  3,
		Formats:      []string{"png", "jpeg", "webp"},
		SeedSort:     70,
		BackfillSort: 70,
	},
}

func builtinAccountPoolModelID(model string) string {
	return "local-" + strings.ReplaceAll(strings.TrimSpace(model), ".", "-")
}

func defaultModelFormats(upstreamModel string) []string {
	if util.SupportsGIFOutputModel(upstreamModel) {
		return []string{"png", "jpeg", "webp", "gif"}
	}
	return []string{"png", "jpeg", "webp"}
}

func isExactLegacyDefaultFormats(formats []string) bool {
	if len(formats) != 3 {
		return false
	}
	normalized := uniqueAllowedValues(formats, []string{"png", "jpeg", "webp", "gif"})
	return len(normalized) == 3 &&
		slices.Contains(normalized, "png") &&
		slices.Contains(normalized, "jpeg") &&
		slices.Contains(normalized, "webp")
}

func newBuiltinAccountPoolModel(channelID string, spec builtinAccountPoolModelSpec, legacy ImageChannelLegacyConfig, sortOrder int, now string) ImageChannelModel {
	if strings.TrimSpace(channelID) == "" {
		channelID = "local-account-pool"
	}
	cost := legacy.GPTModelCosts[spec.Model]
	if cost < 1 {
		cost = spec.DefaultCost
	}
	formats := append([]string(nil), spec.Formats...)
	return ImageChannelModel{
		ID:            builtinAccountPoolModelID(spec.Model),
		ChannelID:     channelID,
		DisplayName:   spec.Model,
		UpstreamModel: spec.Model,
		Capabilities:  []string{ImageCapabilityGenerate, ImageCapabilityEdit},
		Resolutions:   []string{"1k"},
		Formats:       formats,
		CreditCost:    cost,
		CreditCosts:   map[string]int{"1k": cost},
		Enabled:       true,
		Sort:          sortOrder,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
}

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
	for _, spec := range builtinAccountPoolModelSpecs {
		item := newBuiltinAccountPoolModel(local.ID, spec, legacy, spec.SeedSort, now)
		state.Models = append(state.Models, item)
		state.SeededSystemModels = append(state.SeededSystemModels, item.ID)
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

func (s *ImageChannelService) findBuiltinAccountPoolChannelIDLocked() string {
	if s.channelIndexLocked("local-account-pool") >= 0 {
		return "local-account-pool"
	}
	for _, channel := range s.state.Channels {
		if channel.Type == ImageChannelTypeAccountPool && channel.System {
			return channel.ID
		}
	}
	for _, channel := range s.state.Channels {
		if channel.Type == ImageChannelTypeAccountPool {
			return channel.ID
		}
	}
	return ""
}

// ensureBuiltinAccountPoolModelsLocked backfills newly introduced built-in GPT
// image models onto an existing system account_pool channel (such as
// "local-account-pool" or migrated "local-gpt") exactly once.
// Existing model settings, custom channels, and intentional admin deletions are preserved.
func (s *ImageChannelService) ensureBuiltinAccountPoolModelsLocked(legacy ImageChannelLegacyConfig) bool {
	poolChannelID := s.findBuiltinAccountPoolChannelIDLocked()
	if poolChannelID == "" {
		return false
	}
	now := nowImageChannelTimestamp()
	changed := false
	for _, spec := range builtinAccountPoolModelSpecs {
		modelID := builtinAccountPoolModelID(spec.Model)
		alreadyOnChannel := s.modelIndexLocked(poolChannelID, modelID) >= 0 ||
			s.hasUpstreamModelLocked(poolChannelID, spec.Model, "")
		if alreadyOnChannel {
			if util.SupportsGIFOutputModel(spec.Model) {
				for idx := range s.state.Models {
					existing := &s.state.Models[idx]
					if existing.ChannelID != poolChannelID {
						continue
					}
					if existing.ID != modelID && !strings.EqualFold(existing.UpstreamModel, spec.Model) {
						continue
					}
					if isExactLegacyDefaultFormats(existing.Formats) {
						existing.Formats = append(append([]string(nil), existing.Formats...), "gif")
						existing.UpdatedAt = now
						changed = true
					}
				}
			}
			if !slices.Contains(s.state.SeededSystemModels, modelID) {
				s.state.SeededSystemModels = append(s.state.SeededSystemModels, modelID)
				changed = true
			}
			continue
		}
		if slices.Contains(s.state.SeededSystemModels, modelID) {
			continue
		}
		// Ensure unique ID even if another channel happened to reuse the string.
		candidate := newBuiltinAccountPoolModel(poolChannelID, spec, legacy, spec.BackfillSort, now)
		for _, existing := range s.state.Models {
			if existing.ID == candidate.ID {
				candidate.ID = newImageChannelID("model")
				break
			}
		}
		s.state.Models = append(s.state.Models, candidate)
		s.state.SeededSystemModels = append(s.state.SeededSystemModels, modelID)
		changed = true
	}
	return changed
}
