package protocol

import (
	"context"
	"encoding/base64"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func ptrInt(value int) *int {
	return &value
}

func TestChatAndResponsesImageParsing(t *testing.T) {
	imageData := base64.StdEncoding.EncodeToString([]byte("png-bytes"))
	body := map[string]any{
		"model": "gpt-image-2",
		"messages": []any{
			map[string]any{"role": "system", "content": "ignore"},
			map[string]any{"role": "user", "content": []any{
				map[string]any{"type": "text", "text": "画一张图"},
				map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/png;base64," + imageData}},
			}},
		},
		"n": 2,
	}

	model, prompt, n, images, messages, err := ChatImageArgs(body)
	if err != nil {
		t.Fatalf("ChatImageArgs() error = %v", err)
	}
	if model != "gpt-image-2" || prompt != "画一张图" || n != 2 {
		t.Fatalf("ChatImageArgs() = model %q prompt %q n %d", model, prompt, n)
	}
	if len(messages) != 2 || messages[1]["content"] != "画一张图" {
		t.Fatalf("messages = %#v", messages)
	}
	if len(images) != 1 || string(images[0].Data) != "png-bytes" || images[0].ContentType != "image/png" {
		t.Fatalf("images = %#v", images)
	}

	responseInput := []any{
		map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "input_text", "text": "生成封面"},
			map[string]any{"type": "input_image", "image_url": "data:image/png;base64," + imageData},
		}},
	}
	if prompt := ExtractResponsePrompt(responseInput); prompt != "生成封面" {
		t.Fatalf("ExtractResponsePrompt() = %q", prompt)
	}
	if image := ExtractResponseImage(responseInput); image == nil || string(image.Data) != "png-bytes" {
		t.Fatalf("ExtractResponseImage() = %#v", image)
	}
}

func TestImageRequestDefaultsToAutoModel(t *testing.T) {
	body := map[string]any{
		"messages": []any{
			map[string]any{"role": "user", "content": "画一张图"},
		},
	}
	model, prompt, n, _, _, err := ChatImageArgs(body)
	if err != nil {
		t.Fatalf("ChatImageArgs() error = %v", err)
	}
	if model != "auto" || prompt != "画一张图" || n != 1 {
		t.Fatalf("ChatImageArgs() = model %q prompt %q n %d", model, prompt, n)
	}
}

func TestTextModelDoesNotForceImageChatRoute(t *testing.T) {
	if IsImageChatRequest(map[string]any{"model": "gpt-5", "messages": []any{map[string]any{"role": "user", "content": "hello"}}}) {
		t.Fatal("gpt-5 text chat should not be routed as an image request without image modality")
	}
	if !IsImageChatRequest(map[string]any{"model": "gpt-5", "modalities": []any{"image"}, "messages": []any{map[string]any{"role": "user", "content": "draw"}}}) {
		t.Fatal("gpt-5 with image modality should be routed as an image request")
	}
	if !IsImageChatRequest(map[string]any{"model": util.ImageModelGrokImagine, "messages": []any{map[string]any{"role": "user", "content": "draw"}}}) {
		t.Fatal("grok image model should force image chat route")
	}
}

func TestBuildChatImageMarkdownIncludesURL(t *testing.T) {
	content := BuildChatImageMarkdownContent(map[string]any{
		"data": []map[string]any{{"url": "https://example.com/a.png"}},
	})
	if !strings.Contains(content, "https://example.com/a.png") {
		t.Fatalf("markdown missing url: %q", content)
	}
}

func TestListModelsUsesInjectedLister(t *testing.T) {
	called := false
	engine := &Engine{
		ListModelsFunc: func(context.Context) (map[string]any, error) {
			called = true
			return map[string]any{
				"object": "list",
				"data": []map[string]any{
					{"id": "custom-model", "object": "model"},
				},
			}, nil
		},
	}

	result, err := engine.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels() error = %v", err)
	}
	if !called {
		t.Fatal("ListModelsFunc was not called")
	}
	data, _ := result["data"].([]map[string]any)
	if len(data) == 0 || data[0]["id"] != "custom-model" {
		t.Fatalf("ListModels() data = %#v", result["data"])
	}
}

func TestListModelsAdvertisesWebImagesOnlyWhenAccountsExist(t *testing.T) {
	lister := func(context.Context) (map[string]any, error) {
		return map[string]any{"object": "list", "data": []map[string]any{}}, nil
	}
	assertWebModels := func(t *testing.T, result map[string]any, want bool) {
		t.Helper()
		seen := map[string]bool{}
		for _, item := range util.AsMapSlice(result["data"]) {
			seen[util.Clean(item["id"])] = true
		}
		for _, model := range []string{util.ImageModelGPT, util.ImageModelGPT25, util.ImageModelGPT25Flare, util.ImageModelGPT25Sunburst} {
			if seen[model] != want {
				t.Fatalf("model %q advertised=%v, want %v", model, seen[model], want)
			}
		}
	}

	without, err := (&Engine{ListModelsFunc: lister}).ListModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	assertWebModels(t, without, false)

	dir := t.TempDir()
	accounts := service.NewAccountService(storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "keys.json")), cooldownTestConfig{}, nil, service.NewLogService(dir))
	accounts.AddAccounts([]string{"fixture-account"})
	with, err := (&Engine{Accounts: accounts, ListModelsFunc: lister}).ListModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	assertWebModels(t, with, true)
}

func TestListModelsPreservesExistingImageModelEntry(t *testing.T) {
	original := map[string]any{"id": util.ImageModelGPT25Flare, "object": "model", "owned_by": "upstream"}
	engine := &Engine{ListModelsFunc: func(context.Context) (map[string]any, error) {
		return map[string]any{"object": "list", "data": []map[string]any{original}}, nil
	}}
	result, err := engine.ListModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	matches := 0
	for _, item := range util.AsMapSlice(result["data"]) {
		if util.Clean(item["id"]) == util.ImageModelGPT25Flare {
			matches++
			if item["owned_by"] != "upstream" {
				t.Fatalf("existing entry replaced: %#v", item)
			}
		}
	}
	if matches != 1 {
		t.Fatalf("matches = %d, want 1", matches)
	}
}

func TestImageContextPromptIncludesHistory(t *testing.T) {
	messages := []map[string]any{
		{"role": "system", "content": "保持水彩风格"},
		{"role": "user", "content": "画一只白猫"},
		{"role": "assistant", "content": "Generated image: 白猫坐在窗边"},
		{"role": "user", "content": "把它改成夜晚"},
	}
	prompt := BuildImageContextPrompt(messages, LatestUserPrompt(messages), "1:1", "high")
	for _, want := range []string{"保持水彩风格", "画一只白猫", "白猫坐在窗边", "当前请求:\n把它改成夜晚", "输出为 1:1", "画质使用 High 档"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("context prompt missing %q: %s", want, prompt)
		}
	}
}

func TestBuildImageRequestPromptIsolatesHistoryWhenReferencesAreExplicit(t *testing.T) {
	messages := []map[string]any{
		{"role": "user", "content": "画一位女性肖像"},
		{"role": "assistant", "content": "Generated image: 女性肖像"},
		{"role": "user", "content": "画一只狗和茶具"},
	}
	prompt := BuildImageRequestPrompt(messages, "科幻医疗中心的等距场景，禁止人物、生物和文字", []string{"data:image/png;base64,cmVm"}, "16:9", "high")
	for _, unwanted := range []string{"女性肖像", "画一只狗", "茶具", "历史上下文"} {
		if strings.Contains(prompt, unwanted) {
			t.Fatalf("reference-image prompt leaked history %q: %s", unwanted, prompt)
		}
	}
	for _, want := range []string{"科幻医疗中心", "16:9 横屏构图", "画质使用 High 档"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("reference-image prompt missing %q: %s", want, prompt)
		}
	}
}

func TestBuildImageRequestPromptKeepsHistoryWithoutExplicitReferences(t *testing.T) {
	messages := []map[string]any{
		{"role": "user", "content": "画一只白猫"},
		{"role": "assistant", "content": "Generated image: 白猫坐在窗边"},
		{"role": "user", "content": "把它改成夜晚"},
	}
	prompt := BuildImageRequestPrompt(messages, "把它改成夜晚", nil, "1:1", "high")
	for _, want := range []string{"画一只白猫", "白猫坐在窗边", "当前请求:\n把它改成夜晚"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("continuation prompt missing %q: %s", want, prompt)
		}
	}
}

func TestBuildImagePromptIncludesThreeTwoAndQualityHints(t *testing.T) {
	prompt := BuildImagePrompt("画一张产品照片", "3:2", "medium")
	for _, want := range []string{"画一张产品照片", "3:2 横版构图", "画质使用 Medium 档"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("image prompt missing %q: %s", want, prompt)
		}
	}
}

func TestBuildImagePromptIncludesExactResolutionHint(t *testing.T) {
	prompt := BuildImagePrompt("画一张城市海报", "3840x2160", "high")
	for _, want := range []string{"画一张城市海报", "3840 x 2160 像素", "画质使用 High 档"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("image prompt missing %q: %s", want, prompt)
		}
	}
}

func TestGrokImageModelKeepsQualityPassthrough(t *testing.T) {
	request := ConversationRequest{
		Model:   util.ImageModelGrokImagine,
		Prompt:  "画一张产品照片",
		Size:    "3:2",
		Quality: "high",
	}.Normalized()
	if request.Quality != "high" {
		t.Fatalf("Normalized() quality = %q, want high for grok model", request.Quality)
	}
	if !util.IsGrokImageModel(request.Model) {
		t.Fatalf("model = %q, want grok", request.Model)
	}
}

func TestGPTImageModelKeepsQualityHint(t *testing.T) {
	request := ConversationRequest{
		Model:   "gpt-image-2",
		Prompt:  "画一张产品照片",
		Size:    "3:2",
		Quality: " high ",
	}.Normalized()
	if request.Quality != "high" {
		t.Fatalf("Normalized() quality = %q, want high", request.Quality)
	}
	prompt := BuildImagePrompt(request.Prompt, request.Size, request.Quality)
	if !strings.Contains(prompt, "画质使用 High 档") {
		t.Fatalf("gpt image prompt missing quality hint: %s", prompt)
	}
}

func TestNormalizeDirectImageModelMapsAutoToGPTImage25Flare(t *testing.T) {
	if got := normalizeDirectImageModel(util.ImageModelAuto); got != util.ImageModelGPT25Flare {
		t.Fatalf("normalizeDirectImageModel(auto) = %q, want %q", got, util.ImageModelGPT25Flare)
	}
	if got := normalizeDirectImageModel(""); got != util.ImageModelGPT25Flare {
		t.Fatalf("normalizeDirectImageModel(empty) = %q, want %q", got, util.ImageModelGPT25Flare)
	}
	if got := normalizeDirectImageModel(util.ImageModelGrokImagine); got != util.ImageModelGrokImagine {
		t.Fatalf("normalizeDirectImageModel(grok) = %q, want %q", got, util.ImageModelGrokImagine)
	}
}

func TestRequiresPaidImageSize(t *testing.T) {
	tests := []struct {
		name string
		size string
		want bool
	}{
		{name: "empty", size: "", want: false},
		{name: "aspect ratio", size: "16:9", want: false},
		{name: "free pixel budget", size: "1248x1248", want: false},
		{name: "1080p square below paid budget", size: "1080x1080", want: false},
		{name: "1080p tier below paid budget", size: "1080p", want: false},
		{name: "1080p widescreen above paid budget", size: "1920x1080", want: true},
		{name: "unicode multiplication sign", size: "1024×1824", want: true},
		{name: "2k tier", size: "2k", want: true},
		{name: "2k", size: "2560x1440", want: true},
		{name: "4k tier", size: "4k", want: true},
		{name: "4k", size: "3840x2160", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := RequiresPaidImageSize(tt.size); got != tt.want {
				t.Fatalf("RequiresPaidImageSize(%q) = %v, want %v", tt.size, got, tt.want)
			}
		})
	}
}

func TestNormalizeImageGenerationSizeTiers(t *testing.T) {
	tests := []struct {
		size string
		want string
	}{
		{size: "", want: ""},
		{size: "16:9", want: "16:9"},
		{size: "1080p", want: "1080x1080"},
		{size: " 2K ", want: "2048x2048"},
		{size: "4k", want: "2880x2880"},
		{size: "1536x2048", want: "1536x2048"},
	}

	for _, tt := range tests {
		t.Run(tt.size, func(t *testing.T) {
			if got := NormalizeImageGenerationSize(tt.size); got != tt.want {
				t.Fatalf("NormalizeImageGenerationSize(%q) = %q, want %q", tt.size, got, tt.want)
			}
		})
	}
}

func TestConversationRequestNormalizesResolutionTierSize(t *testing.T) {
	request := ConversationRequest{
		Model: "gpt-5.5",
		Size:  "2k",
	}.Normalized()
	if request.Size != "2048x2048" {
		t.Fatalf("Normalized() size = %q, want 2048x2048", request.Size)
	}
	if !request.RequirePaidAccount {
		t.Fatal("Normalized() RequirePaidAccount = false, want true for 2k tier")
	}
}

func TestBuildImagePromptNormalizesResolutionTierHint(t *testing.T) {
	prompt := BuildImagePrompt("画一张城市海报", "2k", "")
	if !strings.Contains(prompt, "2048 x 2048") {
		t.Fatalf("BuildImagePrompt() did not expand 2k tier to exact pixels: %s", prompt)
	}
}
