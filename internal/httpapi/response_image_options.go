package httpapi

import (
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (a *App) runResponsesImageGenerationTask(ctx context.Context, payload map[string]any) (map[string]any, error) {
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	// Grok → native 号池; GPT proxy_api → OpenAI-compatible images API; else Responses tool.
	channel := a.resolveImageChannelForTask(payload, model)
	switch channel {
	case imageProviderGrokNative:
		images := responseImageProxyImages(payload)
		return a.runGrokNativeImageGeneration(ctx, payload, images)
	case imageProviderProxyAPI:
		images := responseImageProxyImages(payload)
		return a.runProxyImageGeneration(ctx, payload, images, channel)
	}
	body := responseImageTaskBody(payload)
	completed, _, err := a.engine.HandleResponsesScoped(ctx, body, util.Clean(payload["owner_id"]))
	if err != nil {
		if completed == nil {
			completed = map[string]any{}
		}
		return completed, err
	}
	result := responsesImageTaskResult(a.engine, completed, payload)
	if err := responsesImageTaskTextOutputError(result, completed); err != nil {
		return result, err
	}
	return result, nil
}

func responsesImageTaskTextOutputError(result map[string]any, completed map[string]any) error {
	if len(util.AsMapSlice(result["data"])) > 0 {
		return nil
	}
	text := responseOutputText(completed["output"])
	if text == "" {
		return nil
	}
	result["message"] = text
	result["output_type"] = "text"
	return &protocol.ImageGenerationError{
		Message:    firstNonEmpty(text, "Responses image_generation returned text instead of image data."),
		StatusCode: http.StatusBadGateway,
		Type:       "server_error",
		Code:       "image_generation_text_response",
	}
}

func responseImageTaskToolSize(size string) string {
	normalized := strings.TrimSpace(size)
	if normalized == "" {
		return "auto"
	}
	if converted := responseImageRatioToDefaultSize(normalized); converted != "" {
		return converted
	}
	return normalized
}

func responseImageRatioToDefaultSize(value string) string {
	left, right, ok := strings.Cut(strings.TrimSpace(value), ":")
	if !ok {
		return ""
	}
	ratioWidth, err := strconv.ParseFloat(strings.TrimSpace(left), 64)
	if err != nil || ratioWidth <= 0 {
		return ""
	}
	ratioHeight, err := strconv.ParseFloat(strings.TrimSpace(right), 64)
	if err != nil || ratioHeight <= 0 {
		return ""
	}
	if ratioWidth == ratioHeight {
		return fmt.Sprintf("%dx%d", responseImageAutoShortSide, responseImageAutoShortSide)
	}
	if ratioWidth > ratioHeight {
		width := roundResponseImageSize((float64(responseImageAutoShortSide) * ratioWidth) / ratioHeight)
		return fmt.Sprintf("%dx%d", width, responseImageAutoShortSide)
	}
	height := roundResponseImageSize((float64(responseImageAutoShortSide) * ratioHeight) / ratioWidth)
	return fmt.Sprintf("%dx%d", responseImageAutoShortSide, height)
}

func roundResponseImageSize(value float64) int {
	if value <= 0 {
		return responseImageSizeMultiple
	}
	return max(responseImageSizeMultiple, int(math.Round(value/responseImageSizeMultiple))*responseImageSizeMultiple)
}

func responseImageTaskBody(payload map[string]any) map[string]any {
	prompt := util.Clean(payload["prompt"])
	images := responseImageTaskDataURLs(payload["images"])
	input := any(prompt)
	if len(images) > 0 {
		content := []map[string]any{{"type": "input_text", "text": prompt}}
		for _, imageURL := range images {
			content = append(content, map[string]any{"type": "input_image", "image_url": imageURL})
		}
		input = []map[string]any{{"role": "user", "content": content}}
	}
	tool := map[string]any{
		"type":          "image_generation",
		"action":        responseImageTaskAction(images),
		"size":          responseImageTaskToolSize(util.Clean(payload["size"])),
		"output_format": service.NormalizeImageOutputFormat(util.Clean(payload["output_format"])),
	}
	if util.Clean(tool["output_format"]) != "png" {
		if compression, ok := imageOutputCompressionFromBody(payload["output_compression"]); ok {
			tool["output_compression"] = compression
		}
	}
	if quality := util.Clean(payload["quality"]); quality != "" {
		tool["quality"] = quality
	}
	body := map[string]any{
		"model":           firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto),
		"input":           input,
		"tools":           []map[string]any{tool},
		"tool_choice":     "required",
		"n":               util.ToInt(payload["n"], 1),
		"owner_name":      util.Clean(payload["owner_name"]),
		"response_format": "b64_json",
	}
	if messages := util.AsMapSlice(payload["messages"]); len(messages) > 0 {
		body["instructions"] = responseImageTaskInstructions(messages, prompt)
	}
	return body
}

func responseImageTaskAction(images []string) string {
	if len(images) > 0 {
		return "edit"
	}
	return "generate"
}

func responseImageTaskDataURLs(raw any) []string {
	var out []string
	for _, item := range util.AsStringSlice(raw) {
		if text := util.Clean(item); strings.HasPrefix(text, "data:image/") {
			out = append(out, text)
		}
	}
	return out
}

func responseImageProxyImages(payload map[string]any) []protocol.UploadedImage {
	var images []protocol.UploadedImage
	for _, dataURL := range responseImageTaskDataURLs(payload["images"]) {
		images = append(images, protocol.ExtractImagesFromText(dataURL)...)
	}
	return images
}

func responseImageTaskInstructions(messages []map[string]any, prompt string) string {
	var history []string
	for index, message := range messages {
		if index == len(messages)-1 && strings.TrimSpace(util.Clean(message["content"])) == strings.TrimSpace(prompt) {
			continue
		}
		text := strings.TrimSpace(util.Clean(message["content"]))
		if text == "" {
			continue
		}
		history = append(history, firstNonEmpty(util.Clean(message["role"]), "user")+": "+text)
	}
	if len(history) == 0 {
		return ""
	}
	return "Use this conversation history only as context for image generation. Do not render the history text unless the current request explicitly asks for it.\n\n" + strings.Join(history, "\n")
}

func responsesImageTaskResult(engine *protocol.Engine, completed map[string]any, payload map[string]any) map[string]any {
	created := int64(util.ToInt(completed["created_at"], int(time.Now().Unix())))
	items := responseImageOutputItems(completed["output"])
	result, err := engine.FormatImageResultWithOptions(items, util.Clean(payload["prompt"]), util.Clean(payload["response_format"]), util.Clean(payload["base_url"]), util.Clean(payload["owner_id"]), util.Clean(payload["owner_name"]), created, "", protocol.ImageOutputOptionsFromPayload(payload))
	if err != nil {
		return map[string]any{"created": created, "data": []any{}, "message": err.Error(), "output_type": "error"}
	}
	return result
}

func responseImageOutputItems(output any) []map[string]any {
	var items []map[string]any
	for _, item := range util.AsMapSlice(output) {
		if util.Clean(item["type"]) != "image_generation_call" {
			continue
		}
		b64 := util.Clean(item["result"])
		if b64 == "" {
			continue
		}
		items = append(items, map[string]any{"b64_json": b64, "revised_prompt": util.Clean(item["revised_prompt"])})
	}
	return items
}

func responseOutputText(output any) string {
	var parts []string
	for _, item := range util.AsMapSlice(output) {
		if util.Clean(item["type"]) != "message" {
			continue
		}
		for _, content := range util.AsMapSlice(item["content"]) {
			if util.Clean(content["type"]) == "output_text" {
				if text := strings.TrimSpace(util.Clean(content["text"])); text != "" {
					parts = append(parts, text)
				}
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}
