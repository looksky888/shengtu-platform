package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const imageProviderGrokNative = "grok_native"

// streamGrokNativeChatCompletion streams SSE chunks from grok-runtime OpenAI-compatible chat completions.
// Falls back to wrapping a JSON completion as an SSE stream when a mock or non-SSE upstream returns JSON.
func (a *App) streamGrokNativeChatCompletion(ctx context.Context, body map[string]any) (*protocol.StreamResult, error) {
	if a.config == nil {
		return nil, fmt.Errorf("config unavailable")
	}
	base := strings.TrimRight(a.config.GrokRuntimeBaseURL(), "/")
	token := a.config.InternalServiceToken()
	if base == "" {
		return nil, &protocol.ImageGenerationError{
			Message:    "GROK_RUNTIME_BASE_URL 未配置，无法调用 Grok 对话",
			StatusCode: http.StatusBadRequest,
			Type:       "invalid_request_error",
			Code:       "grok_native_not_configured",
		}
	}
	payload := util.CopyMap(body)
	payload["stream"] = true
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/internal/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream, application/json")
	if token != "" {
		req.Header.Set("X-Internal-Token", token)
	}
	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &protocol.ImageGenerationError{
			Message:    "Grok 运行时不可用: " + err.Error(),
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "grok_native_unreachable",
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		data, _ := util.ReadAllLimited(resp.Body, 8<<20)
		msg, errorType, code, _ := grokRuntimeErrorDetails(data, resp.StatusCode)
		statusCode := http.StatusBadGateway
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			statusCode = resp.StatusCode
		}
		return nil, &protocol.ImageGenerationError{
			Message:            msg,
			StatusCode:         statusCode,
			Type:               errorType,
			Code:               code,
			UpstreamHost:       routeHost(base),
			UpstreamHTTPStatus: resp.StatusCode,
		}
	}
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if !strings.Contains(contentType, "text/event-stream") {
		defer resp.Body.Close()
		data, readErr := util.ReadAllLimited(resp.Body, 32<<20)
		if readErr != nil {
			return nil, &protocol.ImageGenerationError{
				Message:    "读取 Grok 运行时响应失败: " + readErr.Error(),
				StatusCode: http.StatusBadGateway,
				Type:       "server_error",
				Code:       "grok_native_response_read_error",
			}
		}
		var result map[string]any
		if err := json.Unmarshal(data, &result); err != nil {
			return nil, fmt.Errorf("grok-runtime invalid json: %w", err)
		}
		model := firstNonEmpty(util.Clean(result["model"]), util.Clean(body["model"]), "grok-4")
		text := chatCompletionResultText(result)
		created := int64(util.ToInt(result["created"], 0))
		_, stream, streamErr := emitCompletionAsStream(ctx, model, text, created, result)
		return stream, streamErr
	}

	items := make(chan map[string]any, 16)
	errCh := make(chan error, 1)
	go func() {
		defer resp.Body.Close()
		defer close(items)
		defer close(errCh)
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 4<<20)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, ":") || !strings.HasPrefix(line, "data:") {
				continue
			}
			dataLine := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if dataLine == "" || dataLine == "[DONE]" {
				continue
			}
			var chunk map[string]any
			if err := json.Unmarshal([]byte(dataLine), &chunk); err != nil {
				continue
			}
			select {
			case items <- chunk:
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			}
		}
		if scanErr := scanner.Err(); scanErr != nil {
			errCh <- scanErr
			return
		}
		errCh <- nil
	}()
	return &protocol.StreamResult{Items: items, Err: errCh, Kind: "openai"}, nil
}

// runGrokNativeChatCompletion calls grok-runtime OpenAI-compatible chat completions.
func (a *App) runGrokNativeChatCompletion(ctx context.Context, body map[string]any) (map[string]any, error) {
	if a.config == nil {
		return nil, fmt.Errorf("config unavailable")
	}
	base := strings.TrimRight(a.config.GrokRuntimeBaseURL(), "/")
	token := a.config.InternalServiceToken()
	if base == "" {
		return nil, &protocol.ImageGenerationError{
			Message:    "GROK_RUNTIME_BASE_URL 未配置，无法调用 Grok 对话",
			StatusCode: http.StatusBadRequest,
			Type:       "invalid_request_error",
			Code:       "grok_native_not_configured",
		}
	}
	payload := util.CopyMap(body)
	// Text chat: do not force stream for first-party studio tests unless requested.
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/internal/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Internal-Token", token)
	}
	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &protocol.ImageGenerationError{
			Message:    "Grok 运行时不可用: " + err.Error(),
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "grok_native_unreachable",
		}
	}
	defer resp.Body.Close()
	data, readErr := util.ReadAllLimited(resp.Body, 32<<20)
	if readErr != nil {
		return nil, &protocol.ImageGenerationError{
			Message:    "读取 Grok 运行时响应失败: " + readErr.Error(),
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "grok_native_response_read_error",
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, errorType, code, _ := grokRuntimeErrorDetails(data, resp.StatusCode)
		statusCode := http.StatusBadGateway
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			statusCode = resp.StatusCode
		}
		return nil, &protocol.ImageGenerationError{
			Message:            msg,
			StatusCode:         statusCode,
			Type:               errorType,
			Code:               code,
			UpstreamHost:       routeHost(base),
			UpstreamHTTPStatus: resp.StatusCode,
		}
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("grok-runtime invalid json: %w", err)
	}
	if result == nil {
		result = map[string]any{}
	}
	return result, nil
}

// runGrokNativeImageGeneration calls the 3.5 grok-runtime sidecar.
// When requested n exceeds a single Grok sidecar batch (2 for edits, 8 for generations),
// it chunks requests sequentially and merges returned image items.
func (a *App) runGrokNativeImageGeneration(ctx context.Context, body map[string]any, images []protocol.UploadedImage) (map[string]any, error) {
	totalN := util.ToInt(body["n"], 1)
	if totalN < protocol.MinImageCount {
		totalN = protocol.MinImageCount
	}
	if totalN > protocol.MaxImageCount {
		totalN = protocol.MaxImageCount
	}
	batchMax := 8
	if len(images) > 0 {
		batchMax = 2
	}
	if totalN <= batchMax {
		return a.runSingleGrokNativeImageBatch(ctx, body, images)
	}
	mergedData := make([]any, 0, totalN)
	var firstResult map[string]any
	remaining := totalN
	for remaining > 0 {
		chunkN := remaining
		if chunkN > batchMax {
			chunkN = batchMax
		}
		chunkBody := util.CopyMap(body)
		chunkBody["n"] = chunkN
		part, err := a.runSingleGrokNativeImageBatch(ctx, chunkBody, images)
		if part != nil {
			if firstResult == nil {
				firstResult = part
			}
			for _, item := range util.AsMapSlice(part["data"]) {
				mergedData = append(mergedData, item)
			}
		}
		if err != nil {
			out := map[string]any{"data": mergedData}
			if firstResult != nil {
				for k, v := range firstResult {
					if k != "data" {
						out[k] = v
					}
				}
			}
			return out, err
		}
		remaining -= chunkN
	}
	out := map[string]any{"data": mergedData}
	if firstResult != nil {
		for k, v := range firstResult {
			if k != "data" {
				out[k] = v
			}
		}
	}
	return out, nil
}

func (a *App) runSingleGrokNativeImageBatch(ctx context.Context, body map[string]any, images []protocol.UploadedImage) (map[string]any, error) {
	if a.config == nil {
		return map[string]any{"data": []any{}}, fmt.Errorf("config unavailable")
	}
	base := strings.TrimRight(a.config.GrokRuntimeBaseURL(), "/")
	token := a.config.InternalServiceToken()
	if base == "" {
		return map[string]any{"data": []any{}}, &protocol.ImageGenerationError{
			Message:    "GROK_RUNTIME_BASE_URL 未配置",
			StatusCode: http.StatusBadRequest,
			Type:       "invalid_request_error",
			Code:       "grok_native_not_configured",
		}
	}

	payload := util.CopyMap(body)
	requestedResponseFormat := firstNonEmpty(util.Clean(payload["response_format"]), "url")
	payload["stream"] = false
	// Grok asset URLs require the selected account credentials and commonly return
	// 403 when opened by the browser. Always let grok-runtime download the asset
	// while it still owns the account lease, then persist the bytes in the main
	// application's image store and shape the response back to the requested format.
	payload["response_format"] = "b64_json"
	path := "/internal/v1/images/generations"
	if len(images) > 0 {
		path = "/internal/v1/images/edits"
		encoded := make([]any, 0, len(images))
		for _, img := range images {
			item := map[string]any{
				"b64_json": encodeBytesBase64(img.Data),
				"mime":     firstNonEmpty(img.ContentType, "image/png"),
				"filename": firstNonEmpty(img.Filename, "image.png"),
			}
			encoded = append(encoded, item)
		}
		payload["images"] = encoded
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return map[string]any{"data": []any{}}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(raw))
	if err != nil {
		return map[string]any{"data": []any{}}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Internal-Token", token)
	}
	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		imageErr := &protocol.ImageGenerationError{
			Message:      "Grok 运行时不可用: " + err.Error(),
			StatusCode:   http.StatusBadGateway,
			Type:         "server_error",
			Code:         "grok_native_unreachable",
			UpstreamHost: routeHost(base),
		}
		retryIndex, attemptCount := imageProviderAttemptCounts(nil, imageErr)
		setImageErrorAttempt(imageErr, retryIndex, attemptCount)
		reportImageProviderAttempt(ctx, service.ImageTaskProviderGrokRuntime, imageAttemptModel(body, ""), routeHost(base), retryIndex, attemptCount, nil, imageErr)
		return map[string]any{"data": []any{}}, imageErr
	}
	defer resp.Body.Close()
	data, readErr := util.ReadAllLimited(resp.Body, 64<<20)
	if readErr != nil {
		imageErr := &protocol.ImageGenerationError{
			Message:      "读取 Grok 运行时响应失败: " + readErr.Error(),
			StatusCode:   http.StatusBadGateway,
			Type:         "server_error",
			Code:         "grok_native_response_read_error",
			UpstreamHost: routeHost(base),
		}
		retryIndex, attemptCount := imageProviderAttemptCounts(nil, imageErr)
		setImageErrorAttempt(imageErr, retryIndex, attemptCount)
		reportImageProviderAttempt(ctx, service.ImageTaskProviderGrokRuntime, imageAttemptModel(body, ""), routeHost(base), retryIndex, attemptCount, nil, imageErr)
		return map[string]any{"data": []any{}}, imageErr
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, errorType, code, envelope := grokRuntimeErrorDetails(data, resp.StatusCode)
		imageErr := &protocol.ImageGenerationError{Message: msg, StatusCode: resp.StatusCode, UpstreamHTTPStatus: resp.StatusCode, Type: errorType, Code: code}
		imageErr = imageErrorWithResponseMetadata(imageErr, resp, envelope).(*protocol.ImageGenerationError)
		retryIndex, attemptCount := imageProviderAttemptCounts(envelope, imageErr)
		setImageErrorAttempt(imageErr, retryIndex, attemptCount)
		reportImageProviderAttempt(ctx, service.ImageTaskProviderGrokRuntime, imageAttemptModel(body, ""), routeHost(base), retryIndex, attemptCount, envelope, imageErr)
		return map[string]any{"data": []any{}}, imageErr
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return map[string]any{"data": []any{}}, fmt.Errorf("grok-runtime invalid json: %w", err)
	}
	if result == nil {
		result = map[string]any{"data": []any{}}
	}
	result, err = a.formatGrokNativeImageResult(result, body, requestedResponseFormat)
	if err != nil {
		imageErr := &protocol.ImageGenerationError{
			Message:    "保存 Grok 图片失败: " + err.Error(),
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "grok_native_image_format_failed",
		}
		retryIndex, attemptCount := imageProviderAttemptCounts(result, imageErr)
		setImageErrorAttempt(imageErr, retryIndex, attemptCount)
		reportImageProviderAttempt(ctx, service.ImageTaskProviderGrokRuntime, imageAttemptModel(body, ""), routeHost(base), retryIndex, attemptCount, result, imageErr)
		return map[string]any{"data": []any{}}, imageErr
	}
	addImageResponseMetadata(result, resp)
	retryIndex, attemptCount := imageProviderAttemptCounts(result, nil)
	reportImageProviderAttempt(ctx, service.ImageTaskProviderGrokRuntime, imageAttemptModel(body, ""), routeHost(base), retryIndex, attemptCount, result, nil)
	return result, nil
}

func (a *App) formatGrokNativeImageResult(result, request map[string]any, responseFormat string) (map[string]any, error) {
	items := util.AsMapSlice(result["data"])
	b64Items := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if util.Clean(item["b64_json"]) != "" {
			b64Items = append(b64Items, item)
		}
	}
	// Keep compatibility with an older sidecar that may ignore b64_json and
	// return an already-public URL. New runtimes always take the branch below.
	if len(b64Items) == 0 {
		return result, nil
	}
	formatted, err := a.engine.FormatImageResultWithOptions(
		b64Items,
		util.Clean(request["prompt"]),
		responseFormat,
		util.Clean(request["base_url"]),
		util.Clean(request["owner_id"]),
		util.Clean(request["owner_name"]),
		int64(util.ToInt(result["created"], 0)),
		util.Clean(result["message"]),
		protocol.ImageOutputOptionsFromPayload(request),
	)
	if err != nil {
		return nil, err
	}
	if len(util.AsMapSlice(formatted["data"])) == 0 {
		return nil, fmt.Errorf("grok-runtime returned invalid image data")
	}
	for key, value := range result {
		if key == "data" {
			continue
		}
		if _, exists := formatted[key]; !exists {
			formatted[key] = value
		}
	}
	return formatted, nil
}

func grokRuntimeErrorDetails(data []byte, statusCode int) (string, string, string, map[string]any) {
	message := strings.TrimSpace(string(data))
	if message == "" {
		message = fmt.Sprintf("grok-runtime HTTP %d", statusCode)
	}
	errorType := "server_error"
	if statusCode >= 400 && statusCode < 500 {
		errorType = "invalid_request_error"
	}
	code := "grok_native_upstream"
	var envelope map[string]any
	if json.Unmarshal(data, &envelope) != nil {
		return message, errorType, code, nil
	}
	errorObject, _ := envelope["error"].(map[string]any)
	if detail, ok := envelope["detail"].(map[string]any); ok {
		if nested, nestedOK := detail["error"].(map[string]any); nestedOK {
			errorObject = nested
		} else if value := util.Clean(detail["message"]); value != "" {
			message = value
		}
	}
	if errorObject != nil {
		if value := util.Clean(errorObject["message"]); value != "" {
			message = value
		}
		if value := util.Clean(errorObject["type"]); value != "" {
			errorType = value
		}
		if value := util.Clean(errorObject["code"]); value != "" {
			code = value
		}
	}
	return message, errorType, code, envelope
}

func encodeBytesBase64(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}
