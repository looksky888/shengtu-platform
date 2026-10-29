package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func sanitizeClientImageRouteMetadata(body map[string]any) {
	for _, key := range []string{
		"image_credit_cost", "effective_provider", "effective_channel", "provider_source",
		"effective_model", "upstream_host", "channel_id", "channel_name", "channel_base_url",
		"channel_api_key", "channel_timeout_seconds", "channel_max_retries",
		"channel_max_concurrency", "channel_download_urls",
	} {
		delete(body, key)
	}
}

func applyImageRouteMetadataToBody(body, metadata map[string]any) {
	if len(metadata) == 0 {
		return
	}
	if preset := service.NormalizeImageResolutionPreset(util.Clean(metadata["image_resolution"])); preset != "" {
		body["image_resolution"] = preset
	}
	if requestedSize := strings.TrimSpace(util.Clean(metadata["requested_size"])); requestedSize != "" {
		body["requested_size"] = requestedSize
	}
	for _, key := range []string{
		"effective_provider", "effective_channel", "provider_source",
		"effective_model", "upstream_host", "channel_model_id", "channel_id", "channel_name",
		"channel_base_url", "channel_api_key",
	} {
		if value := strings.TrimSpace(util.Clean(metadata[key])); value != "" {
			body[key] = value
		}
	}
	for _, key := range []string{"image_credit_cost", "channel_timeout_seconds", "channel_max_retries", "channel_max_concurrency"} {
		if value := util.ToInt(metadata[key], 0); value > 0 || key == "channel_max_retries" {
			body[key] = value
		}
	}
	if value, ok := metadata["channel_download_urls"]; ok {
		body["channel_download_urls"] = util.ToBool(value)
	}
}

func (a *App) handleModels(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	result, err := a.listModelsWithChannels(r.Context())
	a.writeProtocol(w, r, result, nil, err, "openai", "/v1/models", "models", identity, "模型列表", service.ImageVisibilityPrivate, nil)
}

func (a *App) handleImageGenerations(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	sanitizeClientImageRouteMetadata(body)
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	body["base_url"] = a.resolveImageBaseURL(r)
	visibility, err := service.NormalizeImageVisibility(util.Clean(body["visibility"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, mapImageAPIError(err))
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	metadata, err := a.imageTaskRequestMetadata(body, model, service.ImageCapabilityGenerate)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	applyImageRouteMetadataToBody(body, metadata)
	charge, err := a.deductImageCredits(identity, body, service.CreditReasonImageGeneration, "/v1/images/generations")
	if err != nil {
		a.writeCreditBillingError(w, err)
		return
	}
	defer func() {
		if value := recover(); value != nil {
			a.refundImageCredits(charge)
			panic(value)
		}
	}()
	result, stream, err := a.handleImageGenerationsWithChannel(r.Context(), body, model)
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/images/generations", model, identity, "文生图", visibility, charge)
}

func (a *App) handleImageEdits(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, images, err := readMultipartImageBody(w, r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if n := util.ToInt(body["n"], 1); n < 1 || n > 4 {
		util.WriteError(w, http.StatusBadRequest, "生成数量 n 须在 1–4 之间")
		return
	}
	if len(images) == 0 {
		util.WriteError(w, http.StatusBadRequest, "请上传图片文件")
		return
	}
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	body["base_url"] = a.resolveImageBaseURL(r)
	visibility, err := service.NormalizeImageVisibility(util.Clean(body["visibility"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, mapImageAPIError(err))
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	metadata, err := a.imageTaskRequestMetadata(body, model, service.ImageCapabilityEdit)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	applyImageRouteMetadataToBody(body, metadata)
	charge, err := a.deductImageCredits(identity, body, service.CreditReasonImageEdit, "/v1/images/edits")
	if err != nil {
		a.writeCreditBillingError(w, err)
		return
	}
	defer func() {
		if value := recover(); value != nil {
			a.refundImageCredits(charge)
			panic(value)
		}
	}()
	result, stream, err := a.handleImageEditsWithChannel(r.Context(), body, images, model)
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/images/edits", model, identity, "图生图", visibility, charge)
}

func (a *App) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	sanitizeClientImageRouteMetadata(body)
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	body["base_url"] = a.resolveImageBaseURL(r)
	model := firstNonEmpty(util.Clean(body["model"]), "auto")
	summary := "文本生成"
	var charge *imageCreditCharge
	defer func() {
		if value := recover(); value != nil {
			a.refundImageCredits(charge)
			panic(value)
		}
	}()
	var result map[string]any
	var stream *protocol.StreamResult
	if protocol.IsImageChatRequest(body) {
		summary = "文生图"
		metadata, sizeErr := a.imageTaskRequestMetadata(body, model, service.ImageCapabilityGenerate)
		if sizeErr != nil {
			util.WriteError(w, http.StatusBadRequest, sizeErr.Error())
			return
		}
		applyImageRouteMetadataToBody(body, metadata)
		if c, billingErr := a.deductImageCredits(identity, body, service.CreditReasonImageGeneration, "/v1/chat/completions"); billingErr != nil {
			a.writeCreditBillingError(w, billingErr)
			return
		} else {
			charge = c
		}
		result, stream, err = a.handleChatImageWithChannel(r.Context(), body, model)
	} else if util.IsGrokChatModel(model) {
		summary = "Grok 对话"
		if util.ToBool(body["stream"]) {
			body["stream"] = false
		}
		result, err = a.runGrokNativeChatCompletion(r.Context(), body)
	} else {
		result, stream, err = a.engine.HandleChatCompletions(r.Context(), body)
	}
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/chat/completions", model, identity, summary, service.ImageVisibilityPrivate, charge)
}

func (a *App) handleResponses(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	sanitizeClientImageRouteMetadata(body)
	body["owner_id"] = identityScope(identity)
	body["owner_name"] = identityDisplayName(identity)
	body["base_url"] = a.resolveImageBaseURL(r)
	model := firstNonEmpty(util.Clean(body["model"]), "auto")
	summary := "Responses"
	var charge *imageCreditCharge
	defer func() {
		if value := recover(); value != nil {
			a.refundImageCredits(charge)
			panic(value)
		}
	}()
	if protocol.HasResponseImageGenerationTool(body) {
		summary = "文生图"
		c, billingErr := a.deductImageCredits(identity, body, service.CreditReasonImageGeneration, "/v1/responses")
		if billingErr != nil {
			a.writeCreditBillingError(w, billingErr)
			return
		}
		charge = c
	}
	result, stream, err := a.engine.HandleResponsesScoped(r.Context(), body, identityScope(identity))
	a.writeProtocol(w, r, result, stream, err, "openai", "/v1/responses", model, identity, summary, service.ImageVisibilityPrivate, charge)
}

func (a *App) handleMessages(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" && r.Header.Get("x-api-key") != "" {
		authHeader = "Bearer " + r.Header.Get("x-api-key")
	}
	identity, ok := a.requireIdentity(w, r, authHeader)
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), "auto")
	result, stream, err := a.engine.HandleMessages(r.Context(), body)
	a.writeProtocol(w, r, result, stream, err, "anthropic", "/v1/messages", model, identity, "Messages", service.ImageVisibilityPrivate, nil)
}
