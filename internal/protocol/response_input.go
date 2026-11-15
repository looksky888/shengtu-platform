package protocol

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/service"
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
	return extractResponseImagesWithResolver(input, nil)
}

func (e *Engine) extractScopedResponseImages(ctx context.Context, scope string, input any) []UploadedImage {
	if e == nil {
		return ExtractResponseImages(input)
	}
	return extractResponseImagesWithResolver(input, func(rawRef string) ([]byte, error) {
		return e.resolveLocalImageBytesForScope(ctx, scope, rawRef)
	})
}

func (e *Engine) resolveScopedImageRefs(ctx context.Context, scope string, refs []string) []string {
	if e == nil || len(refs) == 0 {
		return refs
	}
	out := make([]string, 0, len(refs))
	for _, ref := range refs {
		trimmed := strings.TrimSpace(ref)
		if trimmed == "" {
			continue
		}
		if extractLocalImagesRel(trimmed) != "" {
			if data, err := e.resolveLocalImageBytesForScope(ctx, scope, trimmed); err == nil && len(data) > 0 {
				out = append(out, base64.StdEncoding.EncodeToString(data))
				continue
			}
		}
		out = append(out, trimmed)
	}
	return out
}

func (e *Engine) resolveLocalImageBytesForScope(ctx context.Context, scope, rawRef string) ([]byte, error) {
	if e == nil {
		return nil, fmt.Errorf("engine unavailable")
	}
	rel := extractLocalImagesRel(rawRef)
	if rel == "" {
		rel = normalizeTrackerRel(rawRef)
	}
	if rel == "" {
		return nil, fmt.Errorf("invalid local image reference")
	}
	trimmedScope := strings.TrimSpace(scope)
	if e.Media != nil {
		asset, ok, err := e.Media.Load(rel)
		if err != nil || !ok {
			return nil, fmt.Errorf("image not found")
		}
		if asset.Visibility != service.ImageVisibilityPublic && (trimmedScope == "" || asset.OwnerID != trimmedScope) {
			return nil, fmt.Errorf("image not found")
		}
		reader, _, err := e.Media.Open(ctx, asset)
		if err != nil {
			return nil, err
		}
		defer reader.Close()
		return util.ReadAllLimited(reader, 64<<20)
	}
	if e.Config == nil {
		return nil, fmt.Errorf("image config unavailable")
	}
	var rawMeta map[string]any
	if e.Storage != nil {
		if val, err := e.Storage.LoadJSONDocument(imageOwnerDocumentName(rel)); err == nil {
			rawMeta, _ = val.(map[string]any)
		}
	}
	if rawMeta == nil {
		metaPath := filepath.Join(e.Config.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
		if metaBytes, err := os.ReadFile(metaPath); err == nil {
			_ = json.Unmarshal(metaBytes, &rawMeta)
		}
	}
	visibility := strings.TrimSpace(util.Clean(rawMeta["visibility"]))
	ownerID := strings.TrimSpace(util.Clean(rawMeta["owner_id"]))
	if visibility != service.ImageVisibilityPublic && (trimmedScope == "" || ownerID != trimmedScope) {
		return nil, fmt.Errorf("image not found")
	}
	root, err := filepath.Abs(e.Config.ImagesDir())
	if err != nil {
		return nil, err
	}
	fullPath, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return nil, err
	}
	relCheck, err := filepath.Rel(root, fullPath)
	if err != nil || relCheck == "." || relCheck == ".." || strings.HasPrefix(relCheck, ".."+string(filepath.Separator)) || filepath.IsAbs(relCheck) {
		return nil, fmt.Errorf("invalid image path")
	}
	return os.ReadFile(fullPath)
}

func extractResponseImagesWithResolver(input any, resolveURL func(string) ([]byte, error)) []UploadedImage {
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
			} else if resolveURL != nil && extractLocalImagesRel(imageURL) != "" {
				if data, err := resolveURL(imageURL); err == nil && len(data) > 0 {
					images = append(images, UploadedImage{Data: data, Filename: "input.png", ContentType: "image/png"})
				}
			}
		case "image_generation_call":
			if result := util.Clean(item["result"]); result != "" {
				if data, err := base64.StdEncoding.DecodeString(result); err == nil {
					images = append(images, UploadedImage{Data: data, Filename: "generated.png", ContentType: "image/png"})
				} else if resolveURL != nil && extractLocalImagesRel(result) != "" {
					if resolvedData, resolveErr := resolveURL(result); resolveErr == nil && len(resolvedData) > 0 {
						images = append(images, UploadedImage{Data: resolvedData, Filename: "generated.png", ContentType: "image/png"})
					}
				}
			}
		}
		if item["content"] != nil {
			images = append(images, ExtractImagesFromMessageContent(item["content"])...)
			if resolveURL != nil {
				for _, rawPart := range anyList(item["content"]) {
					if part, ok := rawPart.(map[string]any); ok && util.Clean(part["type"]) == "input_image" {
						imageURL := util.Clean(part["image_url"])
						if !strings.HasPrefix(imageURL, "data:") && extractLocalImagesRel(imageURL) != "" {
							if data, err := resolveURL(imageURL); err == nil && len(data) > 0 {
								images = append(images, UploadedImage{Data: data, Filename: "input.png", ContentType: "image/png"})
							}
						}
					}
				}
			}
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
