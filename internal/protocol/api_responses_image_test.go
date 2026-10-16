package protocol

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"chatgpt2api/internal/util"
)

func TestResponsesInputKeepsAssistantAndGeneratedImageContext(t *testing.T) {
	imageData := base64.StdEncoding.EncodeToString([]byte("previous-image"))
	input := []any{
		map[string]any{"type": "message", "role": "assistant", "content": []any{
			map[string]any{"type": "output_text", "text": "上一轮说明"},
		}},
		map[string]any{"type": "image_generation_call", "status": "completed", "result": imageData, "revised_prompt": "一只红色猫"},
		map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "input_text", "text": "把它改成蓝色"},
		}},
	}
	messages := MessagesFromInput(input, "保持同一角色")
	if len(messages) != 4 {
		t.Fatalf("MessagesFromInput() = %#v", messages)
	}
	if messages[0]["role"] != "system" || messages[1]["role"] != "assistant" || messages[2]["role"] != "assistant" || messages[3]["role"] != "user" {
		t.Fatalf("unexpected message roles: %#v", messages)
	}
	if got := LatestUserPrompt(messages); got != "把它改成蓝色" {
		t.Fatalf("LatestUserPrompt() = %q", got)
	}
	images := ExtractResponseImages(input)
	if len(images) != 1 || string(images[0].Data) != "previous-image" {
		t.Fatalf("ExtractResponseImages() = %#v", images)
	}
}

func TestResponseImageGenerationRequestUsesTextModelAndToolParams(t *testing.T) {
	body := map[string]any{
		"model": "gpt-5.5",
		"input": "生成封面",
		"tools": []any{
			map[string]any{"type": "image_generation", "size": "16:9", "quality": "high", "output_format": "webp", "output_compression": 37},
		},
	}
	request, prompt, err := ResponseImageGenerationRequest(body, "linuxdo:1", nil)
	if err != nil {
		t.Fatalf("ResponseImageGenerationRequest() error = %v", err)
	}
	if prompt != "生成封面" {
		t.Fatalf("prompt = %q, want 生成封面", prompt)
	}
	if request.Model != "gpt-5.5" {
		t.Fatalf("model = %q, want gpt-5.5", request.Model)
	}
	if !request.ResponsesImageTool {
		t.Fatal("ResponsesImageTool = false, want true")
	}
	if !request.SupportsImageGenerationModel() {
		t.Fatal("request should support image generation with gpt-5.5 responses image tool")
	}
	if request.Size != "16:9" || request.Quality != "high" {
		t.Fatalf("request size/quality = %q/%q, want 16:9/high", request.Size, request.Quality)
	}
	if request.ResponseFormat != "b64_json" {
		t.Fatalf("response format = %q, want b64_json", request.ResponseFormat)
	}
	if request.OutputFormat != "webp" {
		t.Fatalf("output format = %q, want webp", request.OutputFormat)
	}
	if request.OutputCompression == nil || *request.OutputCompression != 37 {
		t.Fatalf("output compression = %#v, want 37", request.OutputCompression)
	}
}

func TestResponseImageGenerationToolAcceptsTypedToolSlice(t *testing.T) {
	body := map[string]any{
		"model": "gpt-image-2",
		"input": "生成封面",
		"tools": []map[string]any{
			{"type": "image_generation", "size": "2880x2880", "output_format": "png"},
		},
	}
	if !HasResponseImageGenerationTool(body) {
		t.Fatal("typed []map[string]any tools should route as responses image generation")
	}
	request, prompt, err := ResponseImageGenerationRequest(body, "admin", nil)
	if err != nil {
		t.Fatalf("ResponseImageGenerationRequest() error = %v", err)
	}
	if prompt != "生成封面" {
		t.Fatalf("prompt = %q, want 生成封面", prompt)
	}
	if request.ResponsesImageTool {
		t.Fatal("ResponsesImageTool = true, want false for gpt-image-2 picture_v2 route")
	}
	if request.Size != "2880x2880" {
		t.Fatalf("request size = %q, want 2880x2880", request.Size)
	}
	if !request.RequirePaidAccount {
		t.Fatal("RequirePaidAccount = false, want true for 2880x2880")
	}
}

func TestResponseImageGenerationRequestDefaultsImageModelForAuto(t *testing.T) {
	body := map[string]any{
		"model": "auto",
		"input": "生成封面",
		"tools": []any{
			map[string]any{"type": "image_generation"},
		},
	}
	request, _, err := ResponseImageGenerationRequest(body, "", nil)
	if err != nil {
		t.Fatalf("ResponseImageGenerationRequest() error = %v", err)
	}
	if request.Model != util.ImageModelGPT {
		t.Fatalf("model = %q, want %q", request.Model, util.ImageModelGPT)
	}
	if request.ResponsesImageTool {
		t.Fatal("ResponsesImageTool = true, want false for auto picture_v2 route")
	}
	if request.Size != "auto" {
		t.Fatalf("size = %q, want auto", request.Size)
	}
}

func TestResponsesImageToolPayloadUsesGPT55ForImageOnlyModel(t *testing.T) {
	request := ConversationRequest{
		Model:        "gpt-image-2",
		Prompt:       "生成 2K 正方形封面",
		Size:         "2048x2048",
		Quality:      "high",
		OutputFormat: "png",
	}.Normalized()
	payload := ResponsesImageToolPayload(request)
	if payload["model"] != responsesImageMainModelDefault {
		t.Fatalf("payload model = %#v, want %s", payload["model"], responsesImageMainModelDefault)
	}
	tools := payload["tools"].([]map[string]any)
	tool := tools[0]
	if tool["model"] != "gpt-image-2" {
		t.Fatalf("tool model = %#v, want gpt-image-2", tool["model"])
	}
	if _, ok := payload["tool_choice"]; ok {
		t.Fatalf("payload tool_choice = %#v, want omitted for native image-only models", payload["tool_choice"])
	}
	input := payload["input"].([]map[string]any)
	content := input[0]["content"].([]map[string]any)
	text := util.Clean(content[0]["text"])
	if !strings.HasPrefix(text, responsesImagePromptGuardPrefix+"\n") || !strings.Contains(text, "生成 2K 正方形封面") {
		t.Fatalf("payload prompt missing guard: %q", text)
	}
}

func TestResponsesImageToolPayloadCarriesExactSize(t *testing.T) {
	request := ConversationRequest{
		Model:             "gpt-5.5",
		Prompt:            "生成 4K 正方形封面",
		Size:              "2880x2880",
		Quality:           "high",
		OutputFormat:      "jpeg",
		OutputCompression: ptrInt(28),
	}.Normalized()
	payload := ResponsesImageToolPayload(request)
	tools := payload["tools"].([]map[string]any)
	if len(tools) != 1 {
		t.Fatalf("tools = %#v", payload["tools"])
	}
	tool := tools[0]
	if tool["size"] != "2880x2880" {
		t.Fatalf("tool size = %#v, want 2880x2880", tool["size"])
	}
	if tool["quality"] != "high" {
		t.Fatalf("tool quality = %#v, want high", tool["quality"])
	}
	if tool["output_format"] != "jpeg" {
		t.Fatalf("tool output_format = %#v, want jpeg", tool["output_format"])
	}
	if tool["output_compression"] != 28 {
		t.Fatalf("tool output_compression = %#v, want 28", tool["output_compression"])
	}
	if tool["model"] != nil {
		t.Fatalf("text-model request should not set image tool model: %#v", tool["model"])
	}
	if payload["model"] != "gpt-5.5" {
		t.Fatalf("payload model = %#v, want gpt-5.5", payload["model"])
	}
	choice, ok := payload["tool_choice"].(map[string]any)
	if !ok || util.Clean(choice["type"]) != "image_generation" {
		t.Fatalf("payload tool_choice = %#v, want image_generation", payload["tool_choice"])
	}
	instructions, ok := payload["instructions"].(string)
	if !ok || !strings.Contains(instructions, responsesImageToolBridgeMarker) {
		t.Fatalf("payload instructions missing image bridge: %#v", payload["instructions"])
	}
}

func TestResponsesImageToolPayloadKeepsGPTImageQuality(t *testing.T) {
	request := ConversationRequest{
		Model:        "gpt-image-2",
		Prompt:       "生成封面",
		Size:         "3840x2160",
		Quality:      "high",
		OutputFormat: "png",
	}.Normalized()
	payload := ResponsesImageToolPayload(request)
	tools := payload["tools"].([]map[string]any)
	tool := tools[0]
	if tool["model"] != "gpt-image-2" {
		t.Fatalf("tool model = %#v, want gpt-image-2", tool["model"])
	}
	if tool["quality"] != "high" {
		t.Fatalf("tool quality = %#v, want high", tool["quality"])
	}
	if payload["model"] != responsesImageMainModelDefault {
		t.Fatalf("payload model = %#v, want %s", payload["model"], responsesImageMainModelDefault)
	}
}

func TestToolCallParsing(t *testing.T) {
	text := `先处理
<tool_calls><tool_call><tool_name>read_file</tool_name><parameters><path><![CDATA[internal/app.go]]></path><limit>5</limit></parameters></tool_call></tool_calls>`
	calls := ParseToolCalls(text)
	if len(calls) != 1 {
		t.Fatalf("ParseToolCalls() = %#v", calls)
	}
	if calls[0].Name != "read_file" {
		t.Fatalf("tool name = %q", calls[0].Name)
	}
	if calls[0].Input["path"] != "internal/app.go" || calls[0].Input["limit"] != float64(5) {
		t.Fatalf("tool input = %#v", calls[0].Input)
	}
	if visible := StreamableText(text); visible != "先处理" {
		t.Fatalf("StreamableText() = %q", visible)
	}
	if stripped := StripToolMarkup(text); stripped != "先处理" {
		t.Fatalf("StripToolMarkup() = %q", stripped)
	}
}

func TestStreamImageResponseErrorsWhenNoImageOutput(t *testing.T) {
	outputs := make(chan ImageOutput)
	close(outputs)
	events, errCh := StreamImageResponse(outputs, "draw", "gpt-image-2")
	var count int
	for range events {
		count++
	}
	if count != 1 {
		t.Fatalf("event count = %d, want response.created only", count)
	}
	if err := <-errCh; err == nil || err.Error() != "image generation failed" {
		t.Fatalf("err = %v", err)
	}
}

func TestCollectImageOutputsMarksTextResponse(t *testing.T) {
	outputs := make(chan ImageOutput)
	close(outputs)
	errCh := make(chan error, 1)
	errCh <- &ImageGenerationError{Message: "text response", StatusCode: 400, Type: "invalid_request_error", Code: "image_generation_text_response"}
	close(errCh)

	result, err := (&Engine{}).CollectImageOutputs(outputs, errCh)
	if err == nil {
		t.Fatal("CollectImageOutputs() err = nil, want text response error")
	}
	if result["output_type"] != "text" {
		t.Fatalf("output_type = %#v, want text in %#v", result["output_type"], result)
	}
	if result["message"] != "text response" {
		t.Fatalf("message = %#v, want text response", result["message"])
	}
}

func TestStreamTextResponseEventsPropagatesUpstreamError(t *testing.T) {
	deltas := make(chan string, 1)
	upstreamErr := make(chan error, 1)
	deltas <- "partial"
	close(deltas)
	upstreamErr <- errors.New("upstream failed")
	close(upstreamErr)

	events, errCh := streamTextResponseEvents(context.Background(), "auto", deltas, upstreamErr)
	var types []string
	for event := range events {
		if eventType, ok := event["type"].(string); ok {
			types = append(types, eventType)
		}
	}
	if err := <-errCh; err == nil || err.Error() != "upstream failed" {
		t.Fatalf("err = %v, want upstream failed", err)
	}
	for _, eventType := range types {
		if eventType == "response.completed" || eventType == "response.output_text.done" {
			t.Fatalf("unexpected completion event after upstream error: %v", types)
		}
	}
}

func TestHandleImageGenerationsValidatesPromptAndCount(t *testing.T) {
	engine := &Engine{}
	for _, tc := range []struct {
		name string
		body map[string]any
		want string
	}{
		{name: "empty prompt", body: map[string]any{"n": 1}, want: "prompt is required"},
		{name: "too many images", body: map[string]any{"prompt": "draw", "n": 5}, want: "n must be between 1 and 4"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := engine.HandleImageGenerations(context.Background(), tc.body)
			var httpErr HTTPError
			if !errors.As(err, &httpErr) {
				t.Fatalf("err = %T %v, want HTTPError", err, err)
			}
			if httpErr.Status != 400 || httpErr.Message != tc.want {
				t.Fatalf("HTTPError = %#v, want status 400 message %q", httpErr, tc.want)
			}
		})
	}
}

func TestApplyImageOutputOptionsToRequest(t *testing.T) {
	jpegRequest := ConversationRequest{}
	applyImageOutputOptionsToRequest(&jpegRequest, ImageOutputOptions{Format: "jpeg", Compression: ptrInt(25)})
	jpegRequest = jpegRequest.Normalized()
	if jpegRequest.OutputFormat != "jpeg" || jpegRequest.OutputCompression == nil || *jpegRequest.OutputCompression != 25 {
		t.Fatalf("jpeg output options = %#v/%#v, want jpeg/25", jpegRequest.OutputFormat, jpegRequest.OutputCompression)
	}

	pngRequest := ConversationRequest{}
	applyImageOutputOptionsToRequest(&pngRequest, ImageOutputOptions{Format: "png", Compression: ptrInt(25)})
	pngRequest = pngRequest.Normalized()
	if pngRequest.OutputFormat != "png" || pngRequest.OutputCompression != nil {
		t.Fatalf("png output options = %#v/%#v, want png/nil", pngRequest.OutputFormat, pngRequest.OutputCompression)
	}
}

func TestMergeSystemUsesCompactToolRuleForClaudeCode(t *testing.T) {
	merged := MergeSystem("You are Claude Code, an agent.", "Available tools:\nTool: read_file\n\nTool use rules:\nverbose")
	text, ok := merged.(string)
	if !ok {
		t.Fatalf("MergeSystem() = %T, want string", merged)
	}
	if strings.Contains(text, "Available tools:") {
		t.Fatalf("MergeSystem() kept verbose tool prompt: %q", text)
	}
	if !strings.Contains(text, "Tool output adapter") || !strings.Contains(text, "<tool_calls>") {
		t.Fatalf("MergeSystem() missing compact XML rule: %q", text)
	}
}
