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
		return util.ImageModelGPT25Flare
	}
	return model
}

func (e *Engine) normalizeDirectImageModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" || model == util.ImageModelAuto {
		if cfg, ok := e.Config.(imageModelConfig); ok {
			return normalizeDirectImageModel(cfg.ImageDefaultModel())
		}
		return util.ImageModelGPT25Flare
	}
	return normalizeDirectImageModel(model)
}

func (e *Engine) applyPictureModelRouting(request *ConversationRequest) {
	if request == nil || !util.IsGPTImageModel(request.Model) || request.ResponsesImageTool {
		return
	}
	// Images 2.5 public aliases are routed by the Web image engine.  Keep this
	// mapping authoritative so a legacy IMAGE_INTERNAL_MODEL_SLUG environment
	// value cannot silently send 2.5 requests through an obsolete model.
	if model := strings.ToLower(strings.TrimSpace(request.Model)); model == util.ImageModelGPT25 || model == util.ImageModelGPT25Flare || model == util.ImageModelGPT25Sunburst {
		request.UpstreamModel = util.ImageModelAuto
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
	outputFormat := NormalizeImageOutputFormat(util.Clean(body["output_format"]))
	outputCompression, hasOutputCompression := normalizedImageOutputCompression(body["output_compression"])
	responseFormat := firstNonEmpty(util.Clean(body["response_format"]), "b64_json")
	baseURL := util.Clean(body["base_url"])
	request := ConversationRequest{Prompt: prompt, Model: model, Messages: NormalizeMessages(util.AsMapSlice(body["messages"]), nil), N: n, Size: size, Quality: quality, OutputFormat: outputFormat, ResponseFormat: responseFormat, BaseURL: baseURL, OwnerID: util.Clean(body["owner_id"]), OwnerName: util.Clean(body["owner_name"]), MessageAsError: true, RequirePaidAccount: RequiresPaidImageSize(size)}
	if hasOutputCompression {
		request.OutputCompression = &outputCompression
	}
	e.applyPictureModelRouting(&request)
	request = request.Normalized()
	outputs, errCh := e.StreamImageOutputsWithPool(ctx, request)
	if util.ToBool(body["stream"]) {
		return nil, &StreamResult{Items: StreamImageChunks(outputs), Err: errCh, Kind: "openai"}, nil
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
	request := ConversationRequest{
		Prompt:             util.Clean(body["prompt"]),
		Model:              e.normalizeDirectImageModel(util.Clean(body["model"])),
		N:                  util.ToInt(body["n"], 1),
		Size:               size,
		Quality:            util.Clean(body["quality"]),
		OutputFormat:       NormalizeImageOutputFormat(util.Clean(body["output_format"])),
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
	outputs, errCh := e.StreamImageOutputsWithPool(ctx, request)
	if util.ToBool(body["stream"]) {
		return nil, &StreamResult{Items: StreamImageChunks(outputs), Err: errCh, Kind: "openai"}, nil
	}
	result, err := e.CollectImageOutputs(outputs, errCh)
	return result, nil, err
}

func StreamImageChunks(outputs <-chan ImageOutput) <-chan map[string]any {
	out := make(chan map[string]any)
	go func() {
		defer close(out)
		for output := range outputs {
			out <- output.Chunk()
		}
	}()
	return out
}
