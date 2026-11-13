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
	"math/rand"
	"mime"
	"net/http"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/util"
)

const (
	imageClientCreatedRoot = "client-created-root"
)

func (c *Client) ResolveConversationImageURLs(ctx context.Context, conversationID string, fileIDs, sedimentIDs []string, poll bool) []string {
	fileIDs = filter(fileIDs, func(v string) bool { return v != "file_upload" })
	if poll && conversationID != "" && (len(fileIDs) > 0 || len(sedimentIDs) > 0) {
		if delay := imageResultSettleDelay(); delay > 0 && !sleepWithinContext(ctx, delay) {
			return nil
		}
	}
	if poll && conversationID != "" && len(fileIDs) == 0 && len(sedimentIDs) == 0 {
		polledFiles, polledSediments := c.pollImageResults(ctx, conversationID, imagePollTimeout())
		fileIDs = appendUnique(fileIDs, polledFiles...)
		sedimentIDs = appendUnique(sedimentIDs, polledSediments...)
	}
	urls := c.resolveImageURLs(ctx, conversationID, fileIDs, sedimentIDs)
	if len(urls) > 0 || !poll || conversationID == "" {
		return urls
	}
	if len(fileIDs) > 0 || len(sedimentIDs) > 0 {
		for _, backoff := range []time.Duration{400 * time.Millisecond, 1000 * time.Millisecond} {
			if !sleepWithinContext(ctx, backoff) {
				return nil
			}
			if urls = c.resolveImageURLs(ctx, conversationID, fileIDs, sedimentIDs); len(urls) > 0 {
				return urls
			}
		}
		polledFiles, polledSediments := c.pollImageResults(ctx, conversationID, imagePollTimeout())
		fileIDs = appendUnique(fileIDs, polledFiles...)
		sedimentIDs = appendUnique(sedimentIDs, polledSediments...)
		return c.resolveImageURLs(ctx, conversationID, fileIDs, sedimentIDs)
	}
	return nil
}

func (c *Client) streamPictureConversation(ctx context.Context, out chan<- string, prompt, model string, images []string) error {
	if c.AccessToken == "" {
		return fmt.Errorf("access_token is required for image endpoints")
	}
	if err := c.bootstrap(ctx); err != nil {
		return err
	}
	if err := c.prepareSentinelContext(ctx); err != nil {
		return err
	}
	references, err := c.uploadReferenceImages(ctx, images)
	if err != nil {
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

func (c *Client) uploadReferenceImages(ctx context.Context, images []string) ([]UploadedFile, error) {
	if len(images) == 0 {
		return nil, nil
	}
	if len(images) == 1 {
		uploaded, err := c.uploadImage(ctx, images[0], "image_1.png")
		if err != nil {
			return nil, err
		}
		return []UploadedFile{uploaded}, nil
	}
	references := make([]UploadedFile, len(images))
	uploadCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	sem := make(chan struct{}, 3)
	var (
		wg       sync.WaitGroup
		errMu    sync.Mutex
		firstErr error
	)
	for index, imageRef := range images {
		index := index
		imageRef := imageRef
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-uploadCtx.Done():
				return
			}
			uploaded, err := c.uploadImage(uploadCtx, imageRef, fmt.Sprintf("image_%d.png", index+1))
			if err != nil {
				errMu.Lock()
				if firstErr == nil {
					firstErr = err
					cancel()
				}
				errMu.Unlock()
				return
			}
			references[index] = uploaded
		}()
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	return references, nil
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
	raw := strings.ToLower(strings.TrimSpace(model))
	if raw == "" || raw == util.ImageModelGPT {
		return util.ImageModelGPT53
	}
	if raw == "codex-gpt-image-2" {
		return "codex-gpt-image-2"
	}
	if isAllowedPictureModelSlug(raw) {
		return raw
	}
	// Match yukkcat/chatgpt2api: gpt-image-2.5 / flare / sunburst / 2.6 / auto
	// route through ChatGPT Web's "auto" model with system_hints=["picture_v2"].
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
		"action":                 "next",
		"fork_from_shared_post":  false,
		"parent_message_id":      imageClientCreatedRoot,
		"model":                  c.imageModelSlug(model),
		"timezone_offset_min":    timezoneOffset,
		"timezone":               timezoneName,
		"conversation_mode":      map[string]any{"kind": "primary_assistant"},
		"system_hints":           []any{"picture_v2"},
		"supports_buffering":     true,
		"supported_encodings":    []any{"v1"},
		"client_contextual_info": map[string]any{"app_name": "chatgpt.com"},
		"client_prepare_state":   "success",
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
	settleDelay := imageUploadSettleDelay()
	if settleDelay > 0 && !sleepWithinContext(ctx, settleDelay) {
		return UploadedFile{}, ctx.Err()
	}
	uploadURL := util.Clean(uploadMeta["upload_url"])
	var lastPutErr error
	for putAttempt := 0; putAttempt < 2; putAttempt++ {
		if putAttempt > 0 && !sleepWithinContext(ctx, 200*time.Millisecond) {
			return UploadedFile{}, ctx.Err()
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, bytes.NewReader(data))
		if err != nil {
			return UploadedFile{}, fmt.Errorf("image_upload request: %w", err)
		}
		for key, value := range map[string]string{"Content-Type": mimeType, "x-ms-blob-type": "BlockBlob", "x-ms-version": "2020-04-08", "Origin": c.BaseURL, "Referer": c.BaseURL + "/", "User-Agent": c.userAgent, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.8"} {
			req.Header.Set(key, value)
		}
		putResp, err := c.httpClient.Do(req)
		if err != nil {
			lastPutErr = upstreamTransportError("image_upload", err)
			if putAttempt == 0 && settleDelay == 0 {
				continue
			}
			return UploadedFile{}, lastPutErr
		}
		if putAttempt == 0 && settleDelay == 0 && (putResp.StatusCode == http.StatusForbidden || putResp.StatusCode == http.StatusNotFound || putResp.StatusCode >= 500) {
			_ = putResp.Body.Close()
			continue
		}
		if err := ensureOKAndClose(putResp, "image_upload"); err != nil {
			return UploadedFile{}, err
		}
		lastPutErr = nil
		break
	}
	if lastPutErr != nil {
		return UploadedFile{}, lastPutErr
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
	var parts []any
	for _, item := range references {
		parts = append(parts, map[string]any{"content_type": "image_asset_pointer", "asset_pointer": "file-service://" + item.FileID, "width": item.Width, "height": item.Height, "size_bytes": item.FileSize})
	}
	parts = append(parts, prompt)
	content := map[string]any{"content_type": "text", "parts": []any{prompt}}
	if len(references) > 0 {
		content = map[string]any{"content_type": "multimodal_text", "parts": parts}
	}
	metadata := map[string]any{
		"selected_github_repos":     []any{},
		"selected_all_github_repos": false,
		"serialization_metadata":    map[string]any{"custom_symbol_offsets": []any{}},
	}
	if len(references) > 0 {
		attachments := make([]any, 0, len(references))
		for _, item := range references {
			attachments = append(attachments, map[string]any{"id": item.FileID, "mimeType": item.MimeType, "name": item.FileName, "size": item.FileSize, "width": item.Width, "height": item.Height})
		}
		metadata["attachments"] = attachments
	}
	payload := map[string]any{
		"action": "next",
		"messages": []any{map[string]any{
			"id":          util.NewUUID(),
			"author":      map[string]any{"role": "user"},
			"create_time": float64(time.Now().UnixNano()) / 1e9,
			"content":     content,
			"metadata":    metadata,
		}},
		"parent_message_id":        imageClientCreatedRoot,
		"model":                    c.imageModelSlug(model),
		"timezone_offset_min":      timezoneOffset,
		"timezone":                 timezoneName,
		"conversation_mode":        map[string]any{"kind": "primary_assistant"},
		"enable_message_followups": true,
		"system_hints":             []any{"picture_v2"},
		"supports_buffering":       true,
		"supported_encodings":      []any{"v1"},
		"client_contextual_info": map[string]any{
			"is_dark_mode":      false,
			"time_since_loaded": 20 + rand.Intn(101),
			"page_height":       945,
			"page_width":        1920,
			"pixel_ratio":       1,
			"screen_height":     1080,
			"screen_width":      1920,
			"app_name":          "chatgpt.com",
		},
		"client_prepare_state":                 "sent",
		"paragen_cot_summary_display_override": "allow",
		"force_parallel_switch":                "auto",
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
		if isAutoImageModelNotFound(resp.StatusCode, strings.ToLower(strings.TrimSpace(model)), data) {
			return nil, fmt.Errorf("%w: %v", ErrAutoImageModelNotFound, upstreamHTTPErrorWithResponse(path, resp, data))
		}
		return nil, upstreamHTTPErrorWithResponse(path, resp, data)
	}
	return resp, nil
}
