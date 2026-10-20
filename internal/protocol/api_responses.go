package protocol

import (
	"context"
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (e *Engine) HandleResponses(ctx context.Context, body map[string]any) (map[string]any, *StreamResult, error) {
	return e.HandleResponsesScoped(ctx, body, "")
}

func (e *Engine) HandleResponsesScoped(ctx context.Context, body map[string]any, scope string) (map[string]any, *StreamResult, error) {
	events, errCh, err := e.ResponseEventsScoped(ctx, body, scope)
	if err != nil {
		return nil, nil, err
	}
	if util.ToBool(body["stream"]) {
		return nil, &StreamResult{Items: events, Err: errCh, Kind: "openai"}, nil
	}
	completed := map[string]any{}
	for event := range events {
		if event["type"] == "response.completed" {
			if response, ok := event["response"].(map[string]any); ok {
				completed = response
			}
		}
	}
	if err := <-errCh; err != nil {
		return nil, nil, err
	}
	if len(completed) == 0 {
		return nil, nil, fmt.Errorf("response generation failed")
	}
	return completed, nil, nil
}

func (e *Engine) ResponseEvents(ctx context.Context, body map[string]any) (<-chan map[string]any, <-chan error, error) {
	return e.ResponseEventsScoped(ctx, body, "")
}

func (e *Engine) ResponseEventsScoped(ctx context.Context, body map[string]any, scope string) (<-chan map[string]any, <-chan error, error) {
	previous, err := e.responseContextFromPreviousScoped(scope, body["previous_response_id"])
	if err != nil {
		return nil, nil, err
	}
	responseModel := firstNonEmpty(util.Clean(body["model"]), "auto")
	currentMessages := MessagesFromInput(body["input"], body["instructions"])
	baseContext := MergeResponseContext(previous, currentMessages, nil)
	if !HasResponseImageGenerationTool(body) {
		events, errCh := e.StreamTextResponseWithMessages(ctx, responseModel, baseContext.Messages)
		events = e.rememberResponseContextEventsScoped(scope, events, baseContext)
		return events, errCh, nil
	}
	request, prompt, err := ResponseImageGenerationRequest(body, scope, &previous)
	if err != nil {
		return nil, nil, err
	}
	var currentImages []string
	if inputImages := ExtractResponseImages(body["input"]); len(inputImages) > 0 {
		currentImages = EncodeImages(inputImages)
	}
	baseContext = MergeResponseContext(previous, currentMessages, currentImages)
	request.Messages = baseContext.Messages
	outputs, errCh := e.StreamImageOutputsWithPool(ctx, request)
	events, responseErr := StreamImageResponse(outputs, prompt, responseModel)
	events = e.rememberResponseContextEventsScoped(scope, events, baseContext)
	return events, combineErrorChannels(errCh, responseErr), nil
}

func ResponseImageGenerationRequest(body map[string]any, scope string, previous *ResponseContext) (ConversationRequest, string, error) {
	responseModel := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	if !util.IsResponsesImageToolModel(responseModel) {
		return ConversationRequest{}, "", HTTPError{Status: 400, Message: "unsupported image_generation model: " + responseModel}
	}
	messages := MessagesFromInput(body["input"], body["instructions"])
	prompt := LatestUserPrompt(messages)
	if prompt == "" {
		return ConversationRequest{}, "", HTTPError{Status: 400, Message: "input text is required"}
	}
	n, err := ParseImageCount(body["n"])
	if err != nil {
		return ConversationRequest{}, "", err
	}
	tool := ResponseImageGenerationTool(body)
	size := firstNonEmpty(util.Clean(tool["size"]), util.Clean(body["size"]), "auto")
	inputImages := ExtractResponseImages(body["input"])
	if len(inputImages) > 0 && util.Clean(tool["size"]) == "" && util.Clean(body["size"]) == "" {
		size = "auto"
	}
	images := []string(nil)
	if previous != nil {
		images = append(images, previous.Images...)
	}
	images = append(images, EncodeImages(inputImages)...)
	if len(images) > maxContextImages {
		images = images[len(images)-maxContextImages:]
	}
	toolModel := util.Clean(tool["model"])
	validationModel := firstNonEmpty(toolModel, responseModel)
	if !util.IsResponsesImageToolModel(validationModel) {
		return ConversationRequest{}, "", HTTPError{Status: 400, Message: "unsupported image_generation model: " + validationModel}
	}
	requestModel := responseImageGenerationModel(responseModel, toolModel)
	outputFormat := NormalizeImageOutputFormat(firstNonEmpty(util.Clean(tool["output_format"]), util.Clean(body["output_format"])))
	request := ConversationRequest{
		Prompt:             prompt,
		Model:              requestModel,
		Messages:           messages,
		N:                  n,
		Size:               size,
		Quality:            firstNonEmpty(util.Clean(tool["quality"]), util.Clean(body["quality"])),
		OutputFormat:       outputFormat,
		ResponseFormat:     firstNonEmpty(util.Clean(tool["response_format"]), util.Clean(body["response_format"]), "b64_json"),
		OwnerID:            scope,
		OwnerName:          util.Clean(body["owner_name"]),
		Images:             images,
		RequirePaidAccount: RequiresPaidImageSize(size),
		ResponsesImageTool: responseImageGenerationUsesResponsesTool(responseModel, toolModel, requestModel),
	}
	if outputFormat != "png" {
		if compression, ok := normalizedImageOutputCompression(firstNonNil(tool["output_compression"], body["output_compression"])); ok {
			request.OutputCompression = &compression
		}
	}
	return request.Normalized(), prompt, nil
}

func responseImageGenerationModel(responseModel, toolModel string) string {
	responseModel = strings.TrimSpace(responseModel)
	toolModel = strings.TrimSpace(toolModel)
	model := firstNonEmpty(toolModel, responseModel)
	if model == util.ImageModelAuto {
		return util.ImageModelGPT
	}
	return model
}

func responseImageGenerationUsesResponsesTool(responseModel, toolModel, requestModel string) bool {
	requestModel = strings.TrimSpace(requestModel)
	// Grok always uses the dedicated proxy channel, never Responses tool.
	if util.IsGrokImageModel(requestModel) || util.IsGrokImageModel(responseModel) || util.IsGrokImageModel(toolModel) {
		return false
	}
	if strings.TrimSpace(toolModel) != "" {
		return !util.IsImageGenerationModel(requestModel)
	}
	return !util.IsImageGenerationModel(strings.TrimSpace(responseModel))
}

func (e *Engine) StreamTextResponse(ctx context.Context, body map[string]any) (<-chan map[string]any, <-chan error) {
	model := firstNonEmpty(util.Clean(body["model"]), "auto")
	messages := MessagesFromInput(body["input"], body["instructions"])
	return e.StreamTextResponseWithMessages(ctx, model, messages)
}

func (e *Engine) StreamTextResponseWithMessages(ctx context.Context, model string, messages []map[string]any) (<-chan map[string]any, <-chan error) {
	deltas, errCh := e.StreamTextDeltas(ctx, e.TextBackend(e.Accounts.GetTextAccessToken()), ConversationRequest{Model: model, Messages: messages})
	return streamTextResponseEvents(ctx, model, deltas, errCh)
}

func streamTextResponseEvents(ctx context.Context, model string, deltas <-chan string, upstreamErr <-chan error) (<-chan map[string]any, <-chan error) {
	out := make(chan map[string]any)
	errOut := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errOut)
		responseID := "resp_" + util.NewHex(32)
		itemID := "msg_" + util.NewHex(32)
		created := time.Now().Unix()
		full := ""
		send := func(item map[string]any) bool {
			select {
			case out <- item:
				return true
			case <-ctx.Done():
				errOut <- ctx.Err()
				return false
			}
		}
		if !send(ResponseCreated(responseID, model, created)) {
			return
		}
		if !send(map[string]any{"type": "response.output_item.added", "output_index": 0, "item": TextOutputItem("", itemID, "in_progress")}) {
			return
		}
		for delta := range deltas {
			full += delta
			if !send(map[string]any{"type": "response.output_text.delta", "item_id": itemID, "output_index": 0, "content_index": 0, "delta": delta}) {
				return
			}
		}
		if upstreamErr != nil {
			if err := <-upstreamErr; err != nil {
				errOut <- err
				return
			}
		}
		if !send(map[string]any{"type": "response.output_text.done", "item_id": itemID, "output_index": 0, "content_index": 0, "text": full}) {
			return
		}
		item := TextOutputItem(full, itemID, "completed")
		if !send(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": item}) {
			return
		}
		if !send(ResponseCompleted(responseID, model, created, []map[string]any{item})) {
			return
		}
		errOut <- nil
	}()
	return out, errOut
}

func combineErrorChannels(first, second <-chan error) <-chan error {
	out := make(chan error, 1)
	go func() {
		defer close(out)
		var firstErr error
		var secondErr error
		if first != nil {
			firstErr = <-first
		}
		if second != nil {
			secondErr = <-second
		}
		if firstErr != nil {
			out <- firstErr
			return
		}
		out <- secondErr
	}()
	return out
}

func StreamImageResponse(outputs <-chan ImageOutput, prompt, model string) (<-chan map[string]any, <-chan error) {
	out := make(chan map[string]any)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		responseID := "resp_" + util.NewHex(32)
		created := time.Now().Unix()
		out <- ResponseCreated(responseID, model, created)
		items := make([]map[string]any, 0, MaxImageCount)
		for output := range outputs {
			if output.Kind == "message" {
				item := TextOutputItem(output.Text, "", "completed")
				out <- map[string]any{"type": "response.output_text.delta", "item_id": item["id"], "output_index": 0, "content_index": 0, "delta": output.Text}
				out <- map[string]any{"type": "response.output_text.done", "item_id": item["id"], "output_index": 0, "content_index": 0, "text": output.Text}
				out <- map[string]any{"type": "response.output_item.done", "output_index": 0, "item": item}
				out <- ResponseCompleted(responseID, model, created, []map[string]any{item})
				errCh <- nil
				return
			}
			if output.Kind != "result" {
				continue
			}
			// Emit every generated image instead of only the first one: the caller
			// asked for n images and each already cost an upstream generation.
			for _, item := range ImageOutputItems(prompt, output.Data, "") {
				if len(items) >= MaxImageCount {
					break // keep draining the channel, but never grow without bound
				}
				index := len(items)
				// Item ids must be unique across the whole response, so they cannot
				// come from the per-output numbering inside ImageOutputItems.
				item["id"] = fmt.Sprintf("ig_%d", index+1)
				out <- map[string]any{"type": "response.output_item.added", "output_index": index, "item": item}
				out <- map[string]any{"type": "response.output_item.done", "output_index": index, "item": item}
				items = append(items, item)
			}
		}
		if len(items) == 0 {
			errCh <- fmt.Errorf("image generation failed")
			return
		}
		out <- ResponseCompleted(responseID, model, created, items)
		errCh <- nil
	}()
	return out, errCh
}

func ResponseCreated(id, model string, created int64) map[string]any {
	return map[string]any{"type": "response.created", "response": map[string]any{"id": id, "object": "response", "created_at": created, "status": "in_progress", "error": nil, "incomplete_details": nil, "model": model, "output": []any{}, "parallel_tool_calls": false}}
}

func ResponseCompleted(id, model string, created int64, output []map[string]any) map[string]any {
	return map[string]any{"type": "response.completed", "response": map[string]any{"id": id, "object": "response", "created_at": created, "status": "completed", "error": nil, "incomplete_details": nil, "model": model, "output": output, "parallel_tool_calls": false}}
}

func TextOutputItem(text, itemID, status string) map[string]any {
	if itemID == "" {
		itemID = "msg_" + util.NewHex(32)
	}
	return map[string]any{"id": itemID, "type": "message", "status": status, "role": "assistant", "content": []map[string]any{{"type": "output_text", "text": text, "annotations": []any{}}}}
}

func ImageOutputItems(prompt string, data []map[string]any, itemID string) []map[string]any {
	var out []map[string]any
	for _, item := range data {
		b64 := util.Clean(item["b64_json"])
		if b64 == "" {
			continue
		}
		id := itemID
		if id == "" {
			id = fmt.Sprintf("ig_%d", len(out)+1)
		}
		out = append(out, map[string]any{"id": id, "type": "image_generation_call", "status": "completed", "result": b64, "revised_prompt": firstNonEmpty(util.Clean(item["revised_prompt"]), prompt)})
	}
	return out
}
