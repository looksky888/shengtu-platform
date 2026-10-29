package httpapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

func TestCreationTaskImageEditsMultipartUsesRelayChannelAndCreditCost(t *testing.T) {
	t.Setenv("CHATGPT2API_GPT_IMAGE_2_5_SUNBURST_CREDIT_COST", "12")
	app := newTestApp(t)
	defer app.Close()

	relay, err := app.imageChannels.CreateChannel(service.ImageChannelInput{
		Name: "Relay 1", Type: service.ImageChannelTypeOpenAICompatible,
		BaseURL: "https://relay.example.test/v1", APIKey: "relay-key",
		Enabled: true, MaxConcurrency: 4, TimeoutSeconds: 90, MaxRetries: 0,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	relayModel, err := app.imageChannels.CreateModel(relay.ID, service.ImageChannelModelInput{
		DisplayName:   "Relay Sunburst",
		UpstreamModel: util.ImageModelGPT25Sunburst,
		Capabilities:  []string{service.ImageCapabilityGenerate, service.ImageCapabilityEdit},
		Resolutions:   []string{"1k"},
		Formats:       []string{"png"},
		CreditCost:    4,
		CreditCosts:   map[string]int{"1k": 4},
		Enabled:       true,
	})
	if err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "edit user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	// Seed exactly 4 credits while legacy env fallback is 12: only channel pricing (4) can succeed in billing.
	if _, _, err := app.credits.Add(user.ID, 4, "test", "seed"); err != nil {
		t.Fatalf("credits.Add() error = %v", err)
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("client_task_id", "multipart-relay-edit-1")
	_ = mw.WriteField("prompt", "remove background")
	_ = mw.WriteField("model", util.ImageModelGPT25Sunburst)
	_ = mw.WriteField("channel_model_id", relayModel.ID)
	_ = mw.WriteField("image_resolution", "1k")
	_ = mw.WriteField("n", "1")
	part, err := mw.CreateFormFile("image", "input.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", &buf)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", res.Code, res.Body.String())
	}

	var task map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &task); err != nil {
		t.Fatalf("unmarshal task: %v", err)
	}
	if task["effective_provider"] != service.ImageTaskProviderProxyAPI {
		t.Fatalf("effective_provider = %#v, want %q", task["effective_provider"], service.ImageTaskProviderProxyAPI)
	}
	if task["effective_channel"] != "image_channel:"+relay.ID {
		t.Fatalf("effective_channel = %#v, want %q", task["effective_channel"], "image_channel:"+relay.ID)
	}
	if task["provider_source"] != "channel_model" {
		t.Fatalf("provider_source = %#v, want channel_model", task["provider_source"])
	}

	chargedFour := false
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		for _, entry := range app.credits.Ledger(user.ID) {
			if entry.Reason == service.CreditReasonImageEdit && entry.Delta == -4 {
				chargedFour = true
				break
			}
		}
		if chargedFour {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !chargedFour {
		t.Fatalf("expected image_edit ledger charge of -4 (not -12), got ledger = %#v", app.credits.Ledger(user.ID))
	}
}

func TestProtocolImageGenerationsIgnoresClientSpoofedCreditCost(t *testing.T) {
	t.Setenv("CHATGPT2API_IMAGE_CREDIT_COST_1080P", "6")
	t.Setenv("CHATGPT2API_GPT_IMAGE_2_CREDIT_COST", "6")
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "spoof user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	// Balance is 3: must be rejected (402) even if client injects image_credit_cost=1.
	if _, _, err := app.credits.Add(user.ID, 3, "test", "seed"); err != nil {
		t.Fatalf("credits.Add() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"cat","model":"gpt-image-2","image_credit_cost":1,"client_task_id":"spoof-1"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusPaymentRequired {
		t.Fatalf("status = %d body = %s, want 402", res.Code, res.Body.String())
	}
}
