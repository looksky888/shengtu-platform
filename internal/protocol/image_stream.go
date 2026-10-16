package protocol

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

// maxImageStreamTransientRetries is the max number of *extra* account switches after the
// first attempt. Total attempts = 1 + maxImageStreamTransientRetries.
// With CHATGPT2API_IMAGE_ATTEMPT_TIMEOUT_SECONDS=80 and this set to 3:
//
//	4 distinct accounts × 80s plus bounded async recovery fits within the task budget.
//
// A timed-out stream is polled with the parent task context before rotating accounts.
const maxImageStreamTransientRetries = 3

type imageAttemptContextKey struct{}
type imageAttemptParentContextKey struct{}

func imageAttemptParentContext(ctx context.Context) context.Context {
	if parent, ok := ctx.Value(imageAttemptParentContextKey{}).(context.Context); ok && parent != nil {
		return parent
	}
	return ctx
}

func imageResultContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(imageAttemptParentContext(ctx), backend.ImagePollTimeout())
}

func (o ImageOutput) Chunk() map[string]any {
	chunk := map[string]any{
		"object":              "image.generation.chunk",
		"created":             o.Created,
		"model":               o.Model,
		"index":               o.Index,
		"total":               o.Total,
		"progress_text":       o.Text,
		"upstream_event_type": o.UpstreamEventType,
		"data":                []map[string]any{},
	}
	switch o.Kind {
	case "message":
		chunk["object"] = "image.generation.message"
		chunk["message"] = o.Text
		delete(chunk, "progress_text")
		delete(chunk, "upstream_event_type")
	case "result":
		chunk["object"] = "image.generation.result"
		chunk["data"] = o.Data
		delete(chunk, "progress_text")
		delete(chunk, "upstream_event_type")
	}
	return chunk
}
func (e *Engine) StreamImageOutputsWithPool(ctx context.Context, request ConversationRequest) (<-chan ImageOutput, <-chan error) {
	request = request.Normalized()
	out := make(chan ImageOutput)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		if e == nil || e.Accounts == nil {
			errCh <- newImageStreamGenerationError("image account pool is not initialized")
			return
		}
		if !request.SupportsImageGenerationModel() {
			errCh <- &ImageGenerationError{Message: "unsupported image model,supported models: " + util.ImageGenerationModelNames(), StatusCode: 502, Type: "server_error", Code: "upstream_error"}
			return
		}
		emittedResult := false
		lastError := ""
		var allowAccount func(map[string]any) bool
		if request.RequirePaidAccount {
			allowAccount = service.IsPaidImageAccount
		}
		for index := 1; index <= request.N; index++ {
			streamRetryCount := 0
			attemptCount := 0
			attemptedTokens := map[string]struct{}{}
			attemptTimeout := imageAttemptTimeout()
			for {
				if attemptCount >= 1+maxImageStreamTransientRetries {
					errCh <- newImageStreamGenerationError(firstNonEmpty(lastError, "image generation failed after account retries"))
					return
				}
				token, err := e.Accounts.GetAvailableAccessTokenForExcluding(ctx, allowAccount, attemptedTokens)
				if err != nil {
					if emittedResult {
						errCh <- nil
						return
					}
					if attemptCount > 0 && lastError != "" {
						errCh <- newImageStreamGenerationError(lastError)
						return
					}
					if request.RequirePaidAccount {
						errCh <- NewImageGenerationError("当前没有可用的 Paid 图片账号，2K/4K 及宽屏等大尺寸需要 Plus / Pro / Team 账号")
						return
					}
					errCh <- NewImageGenerationError(err.Error())
					return
				}
				attemptedTokens[token] = struct{}{}
				if sink := service.TaskProgressFromContext(ctx); sink != nil {
					sink.SetProgress(62, "正在启动生成", "上游会话已启动")
				}
				// Keep exclusive account lease alive for long-running generations.
				e.Accounts.RenewImageLease(token)
				emittedForToken := false
				returnedMessage := false
				returnedResult := false
				rateLimitedForToken := false
				rateLimitMessage := ""
				cloudflareChallengeForToken := false
				cloudflareChallengeMessage := ""
				client := backend.NewClient(token, e.Accounts, e.Proxy).SetLogger(e.Logger)
				attemptRequest := request
				attemptRequest.UpstreamModel = request.upstreamModelForAttempt(streamRetryCount)
				attemptCount++
				attemptID := util.NewUUID()
				if e.Logger != nil {
					e.Logger.Info("image attempt started", "attempt_id", attemptID, "index", index, "retry", streamRetryCount, "upstream_model", attemptRequest.UpstreamModel, "timeout_seconds", int(attemptTimeout.Seconds()))
				}
				if sink := service.TaskProgressFromContext(ctx); sink != nil {
					sink.Event("upstream_start", "开始上游生图", map[string]any{
						"attempt_id":         attemptID,
						"index":              index,
						"effective_provider": service.ImageTaskProviderAccountPool,
						"effective_channel":  service.ImageTaskChannelAccountPool,
						"effective_model":    firstNonEmpty(attemptRequest.UpstreamModel, attemptRequest.Model),
						"upstream_host":      "chatgpt.com",
						"retry_index":        attemptCount - 1,
						"attempt_count":      attemptCount,
						"reference_count":    len(attemptRequest.Images),
						"reference_hashes":   shortEvidenceHashes(attemptRequest.Images),
					})
				}
				attemptCtx := context.WithValue(ctx, imageAttemptContextKey{}, attemptID)
				attemptCtx = context.WithValue(attemptCtx, imageAttemptParentContextKey{}, ctx)
				attemptCtx, cancelAttempt := context.WithTimeout(attemptCtx, attemptTimeout)
				outputs, imageErr := e.StreamImageOutputs(attemptCtx, client, attemptRequest, index, request.N)
				for output := range outputs {
					if output.Kind == "progress" || output.Kind == "partial" {
						if sink := service.TaskProgressFromContext(ctx); sink != nil {
							sink.SetProgress(78, "正在接收图片", firstNonEmpty(output.Text, "接收上游进度"))
						}
					}
					if output.Kind == "message" && service.IsAccountRateLimitedErrorMessage(output.Text) {
						rateLimitedForToken = true
						rateLimitMessage = output.Text
						lastError = output.Text
						continue
					}
					if output.Kind == "message" && isCloudflareChallengeMessage(output.Text) {
						cloudflareChallengeForToken = true
						cloudflareChallengeMessage = output.Text
						lastError = output.Text
						continue
					}
					if output.Kind == "message" && request.MessageAsError {
						returnedMessage = true
						lastError = firstNonEmpty(output.Text, "Image generation returned a text response instead of image data.")
						continue
					}
					emittedForToken = true
					returnedMessage = output.Kind == "message"
					returnedResult = returnedResult || output.Kind == "result"
					emittedResult = emittedResult || output.Kind == "result"
					out <- output
				}
				err = <-imageErr
				attemptTimedOut := attemptCtx.Err() == context.DeadlineExceeded && ctx.Err() == nil
				cancelAttempt()
				if err == nil && attemptTimedOut && !returnedResult {
					err = context.DeadlineExceeded
				}
				if err == nil {
					if cloudflareChallengeForToken {
						e.Accounts.MarkImageResult(token, false)
						cooldown := e.Accounts.MarkImageChallenge(token)
						lastError = firstNonEmpty(cloudflareChallengeMessage, lastError)
						if streamRetryCount < maxImageStreamTransientRetries {
							streamRetryCount++
							if e.Logger != nil {
								e.Logger.Warning("image attempt hit Cloudflare challenge, cooling account and retrying", "index", index, "retry", streamRetryCount, "upstream_model", request.upstreamModelForAttempt(streamRetryCount), "cooldown_seconds", int(cooldown.Duration.Seconds()))
							}
							if !waitImageRetry(ctx, streamRetryCount) {
								errCh <- ctx.Err()
								return
							}
							continue
						}
						errCh <- newImageStreamGenerationError(lastError)
						return
					}
					if rateLimitedForToken {
						e.Accounts.MarkImageResult(token, false)
						e.Accounts.ApplyAccountErrorMessage(token, "image_stream", rateLimitMessage)
						continue
					}
					if !returnedResult {
						if returnedMessage {
							e.Accounts.ReleaseImageReservation(token)
							errCh <- &ImageGenerationError{Message: lastError, StatusCode: 400, Type: "invalid_request_error", Code: "image_generation_text_response"}
							return
						}
						e.Accounts.MarkImageResult(token, false)
						if !returnedResult && streamRetryCount < maxImageStreamTransientRetries {
							streamRetryCount++
							lastError = "image generation failed"
							if e.Logger != nil {
								e.Logger.Warning("image stream returned no image, retrying with another account", "index", index, "retry", streamRetryCount, "upstream_model", request.upstreamModelForAttempt(streamRetryCount), "response_kind", map[bool]string{true: "text", false: "empty"}[returnedMessage])
							}
							if !waitImageRetry(ctx, streamRetryCount) {
								errCh <- ctx.Err()
								return
							}
							continue
						}
						errCh <- newImageStreamGenerationError(firstNonEmpty(lastError, "image generation failed"))
						return
					}
					e.Accounts.MarkImageResult(token, true)
					break
				}
				e.Accounts.MarkImageResult(token, false)
				lastError = err.Error()
				if !returnedResult && isCloudflareChallengeMessage(lastError) {
					cooldown := e.Accounts.MarkImageChallenge(token)
					if streamRetryCount < maxImageStreamTransientRetries {
						streamRetryCount++
						if e.Logger != nil {
							e.Logger.Warning("image attempt hit Cloudflare challenge, cooling account and retrying", "index", index, "retry", streamRetryCount, "upstream_model", request.upstreamModelForAttempt(streamRetryCount), "cooldown_seconds", int(cooldown.Duration.Seconds()))
						}
						if !waitImageRetry(ctx, streamRetryCount) {
							errCh <- ctx.Err()
							return
						}
						continue
					}
				}
				if attemptTimedOut && !returnedResult && (err == nil || errors.Is(err, context.DeadlineExceeded)) {
					lastError = fmt.Sprintf("upstream image attempt timed out after %.0fs", attemptTimeout.Seconds())
					if streamRetryCount < maxImageStreamTransientRetries {
						streamRetryCount++
						if e.Logger != nil {
							e.Logger.Warning("image attempt timed out, retrying with another account", "index", index, "retry", streamRetryCount, "upstream_model", request.upstreamModelForAttempt(streamRetryCount), "timeout_seconds", int(attemptTimeout.Seconds()))
						}
						select {
						case <-ctx.Done():
							errCh <- ctx.Err()
							return
						case <-time.After(time.Duration(streamRetryCount) * time.Second):
						}
						continue
					}
				}
				if normalized, handled := e.Accounts.ApplyAccountErrorMessage(token, "image_stream", lastError); handled {
					lastError = normalized
					if service.IsAccountRateLimitedErrorMessage(err.Error()) || !emittedForToken {
						continue
					}
				}
				if !emittedForToken && IsTokenInvalidError(lastError) {
					continue
				}
				if !returnedResult && isRetryableImageStreamError(lastError) && streamRetryCount < maxImageStreamTransientRetries {
					streamRetryCount++
					if e.Logger != nil {
						e.Logger.Warning("image stream transient error, retrying with another account", "index", index, "retry", streamRetryCount, "upstream_model", request.upstreamModelForAttempt(streamRetryCount), "error", imageStreamErrorMessage(lastError))
					}
					if !waitImageRetry(ctx, streamRetryCount) {
						errCh <- ctx.Err()
						return
					}
					continue
				}
				errCh <- newImageStreamGenerationError(lastError)
				return
			}
		}
		if !emittedResult {
			errCh <- newImageStreamGenerationError(lastError)
			return
		}
		errCh <- nil
	}()
	return out, errCh
}

func (e *Engine) StreamImageOutputs(ctx context.Context, client *backend.Client, request ConversationRequest, index, total int) (<-chan ImageOutput, <-chan error) {
	if request.ResponsesImageTool {
		return e.StreamResponsesImageToolOutputs(ctx, client, request, index, total)
	}
	out := make(chan ImageOutput)
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		defer close(errCh)
		var last ConversationEvent
		startedAt := time.Now()
		events, convErr := e.ConversationEventsWithUpstreamModel(ctx, client, request.Messages, request.Model, request.UpstreamModel, request.Prompt, request.Images, request.Size, request.Quality, request.ResponsesImageTool)
		for event := range events {
			last = event
			if event["type"] == "conversation.delta" {
				out <- ImageOutput{Kind: "progress", Model: request.Model, Index: index, Total: total, Created: time.Now().Unix(), Text: util.Clean(event["delta"]), UpstreamEventType: "conversation.delta"}
				continue
			}
			if event["type"] == "conversation.event" {
				rawType := ""
				if raw := util.StringMap(event["raw"]); raw != nil {
					rawType = util.Clean(raw["type"])
				}
				out <- ImageOutput{Kind: "progress", Model: request.Model, Index: index, Total: total, Created: time.Now().Unix(), UpstreamEventType: rawType}
			}
		}
		conversationID := util.Clean(last["conversation_id"])
		fileIDs := util.AsStringSlice(last["file_ids"])
		sedimentIDs := util.AsStringSlice(last["sediment_ids"])
		if sink := service.TaskProgressFromContext(ctx); sink != nil && (conversationID != "" || len(fileIDs) > 0 || len(sedimentIDs) > 0) {
			sink.Event("upstream_result_identified", "已识别上游生图结果", map[string]any{
				"attempt_id":         imageAttemptID(ctx),
				"conversation_hash":  shortEvidenceHash(conversationID),
				"result_file_count":  len(fileIDs),
				"result_file_hashes": shortEvidenceHashes(fileIDs),
				"sediment_count":     len(sedimentIDs),
				"sediment_hashes":    shortEvidenceHashes(sedimentIDs),
			})
		}
		message := strings.TrimSpace(util.Clean(last["text"]))
		toolInvoked, _ := last["tool_invoked"].(bool)
		hasToolInvoked := last["tool_invoked"] != nil
		isTextResponse := (hasToolInvoked && !toolInvoked) || last["turn_use_case"] == "text"
		streamErr := <-convErr
		if streamErr != nil && conversationID == "" && len(fileIDs) == 0 && len(sedimentIDs) == 0 && isRetryableImageStreamError(streamErr.Error()) {
			recoveryCtx, recoveryCancel := context.WithTimeout(imageAttemptParentContext(ctx), 10*time.Second)
			recoveredID, recoveryErr := client.FindRecentConversationByPrompt(recoveryCtx, request.Prompt, startedAt)
			recoveryCancel()
			if recoveryErr == nil && recoveredID != "" {
				conversationID = recoveredID
				if e.Logger != nil {
					e.Logger.Info("recovered image conversation after short stream", "conversation_id", recoveredID, "index", index)
				}
			}
		}
		if streamErr != nil {
			if conversationID != "" && isRetryableImageStreamError(streamErr.Error()) {
				if e.Logger != nil {
					e.Logger.Warning("image stream ended with transient error; polling conversation for async image result", "conversation_id", conversationID, "index", index, "error", imageStreamErrorMessage(streamErr.Error()))
				}
				pollCtx, pollCancel := context.WithTimeout(imageAttemptParentContext(ctx), backend.ImagePollTimeout())
				if result, ok, resolveErr := e.conversationImageResultOutput(pollCtx, client, request, conversationID, fileIDs, sedimentIDs, index, total, true); resolveErr == nil && ok {
					pollCancel()
					out <- result
					errCh <- nil
					return
				} else if resolveErr != nil && e.Logger != nil {
					e.Logger.Warning("image stream transient recovery failed while downloading async image result", "conversation_id", conversationID, "index", index, "error", resolveErr.Error())
				}
				pollCancel()
			}
			errCh <- streamErr
			return
		}
		if message != "" && len(fileIDs) == 0 && len(sedimentIDs) == 0 && (util.ToBool(last["blocked"]) || isTextResponse) {
			out <- ImageOutput{Kind: "message", Model: request.Model, Index: index, Total: total, Created: time.Now().Unix(), Text: message}
			errCh <- nil
			return
		}
		// Keep result polling/download on the parent task budget instead of the
		// per-account SSE deadline. The reference flow uses an independent
		// image-poll budget; otherwise a long SSE consumes the entire attempt
		// context and a valid asynchronous image is reported as empty/timeout.
		resultCtx, resultCancel := imageResultContext(ctx)
		result, ok, err := e.conversationImageResultOutput(resultCtx, client, request, conversationID, fileIDs, sedimentIDs, index, total, true)
		resultCancel()
		if err != nil {
			errCh <- err
			return
		} else if ok {
			out <- result
			errCh <- nil
			return
		}
		if message != "" {
			out <- ImageOutput{Kind: "message", Model: request.Model, Index: index, Total: total, Created: time.Now().Unix(), Text: message}
		}
		errCh <- nil
	}()
	return out, errCh
}
