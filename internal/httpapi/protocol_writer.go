package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) writeProtocol(w http.ResponseWriter, r *http.Request, result map[string]any, stream *protocol.StreamResult, err error, sseKind, endpoint, model string, identity service.Identity, summary, visibility string, charge *imageCreditCharge) {
	start := time.Now()
	if err != nil {
		a.refundImageCredits(charge)
		a.logCall(identity, summary, r.Method, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), nil)
		a.writeProtocolError(w, err)
		return
	}
	if stream == nil {
		urls := dedupe(collectURLs(result))
		delivered := countDeliveredProtocolImages(result, urls, chargeMaxN(charge))
		if charge != nil && delivered == 0 {
			a.refundImageCredits(charge)
			message := firstNonEmpty(util.Clean(result["message"]), "图片生成未返回有效数据")
			a.logCall(identity, summary, r.Method, endpoint, model, start, "failed", http.StatusBadGateway, message, urls)
			util.WriteError(w, http.StatusBadGateway, message)
			return
		}
		if charge != nil {
			a.refundImageCreditsForSuccess(charge, delivered)
		}
		a.recordGeneratedImages(identity, urls, visibility)
		a.logCall(identity, summary, r.Method, endpoint, model, start, "success", http.StatusOK, "", urls)
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	flusher, _ := w.(http.Flusher)
	if stream.Kind == "anthropic" || sseKind == "anthropic" {
		var urls []string
		inlineImages := inlineImageCounter{}
		hasImageData := charge == nil
		for item := range stream.Items {
			inlineImages.observe(item)
			if len(util.AsMapSlice(item["data"])) > 0 {
				hasImageData = true
			}
			urls = append(urls, collectURLs(item)...)
			event := firstNonEmpty(util.Clean(item["type"]), "message_delta")
			fmt.Fprintf(w, "event: %s\n", event)
			fmt.Fprintf(w, "data: %s\n\n", jsonString(item))
			if flusher != nil {
				flusher.Flush()
			}
		}
		urls = dedupe(urls)
		if err := <-stream.Err; err != nil {
			// Partial success: only refund images that never arrived.
			a.refundImageCreditsForSuccess(charge, inlineImages.count(urls, hasImageData, chargeMaxN(charge)))
			a.recordGeneratedImages(identity, urls, visibility)
			a.logCall(identity, summary, r.Method, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), urls)
			fmt.Fprint(w, "event: error\n")
			fmt.Fprintf(w, "data: %s\n\n", jsonString(map[string]any{"type": "error", "error": map[string]any{"type": fmt.Sprintf("%T", err), "message": err.Error()}}))
			return
		}
		if charge != nil && !inlineImages.hasAny(urls, hasImageData) {
			a.refundImageCredits(charge)
			message := "image generation stream returned no image data"
			a.logCall(identity, summary, r.Method, endpoint, model, start, "failed", http.StatusBadGateway, message, urls)
			fmt.Fprint(w, "event: error\n")
			fmt.Fprintf(w, "data: %s\n\n", jsonString(map[string]any{"type": "error", "error": map[string]any{"type": "server_error", "message": message}}))
			return
		}
		a.refundImageCreditsForSuccess(charge, inlineImages.count(urls, hasImageData, chargeMaxN(charge)))
		a.recordGeneratedImages(identity, urls, visibility)
		a.logCall(identity, summary, r.Method, endpoint, model, start, "success", http.StatusOK, "", urls)
		return
	}
	fmt.Fprint(w, ": stream-open\n\n")
	if flusher != nil {
		flusher.Flush()
	}
	var urls []string
	inlineImages := inlineImageCounter{}
	hasImageData := charge == nil
	for item := range stream.Items {
		inlineImages.observe(item)
		if len(util.AsMapSlice(item["data"])) > 0 {
			hasImageData = true
		}
		urls = append(urls, collectURLs(item)...)
		fmt.Fprintf(w, "data: %s\n\n", jsonString(item))
		if flusher != nil {
			flusher.Flush()
		}
	}
	urls = dedupe(urls)
	if err := <-stream.Err; err != nil {
		a.refundImageCreditsForSuccess(charge, inlineImages.count(urls, hasImageData, chargeMaxN(charge)))
		a.recordGeneratedImages(identity, urls, visibility)
		a.logCall(identity, summary, r.Method, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), urls)
		fmt.Fprintf(w, "data: %s\n\n", jsonString(openAIErrorForStream(err)))
	} else {
		if charge != nil && !inlineImages.hasAny(urls, hasImageData) {
			a.refundImageCredits(charge)
			message := "image generation stream returned no image data"
			a.logCall(identity, summary, r.Method, endpoint, model, start, "failed", http.StatusBadGateway, message, urls)
			fmt.Fprintf(w, "data: %s\n\n", jsonString(map[string]any{"error": map[string]any{"message": message, "type": "server_error", "code": "image_generation_empty_stream"}}))
			fmt.Fprint(w, "data: [DONE]\n\n")
			return
		}
		a.refundImageCreditsForSuccess(charge, inlineImages.count(urls, hasImageData, chargeMaxN(charge)))
		a.recordGeneratedImages(identity, urls, visibility)
		a.logCall(identity, summary, r.Method, endpoint, model, start, "success", http.StatusOK, "", urls)
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
}

// countStreamImageResults estimates delivered images for partial credit refunds.
// Uses distinct URLs (stream chunks often re-emit the same URL), clamped to billed maxN.
// Falls back to 1 when the stream marked image data without extractable URLs.
func countStreamImageResults(urls []string, hasImageData bool, maxN int) int {
	unique := len(dedupe(urls))
	if unique > 0 {
		if maxN > 0 && unique > maxN {
			return maxN
		}
		return unique
	}
	if hasImageData {
		return 1
	}
	return 0
}

func chargeMaxN(charge *imageCreditCharge) int {
	if charge == nil {
		return 0
	}
	if charge.N < 1 {
		return 1
	}
	return charge.N
}

func protocolErrorHTTPStatus(err error) int {
	var httpErr protocol.HTTPError
	if errors.As(err, &httpErr) {
		return httpErr.Status
	}
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		return imageErr.StatusCode
	}
	message := strings.ToLower(err.Error())
	if strings.Contains(message, "no available image account slot") || strings.Contains(message, "no available image quota") {
		return http.StatusTooManyRequests
	}
	return http.StatusBadGateway
}

func (a *App) writeProtocolError(w http.ResponseWriter, err error) {
	var httpErr protocol.HTTPError
	if errors.As(err, &httpErr) {
		util.WriteError(w, httpErr.Status, httpErr.Message)
		return
	}
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) {
		util.WriteJSON(w, imageErr.StatusCode, imageErr.OpenAIError())
		return
	}
	message := err.Error()
	lower := strings.ToLower(message)
	if strings.Contains(lower, "no available image account slot") {
		util.WriteJSON(w, http.StatusTooManyRequests, map[string]any{"error": map[string]any{"message": "账号池并发槽已满，请稍后重试", "type": "rate_limit_error", "param": nil, "code": "account_pool_slot_busy"}})
		return
	}
	if strings.Contains(lower, "no available image quota") {
		util.WriteJSON(w, http.StatusTooManyRequests, map[string]any{"error": map[string]any{"message": "当前没有可用图片额度", "type": "insufficient_quota", "param": nil, "code": "insufficient_quota"}})
		return
	}
	// Prefer classified Chinese messages for async/sync image failures.
	friendly := service.FriendlyImageTaskErrorForHTTP(err)
	util.WriteJSON(w, http.StatusBadGateway, map[string]any{"detail": map[string]any{"error": friendly}})
}
