package httpapi

import (
	"context"
	"net/http"

	"chatgpt2api/internal/protocol"
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
	// Always expose built-in model IDs (including Grok). GPT proxy mode used to
	// replace the entire list with only the GPT relay models, which would hide Grok.
	result, err := a.engine.ListModels(ctx)
	if err != nil {
		// Surface failure instead of a silent empty catalog (hard to debug).
		return nil, err
	}
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
	result, err := a.runGrokNativeImageGeneration(ctx, payload, images)
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
	// Reuse proxy stream shaping via temporary channel call path: non-stream for native first release.
	_ = created
	return completion, nil, nil
}

func (a *App) chatImageViaProxy(ctx context.Context, body map[string]any, channel string) (map[string]any, *protocol.StreamResult, error) {
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
	result, err := a.runProxyImageGeneration(ctx, payload, images, channel)
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
	// Proxy backends are request/response; emit a short OpenAI-compatible chat stream.
	items := make(chan map[string]any, 2)
	errCh := make(chan error, 1)
	go func() {
		defer close(items)
		defer close(errCh)
		id := "chatcmpl-" + util.NewHex(32)
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
