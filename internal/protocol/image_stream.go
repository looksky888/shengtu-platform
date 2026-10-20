package protocol

import (
	"context"
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
