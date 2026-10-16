package httpapi

import (
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

// resolveChannel mirrors App.resolveImageChannel without constructing a full App.
func resolveChannel(provider, model string) string {
	if util.IsGrokImageModel(model) {
		return imageProviderGrokNative
	}
	if provider == imageProviderProxyAPI {
		return imageProviderProxyAPI
	}
	return imageProviderAccountPool
}

func TestResolveImageChannelByModel(t *testing.T) {
	// Default GPT path is account pool.
	if got := resolveChannel(imageProviderAccountPool, util.ImageModelGPT); got != imageProviderAccountPool {
		t.Fatalf("gpt channel = %q, want %q", got, imageProviderAccountPool)
	}
	if got := resolveChannel(imageProviderAccountPool, util.ImageModelAuto); got != imageProviderAccountPool {
		t.Fatalf("auto channel = %q, want %q", got, imageProviderAccountPool)
	}

	// Grok Imagine models always use native 号池 sidecar (no external relay).
	// Chat models (grok-4.20-*) are not image-channel routes.
	for _, model := range []string{util.ImageModelGrokImagine, util.ImageModelGrokLite, "grok-imagine-custom"} {
		if got := resolveChannel(imageProviderAccountPool, model); got != imageProviderGrokNative {
			t.Fatalf("grok channel(%q) = %q, want %q", model, got, imageProviderGrokNative)
		}
		if got := resolveChannel(imageProviderProxyAPI, model); got != imageProviderGrokNative {
			t.Fatalf("grok with GPT proxy still %q, got %q", imageProviderGrokNative, got)
		}
	}
	if got := resolveChannel(imageProviderAccountPool, "grok-4.20-fast"); got == imageProviderGrokNative {
		t.Fatalf("chat model should not use image grok-native channel, got %q", got)
	}

	// GPT proxy_api only affects non-Grok models.
	if got := resolveChannel(imageProviderProxyAPI, util.ImageModelGPT); got != imageProviderProxyAPI {
		t.Fatalf("gpt with proxy_api = %q, want %q", got, imageProviderProxyAPI)
	}
	if got := resolveChannel(imageProviderProxyAPI, util.ImageModelGrokImagine); got != imageProviderGrokNative {
		t.Fatalf("grok with GPT proxy_api = %q, want %q", got, imageProviderGrokNative)
	}
}

func TestImageChatRequestDetectsGrok(t *testing.T) {
	if !protocol.IsImageChatRequest(map[string]any{"model": util.ImageModelGrokImagine}) {
		t.Fatal("expected grok model chat body to be treated as image chat")
	}
}

func TestValidateGrokImageResolution(t *testing.T) {
	body := map[string]any{"image_resolution": "auto"}
	if err := validateGrokImageResolution(body, util.ImageModelGrokImagine, false); err != nil || body["image_resolution"] != "1k" {
		t.Fatalf("auto resolution body=%#v err=%v", body, err)
	}
	if err := validateGrokImageResolution(map[string]any{"image_resolution": "4k"}, util.ImageModelGrokImagine, false); err == nil {
		t.Fatal("unsupported Grok 4K resolution was accepted")
	}
	if err := validateGrokImageResolution(map[string]any{"image_resolution": "2k"}, util.ImageModelGrokImagine, true); err == nil {
		t.Fatal("Grok Web 2K edit was accepted")
	}
}

func TestValidateGPTImageGenerationResolution(t *testing.T) {
	body := map[string]any{"image_resolution": "auto"}
	if err := validateImageGenerationResolution(body, util.ImageModelGPT, false); err != nil || body["image_resolution"] != "1k" {
		t.Fatalf("GPT auto resolution body=%#v err=%v", body, err)
	}
	if err := validateImageGenerationResolution(map[string]any{"image_resolution": "2k"}, util.ImageModelGPT, false); err == nil {
		t.Fatal("GPT 2K resolution was accepted")
	}
	if err := validateImageGenerationResolution(map[string]any{"image_resolution": "1k"}, util.ImageModelGPT, false); err != nil {
		t.Fatalf("GPT 1K resolution rejected: %v", err)
	}
}
