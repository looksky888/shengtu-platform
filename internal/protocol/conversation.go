package protocol

import (
	"context"
	"encoding/json"
	"strings"
	"sync"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type Engine struct {
	Accounts *service.AccountService
	Config   ImageConfig
	Storage  storage.JSONDocumentBackend
	Proxy    *service.ProxyService
	Logger   *service.Logger
	Media    *service.MediaLibrary

	ListModelsFunc func(context.Context) (map[string]any, error)

	responseContextMu sync.Mutex
	ResponseContexts  *ResponseContextStore
}
type ConversationState struct {
	Text           string
	ConversationID string
	FileIDs        []string
	SedimentIDs    []string
	Blocked        bool
	ToolInvoked    *bool
	TurnUseCase    string
}

type ConversationEvent map[string]any

type ImageOutput struct {
	Kind              string
	Model             string
	Index             int
	Total             int
	Created           int64
	Text              string
	UpstreamEventType string
	Data              []map[string]any
}

type ImageGenerationError struct {
	Message            string
	StatusCode         int
	Type               string
	Code               string
	Param              any
	UpstreamHost       string
	UpstreamHTTPStatus int
	UpstreamRequestID  string
	UpstreamCFRay      string
	RetryIndex         int
	AttemptCount       int
}

func (e *ImageGenerationError) Error() string { return e.Message }

func (e *ImageGenerationError) ImageTaskErrorCode() string {
	if e == nil {
		return ""
	}
	return e.Code
}

// ImageTaskUpstreamMetadata exposes non-secret request evidence to the task
// service without coupling service persistence to protocol error types.
func (e *ImageGenerationError) ImageTaskUpstreamMetadata() service.ImageTaskUpstreamMetadata {
	if e == nil {
		return service.ImageTaskUpstreamMetadata{}
	}
	return service.ImageTaskUpstreamMetadata{
		UpstreamHost: e.UpstreamHost, HTTPStatus: e.UpstreamHTTPStatus,
		RequestID: e.UpstreamRequestID, CFRay: e.UpstreamCFRay,
		RetryIndex: e.RetryIndex, AttemptCount: e.AttemptCount,
	}
}

func (e *ImageGenerationError) OpenAIError() map[string]any {
	return map[string]any{"error": map[string]any{"message": e.Message, "type": e.Type, "param": e.Param, "code": e.Code}}
}

func NewImageGenerationError(message string) *ImageGenerationError {
	return &ImageGenerationError{Message: message, StatusCode: 502, Type: "server_error", Code: "upstream_error"}
}
func (e *Engine) TextBackend(accessToken string) *backend.Client {
	return backend.NewClient(accessToken, e.Accounts, e.Proxy).SetLogger(e.Logger)
}

func (e *Engine) ListModels(ctx context.Context) (map[string]any, error) {
	result, err := e.listModels(ctx)
	if err != nil {
		return nil, err
	}
	data := util.AsMapSlice(result["data"])
	seen := map[string]struct{}{}
	for _, item := range data {
		if id := util.Clean(item["id"]); id != "" {
			seen[strings.ToLower(id)] = struct{}{}
		}
	}
	advertiseWebImages := e != nil && e.Accounts != nil && len(e.Accounts.ListAccounts()) > 0
	for _, model := range util.ModelList() {
		if isWebImageCatalogModel(model) && !advertiseWebImages {
			continue
		}
		key := strings.ToLower(model)
		if _, ok := seen[key]; !ok {
			data = append(data, map[string]any{"id": model, "object": "model", "created": 0, "owned_by": "chatgpt2api", "permission": []any{}, "root": model, "parent": nil})
			seen[key] = struct{}{}
		}
	}
	result["data"] = data
	return result, nil
}

func isWebImageCatalogModel(model string) bool {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case util.ImageModelGPT, util.ImageModelGPT25, util.ImageModelGPT25Flare, util.ImageModelGPT25Sunburst:
		return true
	default:
		return false
	}
}

func (e *Engine) listModels(ctx context.Context) (map[string]any, error) {
	if e != nil && e.ListModelsFunc != nil {
		return e.ListModelsFunc(ctx)
	}
	return backend.NewClient("", e.Accounts, e.Proxy).SetLogger(e.Logger).ListModels(ctx)
}

func (e *Engine) StreamTextDeltas(ctx context.Context, client *backend.Client, request ConversationRequest) (<-chan string, <-chan error) {
	out := make(chan string)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		events, convErr := e.ConversationEvents(ctx, client, request.Messages, request.Model, request.Prompt, nil, "", "")
		for event := range events {
			if event["type"] != "conversation.delta" {
				continue
			}
			delta := util.Clean(event["delta"])
			if delta == "" {
				continue
			}
			select {
			case out <- delta:
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			}
		}
		if err := <-convErr; err != nil {
			errCh <- err
			return
		}
		errCh <- nil
	}()
	return out, errCh
}

func (e *Engine) CollectText(ctx context.Context, client *backend.Client, request ConversationRequest) (string, error) {
	deltas, errCh := e.StreamTextDeltas(ctx, client, request)
	var parts []string
	for delta := range deltas {
		parts = append(parts, delta)
	}
	return strings.Join(parts, ""), <-errCh
}

func (e *Engine) ConversationEvents(ctx context.Context, client *backend.Client, messages []map[string]any, model, prompt string, images []string, size, quality string, forceImageToolValues ...bool) (<-chan ConversationEvent, <-chan error) {
	return e.conversationEvents(ctx, client, messages, model, "", prompt, images, size, quality, forceImageToolValues...)
}

func (e *Engine) ConversationEventsWithUpstreamModel(ctx context.Context, client *backend.Client, messages []map[string]any, model, upstreamModel, prompt string, images []string, size, quality string, forceImageToolValues ...bool) (<-chan ConversationEvent, <-chan error) {
	return e.conversationEvents(ctx, client, messages, model, upstreamModel, prompt, images, size, quality, forceImageToolValues...)
}

func (e *Engine) conversationEvents(ctx context.Context, client *backend.Client, messages []map[string]any, model, upstreamModel, prompt string, images []string, size, quality string, forceImageToolValues ...bool) (<-chan ConversationEvent, <-chan error) {
	out := make(chan ConversationEvent)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		normalized := NormalizeMessages(messages, nil)
		if len(normalized) == 0 && prompt != "" {
			normalized = []map[string]any{{"role": "user", "content": prompt}}
		}
		forceImageTool := len(forceImageToolValues) > 0 && forceImageToolValues[0]
		imageModel := forceImageTool || util.IsImageModel(model) || (prompt != "" && util.IsImageGenerationModel(model))
		historyText := ""
		historyMessages := []string{}
		finalPrompt := prompt
		systemHints := []string{}
		streamImages := []string(nil)
		if imageModel {
			finalPrompt = BuildImageRequestPrompt(normalized, prompt, images, size, quality)
			systemHints = []string{"picture_v2"}
			streamImages = images
		} else {
			historyText = AssistantHistoryText(normalized)
			historyMessages = AssistantHistoryMessages(normalized)
		}
		streamModel := firstNonEmpty(strings.TrimSpace(upstreamModel), model)
		payloads, upstreamErr := client.StreamConversation(ctx, normalized, streamModel, finalPrompt, streamImages, systemHints)
		iterErr := IterConversationPayloads(ctx, payloads, historyText, historyMessages, out)
		upErr := <-upstreamErr
		if iterErr != nil {
			errCh <- iterErr
			return
		}
		errCh <- upErr
	}()
	return out, errCh
}

func IterConversationPayloads(ctx context.Context, payloads <-chan string, historyText string, historyMessages []string, out chan<- ConversationEvent) error {
	state := &ConversationState{}
	historyIndex := 0
	for payload := range payloads {
		if payload == "" {
			continue
		}
		if payload == "[DONE]" {
			event := conversationBaseEvent("conversation.done", state)
			event["done"] = true
			select {
			case out <- event:
			case <-ctx.Done():
				return ctx.Err()
			}
			break
		}
		var raw any
		if err := json.Unmarshal([]byte(payload), &raw); err != nil {
			UpdateConversationState(state, payload, nil)
			event := conversationBaseEvent("conversation.raw", state)
			event["payload"] = payload
			out <- event
			continue
		}
		eventMap, ok := raw.(map[string]any)
		if !ok {
			event := conversationBaseEvent("conversation.event", state)
			event["raw"] = raw
			out <- event
			continue
		}
		UpdateConversationState(state, payload, eventMap)
		if historyIndex < len(historyMessages) && EventAssistantText(eventMap, historyText) == historyMessages[historyIndex] {
			historyIndex++
			state.Text = ""
			continue
		}
		nextText := AssistantText(eventMap, state.Text, historyText)
		if nextText != state.Text {
			delta := nextText
			if strings.HasPrefix(nextText, state.Text) {
				delta = nextText[len(state.Text):]
			}
			state.Text = nextText
			event := conversationBaseEvent("conversation.delta", state)
			event["raw"] = eventMap
			event["delta"] = delta
			out <- event
			continue
		}
		event := conversationBaseEvent("conversation.event", state)
		event["raw"] = eventMap
		out <- event
	}
	return nil
}
