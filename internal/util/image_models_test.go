package util

import "testing"

func TestImageGenerationModelSetExcludesTextModels(t *testing.T) {
	for _, model := range []string{ImageModelAuto, ImageModelGPT, ImageModelGPT25, ImageModelGrokImagine, ImageModelGrokLite, "GPT-IMAGE-2.5"} {
		if !IsImageGenerationModel(model) {
			t.Fatalf("IsImageGenerationModel(%q) = false, want true", model)
		}
	}

	for _, model := range []string{
		ImageModelGPTMini,
		ImageModelGPT53Mini,
		ImageModelGPT5,
		ImageModelGPT51,
		ImageModelGPT52,
		ImageModelGPT53,
		ImageModelGPT54,
		ImageModelGPT55,
	} {
		if IsImageGenerationModel(model) {
			t.Fatalf("IsImageGenerationModel(%q) = true, want false", model)
		}
	}
}

func TestIsGrokImageModelPrefix(t *testing.T) {
	for _, model := range []string{
		ImageModelGrokImagine,
		ImageModelGrokLite,
		ImageModelGrokPro,
		ImageModelGrokEdit,
		"grok_imagine_x",
		"grok-imagine-video",
	} {
		if !IsGrokImageModel(model) {
			t.Fatalf("IsGrokImageModel(%q) = false, want true", model)
		}
	}
	// Chat / console models are Grok but not image-generation models.
	for _, model := range []string{
		"", "gpt-image-2", "auto", "gpt-5.5", "codex-gpt-image-2",
		"grok-4.20-fast", "grok-4.20-auto", "grok-4.20-expert", "grok-4.3-beta",
		"grok-custom-alias",
	} {
		if IsGrokImageModel(model) {
			t.Fatalf("IsGrokImageModel(%q) = true, want false", model)
		}
	}
	if !IsGrokChatModel("grok-4.20-fast") {
		t.Fatal("IsGrokChatModel(grok-4.20-fast) = false, want true")
	}
	if IsGrokChatModel(ImageModelGrokImagine) {
		t.Fatal("IsGrokChatModel(imagine) = true, want false")
	}
}

func TestResponsesImageToolModelsIncludeTextModels(t *testing.T) {
	for _, model := range []string{ImageModelAuto, ImageModelGPT, ImageModelGPT25, ImageModelGPT5, ImageModelGPT54, ImageModelGPT55, "GPT-IMAGE-2.5-FLARE"} {
		if !IsResponsesImageToolModel(model) {
			t.Fatalf("IsResponsesImageToolModel(%q) = false, want true", model)
		}
	}
	if IsResponsesImageToolModel(ImageModelGrokImagine) {
		t.Fatalf("IsResponsesImageToolModel(grok) = true, want false")
	}
	if IsImageGenerationModel(ImageModelGPT55) {
		t.Fatalf("IsImageGenerationModel(%q) = true, want false for /v1/images routes", ImageModelGPT55)
	}
}

func TestUsesResponseImageCreationTaskMatrix(t *testing.T) {
	// Must stay aligned with web usesResponseImageTaskModel / resolveCreationTaskRoute.
	cases := []struct {
		model string
		want  bool
	}{
		{ImageModelAuto, false},
		{ImageModelGPT, false},
		{ImageModelGrokImagine, false},
		{ImageModelGrokEdit, false},
		{ImageModelGPTMini, true},
		{ImageModelGPT53Mini, true},
		{ImageModelGPT5, true},
		{ImageModelGPT51, true},
		{ImageModelGPT52, true},
		{ImageModelGPT53, true},
		{ImageModelGPT54, true},
		{ImageModelGPT55, true},
		{"unknown-model", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := UsesResponseImageCreationTask(tc.model); got != tc.want {
			t.Fatalf("UsesResponseImageCreationTask(%q) = %v, want %v", tc.model, got, tc.want)
		}
	}
}

func TestResolveCreationTaskRouteMatrix(t *testing.T) {
	cases := []struct {
		mode     string
		model    string
		hasRefs  bool
		wantPath string
	}{
		{"chat", ImageModelGPT55, false, CreationTaskRouteChat},
		{"generate", ImageModelAuto, false, CreationTaskRouteImageGenerations},
		{"generate", ImageModelGPT, false, CreationTaskRouteImageGenerations},
		{"generate", ImageModelGrokImagine, false, CreationTaskRouteImageGenerations},
		{"generate", ImageModelGPT55, false, CreationTaskRouteResponseImage},
		{"generate", ImageModelGPT, true, CreationTaskRouteImageEdits},
		{"edit", ImageModelGPT, true, CreationTaskRouteImageEdits},
		{"image", ImageModelGPT, true, CreationTaskRouteImageEdits},
		{"generate", ImageModelGrokEdit, false, CreationTaskRouteImageEdits},
		{"edit", ImageModelGrokImagine, true, CreationTaskRouteImageEdits},
		// Response-image models win even with reference images.
		{"edit", ImageModelGPT55, true, CreationTaskRouteResponseImage},
	}
	for _, tc := range cases {
		got := ResolveCreationTaskRoute(tc.mode, tc.model, tc.hasRefs)
		if got != tc.wantPath {
			t.Fatalf("ResolveCreationTaskRoute(%q,%q,%v) = %q, want %q",
				tc.mode, tc.model, tc.hasRefs, got, tc.wantPath)
		}
	}
}

func TestModelListIncludesTextAndImageModels(t *testing.T) {
	got := map[string]struct{}{}
	for _, model := range ModelList() {
		got[model] = struct{}{}
	}

	for _, model := range []string{
		ImageModelAuto,
		ImageModelGPT,
		ImageModelGPT25,
		ImageModelGPT25Flare,
		ImageModelGPT25Sunburst,
		ImageModelGrokImagine,
		ImageModelGPTMini,
		ImageModelGPT53Mini,
		ImageModelGPT5,
		ImageModelGPT53,
		ImageModelGPT54,
		ImageModelGPT55,
		ChatModelGPT45,
		ChatModelGPT4o,
		ChatModelGrok45,
		"grok-4.20-fast",
	} {
		if _, ok := got[model]; !ok {
			t.Fatalf("ModelList() missing %q; full=%#v", model, ModelList())
		}
	}
}
