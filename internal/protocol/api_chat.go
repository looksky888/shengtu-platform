package protocol

import (
	"context"
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"
	"time"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/util"
)

func (e *Engine) HandleChatCompletions(ctx context.Context, body map[string]any) (map[string]any, *StreamResult, error) {
	if util.ToBool(body["stream"]) {
		var items <-chan map[string]any
		var errCh <-chan error
		if IsImageChatRequest(body) {
			items, errCh = e.ImageChatEvents(ctx, body)
		} else {
			model, messages, err := TextChatParts(body)
			if err != nil {
				return nil, nil, err
			}
			items, errCh = e.StreamTextChatCompletion(ctx, e.TextBackend(e.Accounts.GetTextAccessToken()), messages, model)
		}
		return nil, &StreamResult{Items: items, Err: errCh, Kind: "openai"}, nil
	}
	if IsImageChatRequest(body) {
		return e.ImageChatResponse(ctx, body)
	}
	model, messages, err := TextChatParts(body)
	if err != nil {
		return nil, nil, err
	}
	text, err := e.CollectText(ctx, e.TextBackend(e.Accounts.GetTextAccessToken()), ConversationRequest{Model: model, Messages: messages})
	if err != nil {
		return nil, nil, err
	}
	return CompletionResponse(model, text, 0, messages), nil, nil
}

func CompletionChunk(model string, delta map[string]any, finishReason any, completionID string, created int64) map[string]any {
	if completionID == "" {
		completionID = "chatcmpl-" + util.NewHex(32)
	}
	if created == 0 {
		created = time.Now().Unix()
	}
	return map[string]any{"id": completionID, "object": "chat.completion.chunk", "created": created, "model": model, "choices": []map[string]any{{"index": 0, "delta": delta, "finish_reason": finishReason}}}
}

func CompletionResponse(model, content string, created int64, messages []map[string]any) map[string]any {
	if created == 0 {
		created = time.Now().Unix()
	}
	promptTokens, completionTokens := 0, 0
	if len(messages) > 0 {
		promptTokens = CountMessageTokens(messages, model)
		completionTokens = CountTextTokens(content, model)
	}
	return map[string]any{
		"id": "chatcmpl-" + util.NewHex(32), "object": "chat.completion", "created": created, "model": model,
		"choices": []map[string]any{{"index": 0, "message": map[string]any{"role": "assistant", "content": content}, "finish_reason": "stop"}},
		"usage":   map[string]any{"prompt_tokens": promptTokens, "completion_tokens": completionTokens, "total_tokens": promptTokens + completionTokens},
	}
}

func (e *Engine) StreamTextChatCompletion(ctx context.Context, client *backend.Client, messages []map[string]any, model string) (<-chan map[string]any, <-chan error) {
	out := make(chan map[string]any)
	errOut := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errOut)
		deltas, errCh := e.StreamTextDeltas(ctx, client, ConversationRequest{Model: model, Messages: messages})
		id := "chatcmpl-" + util.NewHex(32)
		created := time.Now().Unix()
		sentRole := false
		for deltaText := range deltas {
			if !sentRole {
				sentRole = true
				out <- CompletionChunk(model, map[string]any{"role": "assistant", "content": deltaText}, nil, id, created)
			} else {
				out <- CompletionChunk(model, map[string]any{"content": deltaText}, nil, id, created)
			}
		}
		if err := <-errCh; err != nil {
			errOut <- err
			return
		}
		if !sentRole {
			out <- CompletionChunk(model, map[string]any{"role": "assistant", "content": ""}, nil, id, created)
		}
		out <- CompletionChunk(model, map[string]any{}, "stop", id, created)
		errOut <- nil
	}()
	return out, errOut
}

func ChatMessagesFromBody(body map[string]any) ([]map[string]any, error) {
	if messages := util.AsMapSlice(body["messages"]); len(messages) > 0 {
		return messages, nil
	}
	if prompt := strings.TrimSpace(util.Clean(body["prompt"])); prompt != "" {
		return []map[string]any{{"role": "user", "content": prompt}}, nil
	}
	return nil, HTTPError{Status: 400, Message: "messages or prompt is required"}
}

func TextChatParts(body map[string]any) (string, []map[string]any, error) {
	model := firstNonEmpty(util.Clean(body["model"]), "auto")
	messages, err := ChatMessagesFromBody(body)
	if err != nil {
		return "", nil, err
	}
	return model, NormalizeMessages(messages, nil), nil
}

func IsImageChatRequest(body map[string]any) bool {
	if util.IsImageModel(util.Clean(body["model"])) {
		return true
	}
	for _, item := range anyList(body["modalities"]) {
		if strings.ToLower(util.Clean(item)) == "image" {
			return true
		}
	}
	return false
}

func (e *Engine) ImageChatResponse(ctx context.Context, body map[string]any) (map[string]any, *StreamResult, error) {
	model, prompt, n, images, messages, err := ChatImageArgs(body)
	if err != nil {
		return nil, nil, err
	}
	size := util.Clean(body["size"])
	request := ConversationRequest{Prompt: prompt, Model: model, Messages: messages, N: n, Size: size, Quality: util.Clean(body["quality"]), ResponseFormat: "b64_json", OwnerID: util.Clean(body["owner_id"]), OwnerName: util.Clean(body["owner_name"]), Images: EncodeImages(images), RequirePaidAccount: RequiresPaidImageSize(size)}
	applyImageOutputOptionsToRequest(&request, ImageOutputOptionsFromPayload(body))
	outputs, errCh := e.StreamImageOutputsWithPool(ctx, request.Normalized())
	result, err := e.CollectImageOutputs(outputs, errCh)
	if err != nil {
		return nil, nil, err
	}
	return CompletionResponse(model, ImageResultContent(result), int64(util.ToInt(result["created"], 0)), nil), nil, nil
}

func (e *Engine) ImageChatEvents(ctx context.Context, body map[string]any) (<-chan map[string]any, <-chan error) {
	out := make(chan map[string]any)
	errOut := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errOut)
		model, prompt, n, images, messages, err := ChatImageArgs(body)
		if err != nil {
			errOut <- err
			return
		}
		size := util.Clean(body["size"])
		request := ConversationRequest{Prompt: prompt, Model: model, Messages: messages, N: n, Size: size, Quality: util.Clean(body["quality"]), ResponseFormat: "b64_json", OwnerID: util.Clean(body["owner_id"]), OwnerName: util.Clean(body["owner_name"]), Images: EncodeImages(images), RequirePaidAccount: RequiresPaidImageSize(size)}
		applyImageOutputOptionsToRequest(&request, ImageOutputOptionsFromPayload(body))
		outputs, errCh := e.StreamImageOutputsWithPool(ctx, request.Normalized())
		id := "chatcmpl-" + util.NewHex(32)
		created := time.Now().Unix()
		sentRole := false
		sentText := ""
		for output := range outputs {
			content := ""
			switch output.Kind {
			case "progress":
				content = output.Text
				sentText += content
			case "result":
				content = BuildChatImageMarkdownContent(map[string]any{"data": output.Data})
			case "message":
				content = output.Text
				content = strings.TrimPrefix(content, sentText)
			}
			if content == "" {
				continue
			}
			if !sentRole {
				sentRole = true
				out <- CompletionChunk(model, map[string]any{"role": "assistant", "content": content}, nil, id, created)
			} else {
				out <- CompletionChunk(model, map[string]any{"content": content}, nil, id, created)
			}
		}
		if err := <-errCh; err != nil {
			errOut <- err
			return
		}
		if !sentRole {
			out <- CompletionChunk(model, map[string]any{"role": "assistant", "content": ""}, nil, id, created)
		}
		out <- CompletionChunk(model, map[string]any{}, "stop", id, created)
		errOut <- nil
	}()
	return out, errOut
}

func applyImageOutputOptionsToRequest(request *ConversationRequest, options ImageOutputOptions) {
	if request == nil {
		return
	}
	request.OutputFormat = options.Format
	request.OutputCompression = options.Compression
}

func ChatImageArgs(body map[string]any) (string, string, int, []UploadedImage, []map[string]any, error) {
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	rawMessages, err := ChatMessagesFromBody(body)
	if err != nil {
		return "", "", 0, nil, nil, err
	}
	messages := NormalizeMessages(rawMessages, nil)
	prompt := LatestUserPrompt(messages)
	if prompt == "" {
		prompt = ExtractChatPrompt(body)
	}
	if prompt == "" {
		return "", "", 0, nil, nil, HTTPError{Status: 400, Message: "prompt is required"}
	}
	n, err := ParseImageCount(body["n"])
	if err != nil {
		return "", "", 0, nil, nil, err
	}
	images := ExtractChatContextImages(body)
	return model, prompt, n, images, messages, nil
}

func ImageResultContent(result map[string]any) string {
	if data := util.AsMapSlice(result["data"]); len(data) > 0 {
		return BuildChatImageMarkdownContent(result)
	}
	return firstNonEmpty(util.Clean(result["message"]), "Image generation completed.")
}

func ParseImageCount(raw any) (int, error) {
	value := util.ToInt(raw, 1)
	if value < 1 || value > 4 {
		return 0, HTTPError{Status: 400, Message: "n must be between 1 and 4"}
	}
	return value, nil
}

func BuildChatImageMarkdownContent(imageResult map[string]any) string {
	var parts []string
	for index, item := range util.AsMapSlice(imageResult["data"]) {
		if b64 := util.Clean(item["b64_json"]); b64 != "" {
			parts = append(parts, fmt.Sprintf("![image_%d](data:image/png;base64,%s)", index+1, b64))
			continue
		}
		// Proxy/Grok channels often return url (local or remote) instead of b64_json.
		if imageURL := util.Clean(item["url"]); imageURL != "" {
			parts = append(parts, fmt.Sprintf("![image_%d](%s)", index+1, imageURL))
		}
	}
	if len(parts) == 0 {
		return "Image generation completed."
	}
	return strings.Join(parts, "\n\n")
}

func ExtractChatPrompt(body map[string]any) string {
	if prompt := strings.TrimSpace(util.Clean(body["prompt"])); prompt != "" {
		return prompt
	}
	messages := NormalizeMessages(util.AsMapSlice(body["messages"]), nil)
	if prompt := LatestUserPrompt(messages); prompt != "" {
		return prompt
	}
	for _, message := range util.AsMapSlice(body["messages"]) {
		if strings.ToLower(util.Clean(message["role"])) != "user" {
			continue
		}
		if prompt := ExtractPromptFromMessageContent(message["content"]); prompt != "" {
			return prompt
		}
	}
	return ""
}

func ExtractChatImages(body map[string]any) []UploadedImage {
	messages := util.AsMapSlice(body["messages"])
	for i := len(messages) - 1; i >= 0; i-- {
		if strings.ToLower(util.Clean(messages[i]["role"])) != "user" {
			continue
		}
		images := ExtractImagesFromMessageContent(messages[i]["content"])
		if len(images) > 0 {
			return images
		}
	}
	return nil
}

func ExtractChatContextImages(body map[string]any) []UploadedImage {
	var images []UploadedImage
	for _, message := range util.AsMapSlice(body["messages"]) {
		images = append(images, ExtractImagesFromMessageContent(message["content"])...)
	}
	if len(images) > maxContextImages {
		images = images[len(images)-maxContextImages:]
	}
	return images
}

func ExtractPromptFromMessageContent(content any) string {
	if text, ok := content.(string); ok {
		return strings.TrimSpace(text)
	}
	var parts []string
	for _, raw := range anyList(content) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		switch util.Clean(item["type"]) {
		case "text":
			if text := strings.TrimSpace(util.Clean(item["text"])); text != "" {
				parts = append(parts, text)
			}
		case "input_text":
			if text := strings.TrimSpace(firstNonEmpty(util.Clean(item["text"]), util.Clean(item["input_text"]))); text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func ExtractImagesFromMessageContent(content any) []UploadedImage {
	if text, ok := content.(string); ok {
		return ExtractImagesFromText(text)
	}
	var images []UploadedImage
	for _, raw := range anyList(content) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		itemType := util.Clean(item["type"])
		imageURL := ""
		if itemType == "image_url" {
			if obj, ok := item["image_url"].(map[string]any); ok {
				imageURL = util.Clean(obj["url"])
			} else {
				imageURL = util.Clean(item["image_url"])
			}
		}
		if itemType == "input_image" {
			imageURL = util.Clean(item["image_url"])
		}
		if strings.HasPrefix(imageURL, "data:") {
			header, data, _ := strings.Cut(imageURL, ",")
			mime := strings.TrimPrefix(strings.Split(header, ";")[0], "data:")
			bytes, err := base64.StdEncoding.DecodeString(data)
			if err == nil {
				images = append(images, UploadedImage{Data: bytes, Filename: "image.png", ContentType: firstNonEmpty(mime, "image/png")})
			}
		}
	}
	return images
}

func ExtractImagesFromText(text string) []UploadedImage {
	var images []UploadedImage
	re := regexp.MustCompile(`data:(image/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)`)
	for _, match := range re.FindAllStringSubmatch(text, -1) {
		if len(match) < 3 {
			continue
		}
		bytes, err := base64.StdEncoding.DecodeString(match[2])
		if err == nil {
			images = append(images, UploadedImage{Data: bytes, Filename: "image.png", ContentType: firstNonEmpty(match[1], "image/png")})
		}
	}
	return images
}
