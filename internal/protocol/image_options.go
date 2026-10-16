package protocol

import (
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type ImageConfig interface {
	ImagesDir() string
	ImageMetadataDir() string
	BaseURL() string
	CleanupOldImages() int
}

type imageModelConfig interface {
	ImageDefaultModel() string
	ImageInternalModelSlug() string
	ImageFallbackModelEnabled() bool
	ImageFallbackModelSlugs() []string
}
type ConversationRequest struct {
	Model              string
	Prompt             string
	Messages           []map[string]any
	Images             []string
	N                  int
	Size               string
	Quality            string
	OutputFormat       string
	OutputCompression  *int
	ResponseFormat     string
	BaseURL            string
	OwnerID            string
	OwnerName          string
	MessageAsError     bool
	RequirePaidAccount bool
	ResponsesImageTool bool
	UpstreamModel      string
	FallbackModels     []string
}

func (r ConversationRequest) Normalized() ConversationRequest {
	r.Size = NormalizeImageGenerationSize(r.Size)
	r.Quality = ImageQualityForModel(r.Model, r.Quality)
	r.OutputFormat = NormalizeImageOutputFormat(r.OutputFormat)
	if r.OutputFormat == "png" {
		r.OutputCompression = nil
	} else if r.OutputCompression != nil {
		compression := *r.OutputCompression
		if compression < 0 {
			compression = 0
		} else if compression > 100 {
			compression = 100
		}
		r.OutputCompression = &compression
	}
	r.RequirePaidAccount = r.RequirePaidAccount || RequiresPaidImageSize(r.Size)
	return r
}

func ImageQualityForModel(model, quality string) string {
	// Grok2API ignores OpenAI-style quality for most models; still pass through if set.
	return strings.TrimSpace(quality)
}

func NormalizeImageOutputFormat(format string) string {
	return service.NormalizeImageOutputFormat(format)
}

type ImageOutputOptions struct {
	Format      string
	Compression *int
}

func ImageOutputOptionsFromPayload(payload map[string]any) ImageOutputOptions {
	format := NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
	options := ImageOutputOptions{Format: format}
	if format == "png" {
		return options
	}
	if compression, ok := normalizedImageOutputCompression(payload["output_compression"]); ok {
		options.Compression = &compression
	}
	return options
}

func normalizedImageOutputCompression(value any) (int, bool) {
	if value == nil || strings.TrimSpace(util.Clean(value)) == "" {
		return 0, false
	}
	compression := util.ToInt(value, -1)
	if compression < 0 {
		return 0, false
	}
	if compression > 100 {
		compression = 100
	}
	return compression, true
}

func (r ConversationRequest) SupportsImageGenerationModel() bool {
	return util.IsImageGenerationModel(r.Model) || (r.ResponsesImageTool && util.IsResponsesImageToolModel(r.Model))
}

func (r ConversationRequest) upstreamModelForAttempt(attempt int) string {
	models := append([]string{}, strings.TrimSpace(r.UpstreamModel))
	models = append(models, r.FallbackModels...)
	cleaned := make([]string, 0, len(models))
	seen := map[string]struct{}{}
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		if _, ok := seen[model]; ok {
			continue
		}
		seen[model] = struct{}{}
		cleaned = append(cleaned, model)
	}
	if len(cleaned) == 0 {
		return r.Model
	}
	if attempt < 0 {
		attempt = 0
	}
	return cleaned[attempt%len(cleaned)]
}

const maxFreeGeneratePixels = 1577536

func NormalizeImageGenerationSize(size string) string {
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "1080p":
		return "1080x1080"
	case "2k":
		return "2048x2048"
	case "4k":
		return "2880x2880"
	default:
		return strings.TrimSpace(size)
	}
}

func RequiresPaidImageSize(size string) bool {
	size = NormalizeImageGenerationSize(size)
	width, height, ok := imageSizeDimensions(size)
	return ok && width*height > maxFreeGeneratePixels
}

func imageSizeDimensions(size string) (int, int, bool) {
	normalized := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(size)), "×", "x")
	matches := regexp.MustCompile(`^(\d+)x(\d+)$`).FindStringSubmatch(normalized)
	if len(matches) != 3 {
		return 0, 0, false
	}
	width := util.ToInt(matches[1], 0)
	height := util.ToInt(matches[2], 0)
	if width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return width, height, true
}

func BuildImagePrompt(prompt, size, quality string) string {
	prompt = strings.TrimSpace(prompt)
	size = NormalizeImageGenerationSize(size)
	if strings.EqualFold(size, "auto") {
		size = ""
	}
	var hintsList []string
	hints := map[string]string{
		"1:1":  "输出为 1:1 正方形构图，主体居中，适合正方形画幅。",
		"3:2":  "输出为 3:2 横版构图，适合摄影、产品展示和横向叙事画幅。",
		"2:3":  "输出为 2:3 竖版构图，适合海报、人物和纵向叙事画幅。",
		"16:9": "输出为 16:9 横屏构图，适合宽画幅展示。",
		"21:9": "输出为 21:9 超宽横版构图，适合电影感全景和宽银幕画幅。",
		"9:16": "输出为 9:16 竖屏构图，适合竖版画幅展示。",
		"4:3":  "输出为 4:3 比例，兼顾宽度与高度，适合展示画面细节。",
		"3:4":  "输出为 3:4 比例，纵向构图，适合人物肖像或竖向场景。",
	}
	if size != "" {
		if width, height, ok := imageSizeDimensions(size); ok {
			hintsList = append(hintsList, fmt.Sprintf("输出图片目标分辨率为 %d x %d 像素，并严格按该尺寸对应的宽高比构图。", width, height))
		} else if hint, ok := hints[size]; ok {
			hintsList = append(hintsList, hint)
		} else {
			hintsList = append(hintsList, "输出图片，目标尺寸或宽高比为 "+size+"。")
		}
	}
	qualityHints := map[string]string{
		"low":    "画质使用 Low 档，优先更快出图，细节可以适度简化。",
		"medium": "画质使用 Medium 档，在速度、细节和整体完成度之间保持平衡。",
		"high":   "画质使用 High 档，提升细节、纹理、光影和整体完成度。",
	}
	if hint, ok := qualityHints[strings.ToLower(strings.TrimSpace(quality))]; ok {
		hintsList = append(hintsList, hint)
	}
	if len(hintsList) == 0 {
		return prompt
	}
	return prompt + "\n\n" + strings.Join(hintsList, "\n")
}

func CountMessageTokens(messages []map[string]any, model string) int {
	total := 3
	for _, message := range messages {
		total += 3
		for key, value := range message {
			if text, ok := value.(string); ok {
				total += CountTextTokens(text, model)
				if key == "name" {
					total++
				}
			}
		}
	}
	return total
}

func CountTextTokens(text, model string) int {
	runes := []rune(text)
	if len(runes) == 0 {
		return 0
	}
	return (len(runes) + 3) / 4
}

func EncodeImages(images []UploadedImage) []string {
	out := make([]string, 0, len(images))
	for _, image := range images {
		if len(image.Data) > 0 {
			out = append(out, base64.StdEncoding.EncodeToString(image.Data))
		}
	}
	return out
}

type UploadedImage struct {
	Data        []byte
	Filename    string
	ContentType string
}
