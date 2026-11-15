package protocol

import (
	"context"
	"strings"

	"chatgpt2api/internal/util"
)

type StreamResult struct {
	Items <-chan map[string]any
	Err   <-chan error
	Kind  string
}

const xmlToolRule = "Tool output adapter: when calling tools, output ONLY this XML and no prose/markdown:\n<tool_calls><tool_call><tool_name>TOOL_NAME</tool_name><parameters><PARAM><![CDATA[value]]></PARAM></parameters></tool_call></tool_calls>"

func normalizeDirectImageModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" || model == util.ImageModelAuto {
		return util.ImageModelGPT26Flare
	}
	return model
}

func (e *Engine) normalizeDirectImageModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" || model == util.ImageModelAuto {
		if cfg, ok := e.Config.(imageModelConfig); ok {
			return normalizeDirectImageModel(cfg.ImageDefaultModel())
		}
		return util.ImageModelGPT26Flare
	}
	return normalizeDirectImageModel(model)
}

func (e *Engine) applyPictureModelRouting(request *ConversationRequest) {
	if request == nil || !util.IsGPTImageModel(request.Model) || request.ResponsesImageTool {
		return
	}
	// Explicit Images 2.5 / 2.6 selections are real Web slugs. Keep them out of
	// the legacy gpt-image-2 configurable route and do not switch models on retry.
	if model, ok := util.CanonicalWebImageModel(request.Model); ok {
		request.UpstreamModel = model
		request.FallbackModels = nil
		return
	}
	request.UpstreamModel = util.ImageModelGPT53
	if cfg, ok := e.Config.(imageModelConfig); ok {
		request.UpstreamModel = firstNonEmpty(strings.TrimSpace(cfg.ImageInternalModelSlug()), util.ImageModelGPT53)
		if cfg.ImageFallbackModelEnabled() {
			request.FallbackModels = cfg.ImageFallbackModelSlugs()
		}
	}
}

func channelFormatsAllowGIF(raw any) bool {
	switch values := raw.(type) {
	case []string:
		for _, v := range values {
			if strings.EqualFold(strings.TrimSpace(v), "gif") {
				return true
			}
		}
	case []any:
		for _, v := range values {
			if strings.EqualFold(strings.TrimSpace(util.Clean(v)), "gif") {
				return true
			}
		}
	}
	return false
}

func validateDirectImageOutputOptions(request ConversationRequest, stream bool, body ...map[string]any) error {
	if request.OutputFormat != "gif" {
		return nil
	}
	if stream {
		return HTTPError{Status: 400, Message: "GIF output does not support stream=true"}
	}
	var payload map[string]any
	if len(body) > 0 {
		payload = body[0]
	}
	if !util.SupportsGIFOutputModel(request.Model) && !channelFormatsAllowGIF(payload["channel_formats"]) {
		return HTTPError{Status: 400, Message: "GIF output is not enabled for this image model"}
	}
	return nil
}

func optionalNormalizedImageOutputFormat(raw any) string {
	cleaned := strings.TrimSpace(util.Clean(raw))
	if cleaned == "" {
		return ""
	}
	return NormalizeImageOutputFormat(cleaned)
}

func (e *Engine) HandleImageGenerations(ctx context.Context, body map[string]any) (map[string]any, *StreamResult, error) {
	prompt := util.Clean(body["prompt"])
	if prompt == "" {
		return nil, nil, HTTPError{Status: 400, Message: "prompt is required"}
	}
	model := e.normalizeDirectImageModel(util.Clean(body["model"]))
	n, err := ParseImageCount(body["n"])
	if err != nil {
		return nil, nil, err
	}
	size := util.Clean(body["size"])
	quality := util.Clean(body["quality"])
	outputFormat := optionalNormalizedImageOutputFormat(body["output_format"])
	outputCompression, hasOutputCompression := normalizedImageOutputCompression(body["output_compression"])
	responseFormat := firstNonEmpty(util.Clean(body["response_format"]), "b64_json")
	baseURL := util.Clean(body["base_url"])
	request := ConversationRequest{
		Prompt:             prompt,
		Model:              model,
		Messages:           NormalizeMessages(util.AsMapSlice(body["messages"]), nil),
		N:                  n,
		Size:               size,
		Quality:            quality,
		OutputFormat:       outputFormat,
		FrameCount:         util.Clean(body["frame_count"]),
		FrameDurationMS:    util.Clean(body["frame_duration_ms"]),
		ResponseFormat:     responseFormat,
		BaseURL:            baseURL,
		OwnerID:            util.Clean(body["owner_id"]),
		OwnerName:          util.Clean(body["owner_name"]),
		MessageAsError:     true,
		RequirePaidAccount: RequiresPaidImageSize(size),
	}
	if hasOutputCompression {
		request.OutputCompression = &outputCompression
	}
	e.applyPictureModelRouting(&request)
	request = request.Normalized()
	stream := util.ToBool(body["stream"])
	if err := validateDirectImageOutputOptions(request, stream, body); err != nil {
		return nil, nil, err
	}
	outputs, errCh := e.StreamImageOutputsWithPool(ctx, request)
	if stream {
		return nil, &StreamResult{Items: StreamImageChunksContext(ctx, outputs), Err: errCh, Kind: "openai"}, nil
	}
	result, err := e.CollectImageOutputs(outputs, errCh)
	return result, nil, err
}

func (e *Engine) HandleImageEdits(ctx context.Context, body map[string]any, images []UploadedImage) (map[string]any, *StreamResult, error) {
	encoded := EncodeImages(images)
	if len(encoded) == 0 {
		return nil, nil, &ImageGenerationError{Message: "image is required", StatusCode: 502, Type: "server_error", Code: "upstream_error"}
	}
	size := util.Clean(body["size"])
	// Same bound as /v1/images/generations: every requested image drives a real
	// upstream generation against a leased account, so n must not be unbounded.
	n, err := ParseImageCount(body["n"])
	if err != nil {
		return nil, nil, err
	}
	request := ConversationRequest{
		Prompt:             util.Clean(body["prompt"]),
		Model:              e.normalizeDirectImageModel(util.Clean(body["model"])),
		N:                  n,
		Size:               size,
		Quality:            util.Clean(body["quality"]),
		OutputFormat:       optionalNormalizedImageOutputFormat(body["output_format"]),
		FrameCount:         util.Clean(body["frame_count"]),
		FrameDurationMS:    util.Clean(body["frame_duration_ms"]),
		ResponseFormat:     firstNonEmpty(util.Clean(body["response_format"]), "b64_json"),
		BaseURL:            util.Clean(body["base_url"]),
		OwnerID:            util.Clean(body["owner_id"]),
		OwnerName:          util.Clean(body["owner_name"]),
		Messages:           NormalizeMessages(util.AsMapSlice(body["messages"]), nil),
		Images:             encoded,
		MessageAsError:     true,
		RequirePaidAccount: RequiresPaidImageSize(size),
	}
	if compression, ok := normalizedImageOutputCompression(body["output_compression"]); ok {
		request.OutputCompression = &compression
	}
	e.applyPictureModelRouting(&request)
	request = request.Normalized()
	stream := util.ToBool(body["stream"])
	if err := validateDirectImageOutputOptions(request, stream, body); err != nil {
		return nil, nil, err
	}
	outputs, errCh := e.StreamImageOutputsWithPool(ctx, request)
	if stream {
		return nil, &StreamResult{Items: StreamImageChunksContext(ctx, outputs), Err: errCh, Kind: "openai"}, nil
	}
	result, err := e.CollectImageOutputs(outputs, errCh)
	return result, nil, err
}

func StreamImageChunks(outputs <-chan ImageOutput) <-chan map[string]any {
	return StreamImageChunksContext(context.Background(), outputs)
}

func StreamImageChunksContext(ctx context.Context, outputs <-chan ImageOutput) <-chan map[string]any {
	out := make(chan map[string]any)
	go func() {
		defer close(out)
		for {
			if ctx != nil {
				select {
				case output, ok := <-outputs:
					if !ok {
						return
					}
					select {
					case out <- output.Chunk():
					case <-ctx.Done():
						return
					}
				case <-ctx.Done():
					return
				}
			} else {
				output, ok := <-outputs
				if !ok {
					return
				}
				out <- output.Chunk()
			}
		}
	}()
	return out
}
