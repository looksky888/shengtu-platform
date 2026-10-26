package httpapi

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestImageTaskRouteMetadataDefaultsToAccountPool(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_PROVIDER", imageProviderAccountPool)
	cfg := newTestConfigStore(t)
	app := &App{config: cfg}

	metadata := app.imageTaskRouteMetadata(util.ImageModelGPT)
	if metadata["effective_provider"] != service.ImageTaskProviderAccountPool {
		t.Fatalf("effective_provider = %#v", metadata["effective_provider"])
	}
	if metadata["provider_source"] != "environment" {
		t.Fatalf("provider_source = %#v, want environment", metadata["provider_source"])
	}

	t.Setenv("CHATGPT2API_IMAGE_PROVIDER", imageProviderProxyAPI)
	if got := app.resolveImageChannel(util.ImageModelGPT); got != imageProviderAccountPool {
		t.Fatalf("model-only route = %q, want %q", got, imageProviderAccountPool)
	}
	if got := app.resolveImageChannelForTask(metadata, util.ImageModelGPT); got != imageProviderAccountPool {
		t.Fatalf("frozen task channel = %q, want %q", got, imageProviderAccountPool)
	}
}

func TestImageTaskRouteMetadataFreezesSelectedRelayAndResolutionPrice(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	channels, err := service.NewImageChannelService(dir, backend, service.ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("NewImageChannelService() error = %v", err)
	}
	channel, err := channels.CreateChannel(service.ImageChannelInput{
		Name: "Relay", Type: service.ImageChannelTypeOpenAICompatible, BaseURL: "https://relay.example.test/v1",
		APIKey: "relay-key", Enabled: true, MaxConcurrency: 2, TimeoutSeconds: 90, MaxRetries: 1,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	model, err := channels.CreateModel(channel.ID, service.ImageChannelModelInput{
		DisplayName: "Relay Image", UpstreamModel: "gpt-image-relay", Capabilities: []string{service.ImageCapabilityGenerate},
		Resolutions: []string{"1k", "2k"}, Formats: []string{"png"}, CreditCost: 5,
		CreditCosts: map[string]int{"1k": 5, "2k": 12}, Enabled: true,
	})
	if err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}
	metadata, err := (&App{imageChannels: channels}).imageTaskRouteMetadataForRequest(map[string]any{
		"channel_model_id": model.ID, "image_resolution": "2k",
	}, model.UpstreamModel, service.ImageCapabilityGenerate)
	if err != nil {
		t.Fatalf("imageTaskRouteMetadataForRequest() error = %v", err)
	}
	if metadata["effective_provider"] != service.ImageTaskProviderProxyAPI || metadata["effective_model"] != "gpt-image-relay" {
		t.Fatalf("route metadata = %#v", metadata)
	}
	if metadata["image_credit_cost"] != 12 || metadata["channel_max_concurrency"] != 2 {
		t.Fatalf("frozen metadata = %#v", metadata)
	}
}

func TestImageTaskRouteMetadataResolvesSystemModelWhenChannelModelIDMissing(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	channels, err := service.NewImageChannelService(dir, backend, service.ImageChannelLegacyConfig{
		GPTModelCosts: map[string]int{util.ImageModelGPT25Sunburst: 4},
	})
	if err != nil {
		t.Fatalf("NewImageChannelService() error = %v", err)
	}
	relay, err := channels.CreateChannel(service.ImageChannelInput{
		Name: "Same-name relay", Type: service.ImageChannelTypeOpenAICompatible,
		BaseURL: "https://relay.example.test/v1", APIKey: "relay-key", Enabled: true,
		MaxConcurrency: 2, TimeoutSeconds: 90, MaxRetries: 1,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	if _, err := channels.CreateModel(relay.ID, service.ImageChannelModelInput{
		DisplayName: "Relay Sunburst", UpstreamModel: util.ImageModelGPT25Sunburst,
		Capabilities: []string{service.ImageCapabilityGenerate, service.ImageCapabilityEdit},
		CreditCost:   99, Enabled: true,
	}); err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}

	metadata, err := (&App{imageChannels: channels}).imageTaskRouteMetadataForRequest(
		map[string]any{"image_resolution": "1k"},
		util.ImageModelGPT25Sunburst,
		service.ImageCapabilityEdit,
	)
	if err != nil {
		t.Fatalf("imageTaskRouteMetadataForRequest() error = %v", err)
	}
	if metadata["channel_model_id"] != "local-gpt-image-2-5-sunburst" {
		t.Fatalf("channel_model_id = %#v", metadata["channel_model_id"])
	}
	if metadata["effective_provider"] != service.ImageTaskProviderAccountPool {
		t.Fatalf("effective_provider = %#v", metadata["effective_provider"])
	}
	if metadata["image_credit_cost"] != 4 {
		t.Fatalf("image_credit_cost = %#v, want 4", metadata["image_credit_cost"])
	}
}

func TestImageTaskRouteMetadataUsesModelRouteForGrok(t *testing.T) {
	t.Setenv("GROK_RUNTIME_BASE_URL", "https://grok.example.test/v1")
	cfg := newTestConfigStore(t)
	metadata := (&App{config: cfg}).imageTaskRouteMetadata(util.ImageModelGrokImagine)

	if metadata["effective_provider"] != service.ImageTaskProviderGrokRuntime {
		t.Fatalf("effective_provider = %#v", metadata["effective_provider"])
	}
	if metadata["effective_channel"] != service.ImageTaskChannelGrokRuntime {
		t.Fatalf("effective_channel = %#v", metadata["effective_channel"])
	}
	if metadata["provider_source"] != "model_route" {
		t.Fatalf("provider_source = %#v, want model_route", metadata["provider_source"])
	}
	if metadata["upstream_host"] != "grok.example.test" {
		t.Fatalf("upstream_host = %#v", metadata["upstream_host"])
	}
}
