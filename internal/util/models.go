package util

import "strings"

const (
	ImageModelAuto = "auto"
	// ImageModelGPT is the legacy public alias retained for existing clients.
	ImageModelGPT = "gpt-image-2"
	// ImageModelGPT25 is the compatibility alias for the current Web image
	// route. It resolves to ImageModelGPT25Flare on the upstream wire.
	ImageModelGPT25         = "gpt-image-2.5"
	ImageModelGPT25Flare    = "gpt-image-2.5-flare"
	ImageModelGPT25Sunburst = "gpt-image-2.5-sunburst"
	ImageModelGrokImagine   = "grok-imagine-image"
	ImageModelGrokLite      = "grok-imagine-image-lite"
	ImageModelGrokPro       = "grok-imagine-image-pro"
	ImageModelGrokEdit      = "grok-imagine-image-edit"
	ImageModelGPT5          = "gpt-5"
	ImageModelGPT51         = "gpt-5-1"
	ImageModelGPT52         = "gpt-5-2"
	ImageModelGPT53         = "gpt-5-3"
	ImageModelGPT53Mini     = "gpt-5-3-mini"
	ImageModelGPT54         = "gpt-5.4"
	ImageModelGPT55         = "gpt-5.5"
	ImageModelGPT55Thinking = "gpt-5-5-thinking"
	ImageModelGPTMini       = "gpt-5-mini"
	ChatModelGPT45          = "gpt-4.5"
	ChatModelGPT4o          = "gpt-4o"
	ChatModelGPT55          = "gpt-5-5"
	ChatModelGPT56          = "gpt-5-6"
	ChatModelGrok45         = "grok-4.5"
)

var ImageModels = map[string]struct{}{
	ImageModelGPT:           {},
	ImageModelGPT25:         {},
	ImageModelGPT25Flare:    {},
	ImageModelGPT25Sunburst: {},
	ImageModelGrokImagine:   {},
	ImageModelGrokLite:      {},
	ImageModelGrokPro:       {},
	ImageModelGrokEdit:      {},
}

var ModelIDs = []string{
	ImageModelGPT,
	ImageModelGPT25,
	ImageModelGPT25Flare,
	ImageModelGPT25Sunburst,
	ImageModelGrokImagine,
	ImageModelGrokLite,
	ImageModelGrokPro,
	ImageModelGrokEdit,
	ImageModelAuto,
	ChatModelGPT45,
	ChatModelGPT4o,
	ImageModelGPTMini,
	ImageModelGPT53Mini,
	ImageModelGPT5,
	ImageModelGPT51,
	ImageModelGPT52,
	ImageModelGPT53,
	ImageModelGPT54,
	ImageModelGPT55,
	ChatModelGPT55,
	ChatModelGPT56,
	ChatModelGrok45,
	"grok-4.20-fast",
	"grok-4.20-auto",
	"grok-4.20-expert",
}

var ImageGenerationModelIDs = []string{
	ImageModelGPT25Flare,
	ImageModelGPT25,
	ImageModelGPT,
	ImageModelGPT25Sunburst,
	ImageModelGrokImagine,
	ImageModelGrokLite,
	ImageModelGrokPro,
	ImageModelGrokEdit,
	ImageModelAuto,
}

var ImageGenerationModels = func() map[string]struct{} {
	models := make(map[string]struct{}, len(ImageGenerationModelIDs))
	for _, model := range ImageGenerationModelIDs {
		models[model] = struct{}{}
	}
	return models
}()

var ResponsesImageToolModels = map[string]struct{}{
	ImageModelAuto:          {},
	ImageModelGPT:           {},
	ImageModelGPT25Flare:    {},
	ImageModelGPT25:         {},
	ImageModelGPT25Sunburst: {},
	ImageModelGPTMini:       {},
	ImageModelGPT53Mini:     {},
	ImageModelGPT5:          {},
	ImageModelGPT51:         {},
	ImageModelGPT52:         {},
	ImageModelGPT53:         {},
	ImageModelGPT54:         {},
	ImageModelGPT55:         {},
}

func IsGrokModel(model string) bool {
	model = strings.ToLower(strings.TrimSpace(model))
	if model == "" {
		return false
	}
	return strings.HasPrefix(model, "grok-") || strings.HasPrefix(model, "grok_")
}

func IsGrokImageModel(model string) bool {
	model = strings.ToLower(strings.TrimSpace(model))
	if !IsGrokModel(model) {
		return false
	}
	return strings.Contains(model, "imagine") ||
		strings.Contains(model, "image") ||
		strings.Contains(model, "video")
}

func IsGrokChatModel(model string) bool {
	return IsGrokModel(model) && !IsGrokImageModel(model)
}

func IsImageModel(model string) bool {
	model = strings.TrimSpace(model)
	if IsGrokImageModel(model) {
		return true
	}
	_, ok := ImageModels[strings.ToLower(model)]
	return ok
}

func IsImageGenerationModel(model string) bool {
	model = strings.TrimSpace(model)
	if IsGrokImageModel(model) {
		return true
	}
	_, ok := ImageGenerationModels[strings.ToLower(model)]
	return ok
}

// IsGPTImageModel identifies both the current Images 2.5 API ids and the
// legacy gpt-image-2 alias. Account-pool requests use the ChatGPT image route
// for all of them; proxy_api requests keep the exact id for the upstream API.
func IsGPTImageModel(model string) bool {
	switch strings.TrimSpace(strings.ToLower(model)) {
	case ImageModelGPT, ImageModelGPT25, ImageModelGPT25Flare, ImageModelGPT25Sunburst:
		return true
	default:
		return false
	}
}

// CanonicalImage25Model returns the exact Web image model slug to send to
// prepare and conversation. The bare 2.5 alias intentionally resolves to
// flare, while explicit flare and sunburst selections remain distinct.
func CanonicalImage25Model(model string) (string, bool) {
	switch strings.TrimSpace(strings.ToLower(model)) {
	case ImageModelGPT25:
		return ImageModelGPT25Flare, true
	case ImageModelGPT25Flare:
		return ImageModelGPT25Flare, true
	case ImageModelGPT25Sunburst:
		return ImageModelGPT25Sunburst, true
	default:
		return "", false
	}
}

func IsResponsesImageToolModel(model string) bool {
	model = strings.ToLower(strings.TrimSpace(model))
	if IsGrokImageModel(model) {
		return false
	}
	_, ok := ResponsesImageToolModels[model]
	return ok
}

func UsesResponseImageCreationTask(model string) bool {
	model = strings.TrimSpace(model)
	if model == "" || model == ImageModelAuto || IsGPTImageModel(model) || IsGrokImageModel(model) {
		return false
	}
	return IsResponsesImageToolModel(model)
}

const (
	CreationTaskRouteChat             = "chat"
	CreationTaskRouteResponseImage    = "response-image"
	CreationTaskRouteImageEdits       = "image-edits"
	CreationTaskRouteImageGenerations = "image-generations"
)

func ResolveCreationTaskRoute(mode, model string, hasReferenceImages bool) string {
	mode = strings.TrimSpace(mode)
	if mode == "chat" {
		return CreationTaskRouteChat
	}
	if UsesResponseImageCreationTask(model) {
		return CreationTaskRouteResponseImage
	}
	if hasReferenceImages || mode == "edit" || mode == "image" || strings.EqualFold(strings.TrimSpace(model), ImageModelGrokEdit) {
		return CreationTaskRouteImageEdits
	}
	return CreationTaskRouteImageGenerations
}

func ModelList() []string {
	return append([]string(nil), ModelIDs...)
}

func ImageGenerationModelList() []string {
	return append([]string(nil), ImageGenerationModelIDs...)
}

func ImageGenerationModelNames() string {
	return strings.Join(ImageGenerationModelIDs, ", ")
}
