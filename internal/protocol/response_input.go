package protocol

import (
	"encoding/base64"
	"strings"

	"chatgpt2api/internal/util"
)

func HasResponseImageGenerationTool(body map[string]any) bool {
	return len(ResponseImageGenerationTool(body)) > 0
}

func ResponseImageGenerationTool(body map[string]any) map[string]any {
	for _, raw := range anyList(body["tools"]) {
		if tool, ok := raw.(map[string]any); ok && util.Clean(tool["type"]) == "image_generation" {
			return tool
		}
	}
	if choice := util.StringMap(body["tool_choice"]); choice != nil && util.Clean(choice["type"]) == "image_generation" {
		return choice
	}
	return nil
}

func ExtractResponsePrompt(input any) string {
	return LatestUserPrompt(responseInputMessages(input))
}

func ExtractResponseImage(input any) *UploadedImage {
	images := ExtractResponseImages(input)
	if len(images) == 0 {
		return nil
	}
	return &images[0]
}

func ExtractResponseImages(input any) []UploadedImage {
	var images []UploadedImage
	var walk func(any)
	walk = func(value any) {
		if text, ok := value.(string); ok {
			images = append(images, ExtractImagesFromText(text)...)
			return
		}
		if list := anyList(value); list != nil {
			for _, raw := range list {
				walk(raw)
			}
			return
		}
		item, ok := value.(map[string]any)
		if !ok {
			return
		}
		switch util.Clean(item["type"]) {
		case "input_image":
			imageURL := util.Clean(item["image_url"])
			if strings.HasPrefix(imageURL, "data:") {
				images = append(images, ExtractImagesFromMessageContent([]any{item})...)
			}
		case "image_generation_call":
			if result := util.Clean(item["result"]); result != "" {
				if data, err := base64.StdEncoding.DecodeString(result); err == nil {
					images = append(images, UploadedImage{Data: data, Filename: "generated.png", ContentType: "image/png"})
				}
			}
		}
		if item["content"] != nil {
			images = append(images, ExtractImagesFromMessageContent(item["content"])...)
		}
	}
	walk(input)
	if len(images) > maxContextImages {
		images = images[len(images)-maxContextImages:]
	}
	return images
}

func MessagesFromInput(input any, instructions any) []map[string]any {
	var messages []map[string]any
	if system := strings.TrimSpace(util.Clean(instructions)); system != "" {
		messages = append(messages, map[string]any{"role": "system", "content": system})
	}
	messages = append(messages, responseInputMessages(input)...)
	return NormalizeMessages(messages, nil)
}

func responseInputMessages(input any) []map[string]any {
	if text, ok := input.(string); ok {
		if strings.TrimSpace(text) != "" {
			return []map[string]any{{"role": "user", "content": strings.TrimSpace(text)}}
		}
		return nil
	}
	if item, ok := input.(map[string]any); ok {
		if message, ok := responseMessageFromItem(item); ok {
			return []map[string]any{message}
		}
		return nil
	}
	list := anyList(input)
	allTyped := len(list) > 0
	for _, raw := range list {
		item, ok := raw.(map[string]any)
		allTyped = allTyped && ok && item["type"] != nil && item["role"] == nil
	}
	if allTyped {
		var parts []string
		for _, raw := range list {
			if item, ok := raw.(map[string]any); ok {
				if text := responseContentText([]any{item}); text != "" {
					parts = append(parts, text)
				}
			}
		}
		if text := strings.TrimSpace(strings.Join(parts, "\n")); text != "" {
			return []map[string]any{{"role": "user", "content": text}}
		}
		return nil
	}
	var messages []map[string]any
	for _, raw := range list {
		if item, ok := raw.(map[string]any); ok {
			if message, ok := responseMessageFromItem(item); ok {
				messages = append(messages, message)
			}
		}
	}
	return messages
}

func responseMessageFromItem(item map[string]any) (map[string]any, bool) {
	switch util.Clean(item["type"]) {
	case "input_text":
		if text := strings.TrimSpace(util.Clean(item["text"])); text != "" {
			return map[string]any{"role": "user", "content": text}, true
		}
	case "output_text":
		if text := strings.TrimSpace(util.Clean(item["text"])); text != "" {
			return map[string]any{"role": "assistant", "content": text}, true
		}
	case "image_generation_call":
		if prompt := strings.TrimSpace(util.Clean(item["revised_prompt"])); prompt != "" {
			return map[string]any{"role": "assistant", "content": "Generated image: " + prompt}, true
		}
	}
	if util.Clean(item["type"]) == "message" || item["role"] != nil || item["content"] != nil {
		role := firstNonEmpty(util.Clean(item["role"]), "user")
		if text := responseContentText(item["content"]); text != "" {
			return map[string]any{"role": role, "content": text}, true
		}
	}
	return nil, false
}
