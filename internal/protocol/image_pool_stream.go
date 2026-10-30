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

func (e *Engine) StreamImageOutputsWithPool(ctx context.Context, request ConversationRequest) (<-chan ImageOutput, <-chan error) {
	return e.streamImageOutputsWithPool(ctx, request, e.StreamImageOutputs)
}

type imageAttemptFunc func(context.Context, *backend.Client, ConversationRequest, int, int) (<-chan ImageOutput, <-chan error)

func (e *Engine) streamImageOutputsWithPool(ctx context.Context, request ConversationRequest, runAttempt imageAttemptFunc) (<-chan ImageOutput, <-chan error) {
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
			failedSolverProxies := map[string]int{}
			fixedUpstreamModel := ""
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
				if fixedUpstreamModel != "" {
					attemptRequest.UpstreamModel = fixedUpstreamModel
				}
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
				outputs, imageErr := runAttempt(attemptCtx, client, attemptRequest, index, request.N)
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
				if !returnedResult && errors.Is(err, backend.ErrAutoImageModelNotFound) {
					fixedUpstreamModel = util.ImageModelAuto
					e.Accounts.CooldownImageModelUnavailable(token)
					lastError = err.Error()
					if streamRetryCount < maxImageStreamTransientRetries && ctx.Err() == nil {
						streamRetryCount++
						if e.Logger != nil {
							e.Logger.Warning("auto image model unavailable, cooling account and retrying", "attempt_id", attemptID, "retry", streamRetryCount, "cooldown_seconds", 600)
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
				if !returnedResult && service.IsSentinelSolverSignal(err.Error()) {
					e.Accounts.ReleaseImageReservation(token)
					lastError = err.Error()
					proxyKey := service.ProxyURLHash(client.ProxyURL())
					failedSolverProxies[proxyKey]++
					if strings.TrimSpace(client.ProxyURL()) == "" {
						delete(attemptedTokens, token)
					}
					if failedSolverProxies[proxyKey] <= 1 && streamRetryCount < maxImageStreamTransientRetries && ctx.Err() == nil {
						streamRetryCount++
						if e.Logger != nil {
							e.Logger.Warning("sentinel solver unavailable, releasing account without penalty and retrying once", "attempt_id", attemptID, "retry", streamRetryCount, "proxy_hash", proxyKey, "error", lastError)
						}
						if !waitImageRetry(ctx, streamRetryCount) {
							errCh <- ctx.Err()
							return
						}
						continue
					}
					errCh <- newSentinelSolverGenerationError(lastError)
					return
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
