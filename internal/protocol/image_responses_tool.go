package protocol

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/util"
)

const responsesImageMainModelDefault = "gpt-5.5"

const responsesImageToolInstructionsText = "Use the image_generation tool to create exactly one image for the user's request. Return the generated image result."

const responsesImagePromptGuardPrefix = "Use the following text as the complete prompt. Do not rewrite it:"

// Wire marker kept for upstream prompt compatibility (historical string; not a product model name).
const responsesImageToolBridgeMarker = "<chatgpt2api-codex-image-generation>"

const responsesImageToolBridgeText = responsesImageToolBridgeMarker + "\nWhen the user asks for raster image generation or editing, use the OpenAI Responses native `image_generation` tool attached to this request. The local Responses client may not expose an `image_gen` namespace, but that does not mean image generation is unavailable. Do not answer with prose or JSON instead of calling the image_generation tool.\n</chatgpt2api-codex-image-generation>"

func (e *Engine) StreamResponsesImageToolOutputs(ctx context.Context, client *backend.Client, request ConversationRequest, index, total int) (<-chan ImageOutput, <-chan error) {
	out := make(chan ImageOutput)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		payloads, upstreamErr := client.StreamResponsesUpstream(ctx, ResponsesImageToolPayload(request))
		created := time.Now().Unix()
		var imageItems []map[string]any
		var textParts []string
		upstreamFailure := ""
		for payload := range payloads {
			if payload == "" || payload == "[DONE]" {
				continue
			}
			var event map[string]any
			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				continue
			}
			eventType := util.Clean(event["type"])
			created = responseEventCreatedAt(event, created)
			if failure := responsesImageToolEventErrorMessage(event); failure != "" {
				upstreamFailure = failure
			}
			switch eventType {
			case "response.output_text.delta":
				if delta := util.Clean(event["delta"]); delta != "" {
					textParts = append(textParts, delta)
					out <- ImageOutput{Kind: "progress", Model: request.Model, Index: index, Total: total, Created: created, Text: delta, UpstreamEventType: eventType}
				}
			case "response.output_item.done":
				if item := util.StringMap(event["item"]); len(item) > 0 {
					imageItems = appendResponseImageOutputItems(imageItems, []map[string]any{item})
					if text := responseOutputItemText(item); text != "" {
						textParts = append(textParts, text)
					}
				}
			case "response.completed":
				if response := util.StringMap(event["response"]); len(response) > 0 {
					imageItems = appendResponseImageOutputItems(imageItems, util.AsMapSlice(response["output"]))
					if text := responseOutputItemsText(util.AsMapSlice(response["output"])); text != "" {
						textParts = append(textParts, text)
					}
				}
			default:
				out <- ImageOutput{Kind: "progress", Model: request.Model, Index: index, Total: total, Created: created, UpstreamEventType: eventType}
			}
		}
		if err := <-upstreamErr; err != nil {
			errCh <- err
			return
		}
		if upstreamFailure != "" {
			errCh <- fmt.Errorf("upstream response failed: %s", upstreamFailure)
			return
		}
		if len(imageItems) > 0 {
			result, formatErr := e.FormatImageResultWithOptions(imageItems, request.Prompt, request.ResponseFormat, request.BaseURL, request.OwnerID, request.OwnerName, created, "", ImageOutputOptions{Format: request.OutputFormat, Compression: request.OutputCompression})
			if formatErr != nil {
				errCh <- formatErr
				return
			}
			data := util.AsMapSlice(result["data"])
			if len(data) > 0 {
				out <- ImageOutput{Kind: "result", Model: request.Model, Index: index, Total: total, Created: created, Data: data}
				errCh <- nil
				return
			}
		}
		if text := strings.TrimSpace(strings.Join(textParts, "")); text != "" {
			errCh <- fmt.Errorf("image generation returned text output instead of image data: %s", text)
			return
		}
		errCh <- fmt.Errorf("image generation failed")
	}()
	return out, errCh
}

func ResponsesImageToolPayload(request ConversationRequest) map[string]any {
	prompt := guardedResponsesImagePrompt(request.Prompt)
	content := []map[string]any{{"type": "input_text", "text": prompt}}
	for _, image := range request.Images {
		if imageURL := imageInputDataURL(image); imageURL != "" {
			content = append(content, map[string]any{"type": "input_image", "image_url": imageURL})
		}
	}

	tool := map[string]any{
		"type":          "image_generation",
		"action":        responseImageToolAction(request.Images),
		"size":          firstNonEmpty(request.Size, "auto"),
		"output_format": firstNonEmpty(request.OutputFormat, "png"),
	}
	if model := responseImageToolModel(request.Model); model != "" {
		tool["model"] = model
	}
	if quality := strings.TrimSpace(request.Quality); quality != "" {
		tool["quality"] = quality
	}
	if request.OutputCompression != nil && util.Clean(tool["output_format"]) != "png" {
		tool["output_compression"] = *request.OutputCompression
	}

	instructions := responsesImageToolInstructionsText
	if shouldForceResponsesImageToolChoice(request.Model) {
		instructions = strings.TrimSpace(instructions + "\n" + responsesImageToolBridgeText)
	}

	payload := map[string]any{
		"model":        responsesImageMainModel(request.Model),
		"instructions": instructions,
		"store":        false,
		"input": []map[string]any{{
			"role":    "user",
			"content": content,
		}},
		"tools":  []map[string]any{tool},
		"stream": true,
	}
	if shouldForceResponsesImageToolChoice(request.Model) {
		payload["tool_choice"] = map[string]any{"type": "image_generation"}
	}
	return payload
}
func guardedResponsesImagePrompt(prompt string) string {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return responsesImagePromptGuardPrefix
	}
	return responsesImagePromptGuardPrefix + "\n" + prompt
}

func responsesImageMainModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" || util.IsImageGenerationModel(model) {
		return responsesImageMainModelDefault
	}
	return model
}

func shouldForceResponsesImageToolChoice(model string) bool {
	model = strings.TrimSpace(model)
	return model != "" && !util.IsImageGenerationModel(model)
}

func responseImageToolModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" || model == util.ImageModelAuto {
		return util.ImageModelGPT
	}
	// Grok and pure image-generation models should not attach a nested tool model name
	// when this Responses path is accidentally invoked; callers should route Grok elsewhere.
	if util.IsGrokImageModel(model) {
		return ""
	}
	if util.IsImageGenerationModel(model) {
		return model
	}
	return ""
}
func responseImageToolAction(images []string) string {
	if len(images) > 0 {
		return "edit"
	}
	return "generate"
}

func imageInputDataURL(image string) string {
	image = strings.TrimSpace(image)
	if image == "" {
		return ""
	}
	if strings.HasPrefix(image, "data:image/") {
		return image
	}
	return "data:image/png;base64," + image
}

func responseEventCreatedAt(event map[string]any, fallback int64) int64 {
	if created := util.ToInt(event["created_at"], 0); created > 0 {
		return int64(created)
	}
	if response := util.StringMap(event["response"]); len(response) > 0 {
		if created := util.ToInt(response["created_at"], 0); created > 0 {
			return int64(created)
		}
	}
	return fallback
}

func responsesImageToolEventErrorMessage(event map[string]any) string {
	eventType := util.Clean(event["type"])
	switch eventType {
	case "error", "response.failed", "response.incomplete", "response.cancelled", "response.canceled":
	default:
		return ""
	}
	for _, value := range []any{
		event["error"],
		util.StringMap(event["response"])["error"],
		util.StringMap(event["response"])["incomplete_details"],
		event["message"],
	} {
		if message := responseErrorValueMessage(value); message != "" {
			return message
		}
	}
	if eventType == "response.incomplete" {
		return "response incomplete"
	}
	if eventType == "response.cancelled" || eventType == "response.canceled" {
		return "response cancelled"
	}
	return "response failed"
}

func responseErrorValueMessage(value any) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	item, ok := value.(map[string]any)
	if !ok || len(item) == 0 {
		return ""
	}
	for _, key := range []string{"message", "reason", "code", "type"} {
		if text := strings.TrimSpace(util.Clean(item[key])); text != "" {
			return text
		}
	}
	return ""
}

func appendResponseImageOutputItems(items []map[string]any, output []map[string]any) []map[string]any {
	seen := map[string]struct{}{}
	for _, item := range items {
		if b64 := util.Clean(item["b64_json"]); b64 != "" {
			seen[b64] = struct{}{}
		}
	}
	for _, item := range output {
		if util.Clean(item["type"]) != "image_generation_call" {
			continue
		}
		b64 := util.Clean(item["result"])
		if b64 == "" {
			continue
		}
		if _, ok := seen[b64]; ok {
			continue
		}
		seen[b64] = struct{}{}
		items = append(items, map[string]any{"b64_json": b64, "revised_prompt": util.Clean(item["revised_prompt"])})
	}
	return items
}

func responseOutputItemsText(items []map[string]any) string {
	var parts []string
	for _, item := range items {
		if text := responseOutputItemText(item); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func responseOutputItemText(item map[string]any) string {
	if util.Clean(item["type"]) != "message" {
		return ""
	}
	var parts []string
	for _, content := range util.AsMapSlice(item["content"]) {
		if util.Clean(content["type"]) == "output_text" {
			if text := strings.TrimSpace(util.Clean(content["text"])); text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}
