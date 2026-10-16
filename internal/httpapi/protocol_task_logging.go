package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) runLoggedImageTask(ctx context.Context, identity service.Identity, payload map[string]any, endpoint, summary string, run func(context.Context, map[string]any) (map[string]any, error)) (map[string]any, error) {
	start := time.Now()
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	charge, billingErr := a.deductImageCredits(identity, payload, imageCreditReasonForEndpoint(endpoint), endpoint)
	if billingErr != nil {
		msg := creditBillingMessage(billingErr)
		a.logCall(identity, summary, http.MethodPost, endpoint, model, start, "failed", creditBillingHTTPStatus(billingErr), msg, nil)
		return map[string]any{"data": []any{}, "message": msg}, billingErr
	}
	defer func() {
		if value := recover(); value != nil {
			a.refundImageCredits(charge)
			panic(value)
		}
	}()
	result, err := run(ctx, payload)
	urls := collectURLs(result)
	dataCount := len(util.AsMapSlice(result["data"]))
	a.recordGeneratedImagesForPayload(identity, urls, util.Clean(payload["visibility"]), payload)
	if err != nil {
		success := dataCount
		if success == 0 {
			success = len(urls)
		}
		a.refundImageCreditsForSuccess(charge, success)
		msg := service.FriendlyImageTaskErrorForHTTP(err)
		a.logCall(identity, summary, http.MethodPost, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), msg, urls)
		return result, err
	}
	if dataCount == 0 {
		a.refundImageCredits(charge)
		message := firstNonEmpty(util.Clean(result["message"]), "图片任务未返回有效数据")
		a.logCall(identity, summary, http.MethodPost, endpoint, model, start, "failed", http.StatusBadGateway, message, urls)
		return result, nil
	}
	// A successful HTTP response may still contain fewer images than requested.
	// Refund the missing portion even when the upstream returned no error.
	a.refundImageCreditsForSuccess(charge, dataCount)
	a.logCall(identity, summary, http.MethodPost, endpoint, model, start, "success", http.StatusOK, "", urls)
	return result, nil
}

func (a *App) runLoggedChatTask(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
	start := time.Now()
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	payload["stream"] = false
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	summary := "文本生成"
	var result map[string]any
	var err error
	// Studio chat uses creation-tasks, not /v1/chat/completions. Grok must never
	// fall into ChatGPT backend-anon (causes 403 "Unusual activity" on free tokens).
	if util.IsGrokChatModel(model) {
		summary = "Grok 对话"
		result, err = a.runGrokNativeChatCompletion(ctx, payload)
	} else {
		var stream *protocol.StreamResult
		result, stream, err = a.engine.HandleChatCompletions(ctx, payload)
		if stream != nil {
			err = errors.New("创作任务不支持流式文本输出")
		}
	}
	if err != nil {
		a.logCall(identity, summary, http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), nil)
		return result, err
	}
	text := chatCompletionResultText(result)
	if text == "" {
		err = errors.New("模型没有返回文本内容")
		a.logCall(identity, summary, http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "failed", http.StatusBadGateway, err.Error(), nil)
		return result, err
	}
	a.logCall(identity, summary, http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "success", http.StatusOK, "", nil)
	return map[string]any{
		"created":     result["created"],
		"output_type": "text",
		"data":        []map[string]any{{"text_response": text}},
	}, nil
}

func chatCompletionResultText(result map[string]any) string {
	for _, choice := range util.AsMapSlice(result["choices"]) {
		message := util.StringMap(choice["message"])
		if text := chatCompletionContentText(message["content"]); text != "" {
			return text
		}
	}
	return ""
}

func chatCompletionContentText(content any) string {
	if text, ok := content.(string); ok {
		return strings.TrimSpace(text)
	}
	var parts []string
	for _, item := range anyList(content) {
		block := util.StringMap(item)
		if text := util.Clean(block["text"]); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}
