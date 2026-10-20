package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"chatgpt2api/internal/util"
)

const (
	imageClientCreatedRoot = "client-created-root"
	imageCreationMention   = "@创建图像"
)

func (c *Client) ResolveConversationImageURLs(ctx context.Context, conversationID string, fileIDs, sedimentIDs []string, poll bool) []string {
	fileIDs = filter(fileIDs, func(v string) bool { return v != "file_upload" })
	if poll && conversationID != "" && (len(fileIDs) > 0 || len(sedimentIDs) > 0) {
		// The SSE can expose asset ids before the conversation/file service has
		// committed the download metadata. Give the upstream a short, interruptible
		// settle window before resolving URLs.
		if !sleepWithinContext(ctx, imageResultSettleDelay()) {
			return nil
		}
	}
	if poll && conversationID != "" && len(fileIDs) == 0 && len(sedimentIDs) == 0 {
		polledFiles, polledSediments := c.pollImageResults(ctx, conversationID, imagePollTimeout())
		fileIDs = appendUnique(fileIDs, polledFiles...)
		sedimentIDs = appendUnique(sedimentIDs, polledSediments...)
	}
	return c.resolveImageURLs(ctx, conversationID, fileIDs, sedimentIDs)
}

func (c *Client) streamPictureConversation(ctx context.Context, out chan<- string, prompt, model string, images []string) error {
	if c.AccessToken == "" {
		return fmt.Errorf("access_token is required for image endpoints")
	}
	if err := c.prepareSentinelContext(ctx); err != nil {
		return err
	}
	references := make([]UploadedFile, 0, len(images))
	for index, imageRef := range images {
		uploaded, err := c.uploadImage(ctx, imageRef, fmt.Sprintf("image_%d.png", index+1))
		if err != nil {
			return err
		}
		references = append(references, uploaded)
	}
	if err := c.bootstrap(ctx); err != nil {
		return err
	}
	reqs, err := c.getChatRequirements(ctx)
	if err != nil {
		return err
	}
	traceID := util.NewUUID()
	conduit, err := c.prepareImageConversation(ctx, prompt, reqs, model, traceID)
	if err != nil {
		return err
	}
	resp, err := c.startImageGeneration(ctx, prompt, reqs, conduit, model, references, traceID)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return iterPictureSSEPayloads(ctx, resp.Body, out)
}

func iterPictureSSEPayloads(ctx context.Context, reader io.Reader, out chan<- string) error {
	return iterSSEPayloadsUntil(ctx, reader, out, isImageStreamTerminalPayload)
}

func isImageStreamTerminalPayload(payload string) bool {
	if strings.TrimSpace(payload) == "" || strings.TrimSpace(payload) == "[DONE]" {
		return false
	}
	var event any
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return false
	}
	hasCompletionMarker := false
	hasTerminalStatus := false
	var visit func(any)
	visit = func(value any) {
		if hasCompletionMarker && hasTerminalStatus {
			return
		}
		switch item := value.(type) {
		case map[string]any:
			patchPath := strings.ToLower(strings.TrimSpace(util.Clean(item["p"])))
			if strings.HasSuffix(patchPath, "/message/status") && isTerminalImageMessageStatus(util.Clean(item["v"])) {
				hasTerminalStatus = true
			}
			if strings.HasSuffix(patchPath, "/is_complete") || strings.HasSuffix(patchPath, "/complete") {
				if complete, ok := item["v"].(bool); ok && complete {
					hasCompletionMarker = true
				}
			}
			for key, nested := range item {
				switch strings.ToLower(strings.TrimSpace(key)) {
				case "status", "state":
					if isTerminalImageMessageStatus(util.Clean(nested)) {
						hasTerminalStatus = true
					}
				case "is_complete", "complete":
					if complete, ok := nested.(bool); ok && complete {
						hasCompletionMarker = true
					}
				case "finish_details":
					switch details := nested.(type) {
					case map[string]any:
						hasCompletionMarker = len(details) > 0
					case []any:
						hasCompletionMarker = len(details) > 0
					}
				}
				visit(nested)
			}
		case []any:
			for _, nested := range item {
				visit(nested)
			}
		}
	}
	visit(event)
	return hasCompletionMarker && hasTerminalStatus
}

func isTerminalImageMessageStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "complete", "completed", "done", "finished", "finished_successfully", "finished_partial_completion", "success", "succeeded":
		return true
	default:
		return false
	}
}

func (c *Client) imageHeaders(path string, reqs ChatRequirements, conduitToken, accept string) map[string]string {
	return c.imageHeadersContext(context.Background(), path, reqs, conduitToken, accept)
}

func (c *Client) imageHeadersContext(ctx context.Context, path string, reqs ChatRequirements, conduitToken, accept string) map[string]string {
	return c.imageHeadersContextWithTrace(ctx, path, reqs, conduitToken, accept, "")
}

func (c *Client) imageHeadersContextWithTrace(ctx context.Context, path string, reqs ChatRequirements, conduitToken, accept, traceID string) map[string]string {
	if accept == "" {
		accept = "*/*"
	}
	extra := map[string]string{"Content-Type": "application/json", "Accept": accept, "OpenAI-Sentinel-Chat-Requirements-Token": reqs.Token}
	if reqs.ProofToken != "" {
		extra["OpenAI-Sentinel-Proof-Token"] = reqs.ProofToken
	}
	if reqs.TurnstileToken != "" {
		extra["OpenAI-Sentinel-Turnstile-Token"] = reqs.TurnstileToken
	}
	if reqs.SOToken != "" {
		extra["OpenAI-Sentinel-SO-Token"] = reqs.SOToken
	}
	if conduitToken != "" {
		extra["X-Conduit-Token"] = conduitToken
	}
	if traceID != "" {
		extra["X-Oai-Turn-Trace-Id"] = traceID
	} else if accept == "text/event-stream" {
		extra["X-Oai-Turn-Trace-Id"] = util.NewUUID()
	}
	return c.headersContext(ctx, path, extra)
}

func (c *Client) imageModelSlug(model string) string {
	model = strings.TrimSpace(model)
	if canonical, ok := util.CanonicalImage25Model(model); ok {
		return canonical
	}
	if model == "" || util.IsGPTImageModel(model) {
		// Public GPT image aliases are translated to the Web conversation slug;
		// API providers keep the public ID in their own request path.
		return util.ImageModelGPT53
	}
	if strings.EqualFold(model, util.ImageModelAuto) {
		return util.ImageModelAuto
	}
	if isAllowedPictureModelSlug(model) {
		return strings.ToLower(model)
	}
	return util.ImageModelAuto
}

func isAllowedPictureModelSlug(model string) bool {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case util.ImageModelGPT55Thinking, util.ImageModelGPT53, util.ImageModelGPT53Mini, util.ImageModelGPT55, util.ImageModelGPT54, util.ImageModelGPT5, util.ImageModelGPT51, util.ImageModelGPT52, util.ImageModelGPTMini:
		return true
	default:
		return false
	}
}

func (c *Client) prepareImageConversation(ctx context.Context, prompt string, reqs ChatRequirements, model, traceID string) (string, error) {
	path := "/backend-api/f/conversation/prepare"
	timezoneName, timezoneOffset := c.imageTimezone()
	payload := map[string]any{
		"action": "next", "is_do_not_remember": false, "model": c.imageModelSlug(model), "parent_message_id": imageClientCreatedRoot,
		"system_hints": []any{"picture_v2"}, "timezone_offset_min": timezoneOffset, "timezone": timezoneName,
		"client_contextual_info": map[string]any{"app_name": "chatgpt.com", "app_surface": "codex_browser", "has_web_push_capabilities": true, "web_push_notification_permission": "default"},
		"local_function_names":   []any{"local.continue_in_work"}, "supported_encodings": []any{"v1"}, "client_prepare_state": "sent",
		"partial_query":           map[string]any{"id": util.NewUUID(), "author": map[string]any{"role": "user"}, "content": map[string]any{"content_type": "text", "parts": []any{prompt}}},
		"client_prepare_dispatch": "debounced", "client_prepare_source": "composer_editor_state",
	}
	resp, err := c.postJSON(ctx, path, payload, c.imageHeadersContextWithTrace(ctx, path, reqs, "", "*/*", traceID), false)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, err := readBackendResponseBody(resp, path)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", upstreamHTTPErrorWithResponse(path, resp, data)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}
	return util.Clean(result["conduit_token"]), nil
}

func (c *Client) uploadImage(ctx context.Context, imageRef, fileName string) (UploadedFile, error) {
	data, err := decodeImageReference(imageRef)
	if err != nil {
		return UploadedFile{}, err
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return UploadedFile{}, err
	}
	mimeType := mime.TypeByExtension("." + format)
	if mimeType == "" {
		mimeType = "image/png"
	}
	path := "/backend-api/files"
	resp, err := c.postJSON(ctx, path, map[string]any{"file_name": fileName, "file_size": len(data), "use_case": "multimodal", "width": cfg.Width, "height": cfg.Height}, c.headersContext(ctx, path, map[string]string{"Content-Type": "application/json", "Accept": "application/json"}), false)
	if err != nil {
		return UploadedFile{}, err
	}
	uploadMeta, err := readJSONResponse(resp, path)
	if err != nil {
		return UploadedFile{}, err
	}
	// Brief pause for Azure blob SAS readiness; interruptible via request context.
	if !sleepWithinContext(ctx, imageUploadSettleDelay()) {
		return UploadedFile{}, ctx.Err()
	}
	uploadURL := util.Clean(uploadMeta["upload_url"])
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, bytes.NewReader(data))
	if err != nil {
		return UploadedFile{}, fmt.Errorf("image_upload request: %w", err)
	}
	for key, value := range map[string]string{"Content-Type": mimeType, "x-ms-blob-type": "BlockBlob", "x-ms-version": "2020-04-08", "Origin": c.BaseURL, "Referer": c.BaseURL + "/", "User-Agent": c.userAgent, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.8"} {
		req.Header.Set(key, value)
	}
	putResp, err := c.httpClient.Do(req)
	if err != nil {
		return UploadedFile{}, upstreamTransportError("image_upload", err)
	}
	if err := ensureOKAndClose(putResp, "image_upload"); err != nil {
		return UploadedFile{}, err
	}
	uploadedPath := fmt.Sprintf("/backend-api/files/%s/uploaded", util.Clean(uploadMeta["file_id"]))
	resp, err = c.postRaw(ctx, uploadedPath, []byte("{}"), c.headersContext(ctx, uploadedPath, map[string]string{"Content-Type": "application/json", "Accept": "application/json"}), false)
	if err != nil {
		return UploadedFile{}, err
	}
	if err := ensureOKAndClose(resp, uploadedPath); err != nil {
		return UploadedFile{}, err
	}
	return UploadedFile{FileID: util.Clean(uploadMeta["file_id"]), FileName: fileName, FileSize: len(data), MimeType: mimeType, Width: cfg.Width, Height: cfg.Height}, nil
}

func (c *Client) startImageGeneration(ctx context.Context, prompt string, reqs ChatRequirements, conduitToken, model string, references []UploadedFile, traceID string) (*http.Response, error) {
	timezoneName, timezoneOffset := c.imageTimezone()
	mentionText := imageCreationMention + " " + prompt
	var parts []any
	for _, item := range references {
		parts = append(parts, map[string]any{"content_type": "image_asset_pointer", "asset_pointer": "file-service://" + item.FileID, "width": item.Width, "height": item.Height, "size_bytes": item.FileSize})
	}
	parts = append(parts, mentionText)
	content := map[string]any{"content_type": "text", "parts": []any{mentionText}}
	if len(references) > 0 {
		content = map[string]any{"content_type": "multimodal_text", "parts": parts}
	}
	metadata := map[string]any{"developer_mode_connector_ids": []any{}, "selected_github_repos": []any{}, "selected_all_github_repos": false, "system_hints": []any{"picture_v2"}, "serialization_metadata": map[string]any{
		"render_format": "markdown", "custom_symbol_offsets": []any{map[string]any{"id": "picture_v2", "symbol": "ecosystemMention", "startIndex": 0, "endIndex": utf8.RuneCountInString(imageCreationMention)}},
	}}
	if len(references) > 0 {
		attachments := make([]any, 0, len(references))
		for _, item := range references {
			attachments = append(attachments, map[string]any{"id": item.FileID, "mimeType": item.MimeType, "name": item.FileName, "size": item.FileSize, "width": item.Width, "height": item.Height})
		}
		metadata["attachments"] = attachments
	}
	payload := map[string]any{
		"turn_attribution": map[string]any{"turn_trigger": "composer"}, "action": "next", "is_do_not_remember": false,
		"messages":          []any{map[string]any{"id": util.NewUUID(), "author": map[string]any{"metadata": map[string]any{}, "name": nil, "role": "user"}, "channel": nil, "create_time": float64(time.Now().UnixNano()) / 1e9, "end_turn": nil, "content": content, "metadata": metadata, "recipient": "all", "status": "finished_successfully", "update_time": nil, "weight": 1}},
		"parent_message_id": imageClientCreatedRoot, "model": c.imageModelSlug(model), "system_hints": []any{"picture_v2"}, "timezone_offset_min": timezoneOffset, "timezone": timezoneName,
		"client_contextual_info": map[string]any{"app_name": "chatgpt.com", "app_surface": "codex_browser", "has_web_push_capabilities": true, "web_push_notification_permission": "default"},
		"local_function_names":   []any{"local.continue_in_work"}, "supported_encodings": []any{"v1"}, "genui_state_snapshots": []any{}, "client_prepare_state": "success",
	}
	path := "/backend-api/f/conversation"
	resp, err := c.postJSON(ctx, path, payload, c.imageHeadersContextWithTrace(ctx, path, reqs, conduitToken, "text/event-stream", traceID), true)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		data, readErr := readBackendResponseBody(resp, path)
		if readErr != nil {
			return nil, readErr
		}
		if isAutoImageModelNotFound(resp.StatusCode, c.imageModelSlug(model), data) {
			return nil, fmt.Errorf("%w: %v", ErrAutoImageModelNotFound, upstreamHTTPErrorWithResponse(path, resp, data))
		}
		return nil, upstreamHTTPErrorWithResponse(path, resp, data)
	}
	return resp, nil
}
