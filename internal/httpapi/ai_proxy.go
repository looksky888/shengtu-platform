package httpapi

import (
	"context"
	"net/http"
	"strings"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const (
	imageProviderAccountPool = "account_pool"
	imageProviderProxyAPI    = "proxy_api"
	// imageProviderGrokNative is defined in grok_native.go (号池 + grok-runtime 侧车).
)

// resolveImageChannel picks the upstream channel for one generation request.
// Routing key is the request model (not the user):
//   - grok-*     -> grok-runtime sidecar (Grok 号池)
//   - everything else -> GPT path: account_pool or GPT proxy_api
func (a *App) resolveImageChannel(model string) string {
	if util.IsGrokImageModel(model) {
		return imageProviderGrokNative
	}
	return imageProviderAccountPool
}

func (a *App) listModelsWithChannels(ctx context.Context) (map[string]any, error) {
	// Always expose built-in model IDs (including Grok) and merge enabled
	// ImageChannelService models while filtering out disabled system image models.
	var result map[string]any
	if a != nil && a.engine != nil {
		var err error
		result, err = a.engine.ListModels(ctx)
		if err != nil {
			result = map[string]any{"object": "list", "data": []map[string]any{}}
		}
	}
	if result == nil {
		result = map[string]any{"object": "list", "data": []map[string]any{}}
	}
	if util.Clean(result["object"]) == "" {
		result["object"] = "list"
	}
	if a == nil || a.imageChannels == nil {
		return result, nil
	}

	publicModels := a.imageChannels.ListPublicModels()
	enabledUpstream := make(map[string]struct{}, len(publicModels))
	for _, pm := range publicModels {
		if id := strings.ToLower(strings.TrimSpace(pm.UpstreamModel)); id != "" {
			enabledUpstream[id] = struct{}{}
		}
	}

	configuredUpstream := make(map[string]struct{})
	grokChannelEnabled := false
	grokChannelPresent := false
	for _, ch := range a.imageChannels.ListAdmin() {
		if ch.ID == "local-grok-runtime" || ch.Type == service.ImageChannelTypeGrokRuntime {
			grokChannelPresent = true
			if ch.Enabled {
				grokChannelEnabled = true
			}
		}
		for _, m := range a.imageChannels.ListModels(ch.ID, true) {
			if id := strings.ToLower(strings.TrimSpace(m.UpstreamModel)); id != "" {
				configuredUpstream[id] = struct{}{}
			}
		}
	}
	grokRuntimeAvailable := a.config != nil && strings.TrimSpace(a.config.GrokRuntimeBaseURL()) != ""

	rawItems := util.AsMapSlice(result["data"])
	merged := make([]map[string]any, 0, len(rawItems)+len(publicModels)+1)
	seen := make(map[string]struct{}, len(rawItems)+len(publicModels)+1)

	for _, item := range rawItems {
		id := strings.TrimSpace(util.Clean(item["id"]))
		if id == "" {
			continue
		}
		key := strings.ToLower(id)
		if _, dup := seen[key]; dup {
			continue
		}
		if _, configured := configuredUpstream[key]; configured {
			if _, enabled := enabledUpstream[key]; !enabled {
				continue
			}
		}
		if grokChannelPresent && !grokChannelEnabled && util.IsGrokImageModel(id) {
			if _, enabled := enabledUpstream[key]; !enabled {
				continue
			}
		}
		seen[key] = struct{}{}
		merged = append(merged, item)
	}

	for _, pm := range publicModels {
		id := strings.TrimSpace(pm.UpstreamModel)
		if id == "" {
			continue
		}
		key := strings.ToLower(id)
		if _, dup := seen[key]; dup {
			continue
		}
		ownedBy := "chatgpt2api"
		switch pm.ChannelType {
		case service.ImageChannelTypeOpenAICompatible:
			ownedBy = firstNonEmpty(strings.TrimSpace(pm.ChannelName), "openai-compatible")
		case service.ImageChannelTypeGrokRuntime:
			ownedBy = "grok-runtime"
		}
		seen[key] = struct{}{}
		merged = append(merged, map[string]any{
			"id":         id,
			"object":     "model",
			"created":    0,
			"owned_by":   ownedBy,
			"permission": []any{},
			"root":       id,
			"parent":     nil,
		})
	}

	if grokChannelEnabled || (!grokChannelPresent && grokRuntimeAvailable) {
		const grokVideoModel = "grok-imagine-video"
		if _, dup := seen[grokVideoModel]; !dup {
			seen[grokVideoModel] = struct{}{}
			merged = append(merged, map[string]any{
				"id":         grokVideoModel,
				"object":     "model",
				"created":    0,
				"owned_by":   "grok-runtime",
				"permission": []any{},
				"root":       grokVideoModel,
				"parent":     nil,
			})
		}
	}

	result["data"] = merged
	return result, nil
}

func (a *App) runImageGenerationTask(ctx context.Context, payload map[string]any) (map[string]any, error) {
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	result, _, err := a.handleImageGenerationsWithChannel(ctx, payload, model)
	return result, err
}

func (a *App) runImageEditTask(ctx context.Context, payload map[string]any) (map[string]any, error) {
	images := normalizeTaskImages(payload["images"])
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	result, _, err := a.handleImageEditsWithChannel(ctx, payload, images, model)
	return result, err
}

func (a *App) handleImageGenerationsWithChannel(ctx context.Context, body map[string]any, model string) (map[string]any, *protocol.StreamResult, error) {
	channel := a.resolveImageChannelForTask(body, model)
	switch channel {
	case imageProviderGrokNative:
		result, err := a.runGrokNativeImageGeneration(ctx, body, nil)
		return result, nil, err
	case imageProviderProxyAPI:
		result, err := a.runProxyImageGeneration(ctx, body, nil, imageProviderProxyAPI)
		return result, nil, err
	default:
		// Guard: Grok must never fall into ChatGPT account pool.
		if util.IsGrokImageModel(model) {
			return map[string]any{"data": []any{}}, nil, &protocol.ImageGenerationError{
				Message:    "Grok 生图未配置：请部署 grok-runtime 并配置 GROK_RUNTIME_BASE_URL（通过 Grok 号池生图）",
				StatusCode: http.StatusBadRequest,
				Type:       "invalid_request_error",
				Code:       "grok_not_configured",
			}
		}
		return a.engine.HandleImageGenerations(ctx, body)
	}
}

func (a *App) handleImageEditsWithChannel(ctx context.Context, body map[string]any, images []protocol.UploadedImage, model string) (map[string]any, *protocol.StreamResult, error) {
	channel := a.resolveImageChannelForTask(body, model)
	switch channel {
	case imageProviderGrokNative:
		result, err := a.runGrokNativeImageGeneration(ctx, body, images)
		return result, nil, err
	case imageProviderProxyAPI:
		result, err := a.runProxyImageGeneration(ctx, body, images, imageProviderProxyAPI)
		return result, nil, err
	default:
		if util.IsGrokImageModel(model) {
			return map[string]any{"data": []any{}}, nil, &protocol.ImageGenerationError{
				Message:    "Grok 生图未配置：请部署 grok-runtime 并配置 GROK_RUNTIME_BASE_URL（通过 Grok 号池生图）",
				StatusCode: http.StatusBadRequest,
				Type:       "invalid_request_error",
				Code:       "grok_not_configured",
			}
		}
		return a.engine.HandleImageEdits(ctx, body, images)
	}
}

// handleChatImageWithChannel routes image-mode chat completions the same way as /v1/images/*.
// Grok / GPT proxy never fall into ChatGPT account pool.
func (a *App) handleChatImageWithChannel(ctx context.Context, body map[string]any, model string) (map[string]any, *protocol.StreamResult, error) {
	channel := a.resolveImageChannelForTask(body, model)
	switch channel {
	case imageProviderGrokNative:
		return a.chatImageViaGrokNative(ctx, body)
	case imageProviderProxyAPI:
		return a.chatImageViaProxy(ctx, body, channel)
	default:
		if util.IsGrokImageModel(model) {
			return map[string]any{}, nil, &protocol.ImageGenerationError{
				Message:    "Grok 生图未配置：请部署 grok-runtime 并配置 GROK_RUNTIME_BASE_URL（通过 Grok 号池生图）",
				StatusCode: http.StatusBadRequest,
				Type:       "invalid_request_error",
				Code:       "grok_not_configured",
			}
		}
		if util.ToBool(body["stream"]) {
			items, errCh := a.engine.ImageChatEvents(ctx, body)
			return nil, &protocol.StreamResult{Items: items, Err: errCh, Kind: "openai"}, nil
		}
		return a.engine.ImageChatResponse(ctx, body)
	}
}

func (a *App) chatImageViaGrokNative(ctx context.Context, body map[string]any) (map[string]any, *protocol.StreamResult, error) {
	return chatImageViaExecutor(ctx, body, a.runGrokNativeImageGeneration)
}

func (a *App) chatImageViaProxy(ctx context.Context, body map[string]any, channel string) (map[string]any, *protocol.StreamResult, error) {
	return chatImageViaExecutor(ctx, body, func(ctx context.Context, payload map[string]any, images []protocol.UploadedImage) (map[string]any, error) {
		return a.runProxyImageGeneration(ctx, payload, images, channel)
	})
}

func chatImageViaExecutor(
	ctx context.Context,
	body map[string]any,
	runImage func(ctx context.Context, payload map[string]any, images []protocol.UploadedImage) (map[string]any, error),
) (map[string]any, *protocol.StreamResult, error) {
	model, prompt, n, images, _, err := protocol.ChatImageArgs(body)
	if err != nil {
		return nil, nil, err
	}
	payload := util.CopyMap(body)
	payload["model"] = model
	payload["prompt"] = prompt
	payload["n"] = n
	if util.Clean(payload["response_format"]) == "" {
		payload["response_format"] = "url"
	}
	result, err := runImage(ctx, payload, images)
	if err != nil {
		if result == nil {
			result = map[string]any{"data": []any{}}
		}
		return result, nil, err
	}
	content := protocol.ImageResultContent(result)
	created := int64(util.ToInt(result["created"], 0))
	completion := protocol.CompletionResponse(model, content, created, nil)
	if !util.ToBool(body["stream"]) {
		return completion, nil, nil
	}
	return emitCompletionAsStream(ctx, model, content, created, completion)
}

func emitCompletionAsStream(ctx context.Context, model, content string, created int64, completion map[string]any) (map[string]any, *protocol.StreamResult, error) {
	items := make(chan map[string]any, 2)
	errCh := make(chan error, 1)
	go func() {
		defer close(items)
		defer close(errCh)
		id := firstNonEmpty(util.Clean(completion["id"]), "chatcmpl-"+util.NewHex(32))
		if created == 0 {
			created = int64(util.ToInt(completion["created"], 0))
		}
		select {
		case items <- protocol.CompletionChunk(model, map[string]any{"role": "assistant", "content": content}, nil, id, created):
		case <-ctx.Done():
			errCh <- ctx.Err()
			return
		}
		select {
		case items <- protocol.CompletionChunk(model, map[string]any{}, "stop", id, created):
		case <-ctx.Done():
			errCh <- ctx.Err()
			return
		}
		errCh <- nil
	}()
	return nil, &protocol.StreamResult{Items: items, Err: errCh, Kind: "openai"}, nil
}
