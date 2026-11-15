package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func newImageChannelServiceForTest(t *testing.T, legacy ImageChannelLegacyConfig) (*ImageChannelService, string, storage.Backend) {
	t.Helper()
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	service, err := NewImageChannelService(dir, backend, legacy)
	if err != nil {
		t.Fatalf("NewImageChannelService() error = %v", err)
	}
	return service, dir, backend
}

func TestImageChannelServiceSeedsSystemChannels(t *testing.T) {
	service, _, _ := newImageChannelServiceForTest(t, ImageChannelLegacyConfig{
		MaxConcurrency: 7,
		GPTModelCosts: map[string]int{
			util.ImageModelGPT: 11, util.ImageModelGPT25: 12,
			util.ImageModelGPT25Flare: 13, util.ImageModelGPT25Sunburst: 14,
		},
	})
	channels := service.ListAdmin()
	if len(channels) != 2 || channels[0].ID != "local-account-pool" || channels[1].ID != "local-grok-runtime" {
		t.Fatalf("seeded channels = %#v", channels)
	}
	if channels[0].MaxConcurrency != 7 || channels[0].ModelCount != 7 {
		t.Fatalf("local channel = %#v", channels[0])
	}
	resolved, err := service.ResolveModel("local-gpt-image-2")
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if resolved.CreditCost != 11 || resolved.ChannelType != ImageChannelTypeAccountPool {
		t.Fatalf("resolved model = %#v", resolved)
	}
	for _, modelID := range []string{"local-gpt-image-2-6-flare", "local-gpt-image-2-6", "local-gpt-image-2-6-sunburst"} {
		resolved26, err := service.ResolveModel(modelID)
		if err != nil {
			t.Fatalf("ResolveModel(%s) error = %v", modelID, err)
		}
		if resolved26.CreditCost != 5 {
			t.Fatalf("%s CreditCost = %d, want 5", modelID, resolved26.CreditCost)
		}
		if !strings.Contains(strings.Join(resolved26.Formats, ","), "gif") {
			t.Fatalf("%s Formats = %#v, want gif included", modelID, resolved26.Formats)
		}
	}
}

func TestImageChannelServiceBackfills26ModelsIntoExistingAccountPoolOnce(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	if err := backend.SaveJSONDocument(imageChannelsDocumentName, map[string]any{
		"version": 1,
		"channels": []map[string]any{
			{
				"id": "local-account-pool", "name": "GPT 本地账号池", "alias": "渠道 1",
				"type": "account_pool", "enabled": true, "system": true, "sort": 10, "max_concurrency": 4,
			},
		},
		"models": []map[string]any{
			{
				"id": "local-gpt-image-2-5-flare", "channel_id": "local-account-pool",
				"display_name": "GPT Images 2.5 Flare", "upstream_model": util.ImageModelGPT25Flare,
				"capabilities": []string{"generate", "edit"}, "resolutions": []string{"1k"},
				"formats": []string{"png", "jpeg", "webp"}, "credit_cost": 9, "enabled": true, "sort": 10,
			},
		},
	}); err != nil {
		t.Fatal(err)
	}

	service, err := NewImageChannelService(dir, backend, ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("NewImageChannelService() error = %v", err)
	}
	if existing, err := service.ResolveModel("local-gpt-image-2-5-flare"); err != nil || existing.CreditCost != 9 {
		t.Fatalf("existing model overwritten: %#v err=%v", existing, err)
	}
	for _, modelID := range []string{"local-gpt-image-2-6-flare", "local-gpt-image-2-6", "local-gpt-image-2-6-sunburst"} {
		resolved, err := service.ResolveModel(modelID)
		if err != nil {
			t.Fatalf("backfilled ResolveModel(%s) error = %v", modelID, err)
		}
		if resolved.CreditCost != 5 {
			t.Fatalf("backfilled %s CreditCost = %d, want 5", modelID, resolved.CreditCost)
		}
	}

	// Admin deletion must stick across reloads and not be re-seeded.
	if err := service.DeleteModel("local-account-pool", "local-gpt-image-2-6-sunburst"); err != nil {
		t.Fatalf("DeleteModel() error = %v", err)
	}
	reloaded, err := NewImageChannelService(dir, backend, ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("reload error = %v", err)
	}
	if _, err := reloaded.ResolveModel("local-gpt-image-2-6-sunburst"); err == nil {
		t.Fatal("admin-deleted 2.6 model was resurrected on reload")
	}
}

func TestImageChannelServiceBackfills26ModelsIntoMigratedLocalGPTChannel(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	if err := backend.SaveJSONDocument(imageChannelsDocumentName, map[string]any{
		"version": 1,
		"channels": []map[string]any{
			{
				"id": "local-gpt", "name": "本地 GPT 号池",
				"type": "account_pool", "enabled": true, "system": true, "sort": 10, "max_concurrency": 100,
			},
		},
		"models": []map[string]any{
			{
				"id": "local-gpt-image-25-flare", "channel_id": "local-gpt",
				"display_name": "GPT Image 2.5 Flare", "upstream_model": util.ImageModelGPT25Flare,
				"capabilities": []string{"generate", "edit"}, "resolutions": []string{"1k"},
				"formats": []string{"png", "jpeg", "webp"}, "credit_cost": 4, "enabled": true, "sort": 30,
			},
		},
	}); err != nil {
		t.Fatal(err)
	}

	service, err := NewImageChannelService(dir, backend, ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("NewImageChannelService() error = %v", err)
	}
	for _, modelID := range []string{"local-gpt-image-2-6-flare", "local-gpt-image-2-6", "local-gpt-image-2-6-sunburst"} {
		resolved, err := service.ResolveModel(modelID)
		if err != nil {
			t.Fatalf("backfilled ResolveModel(%s) error = %v", modelID, err)
		}
		if resolved.ChannelID != "local-gpt" {
			t.Fatalf("backfilled %s ChannelID = %q, want local-gpt", modelID, resolved.ChannelID)
		}
		if resolved.CreditCost != 5 {
			t.Fatalf("backfilled %s CreditCost = %d, want 5", modelID, resolved.CreditCost)
		}
		if !strings.Contains(strings.Join(resolved.Formats, ","), "gif") {
			t.Fatalf("backfilled %s Formats = %#v, want gif included", modelID, resolved.Formats)
		}
	}
}

func TestImageChannelServiceEncryptsRelayKeyAndPersistsCRUD(t *testing.T) {
	service, dir, backend := newImageChannelServiceForTest(t, ImageChannelLegacyConfig{})
	created, err := service.CreateChannel(ImageChannelInput{
		Name: "测试中转", Alias: "渠道 2", Type: ImageChannelTypeOpenAICompatible,
		BaseURL: "https://relay.example.test/v1", APIKey: "secret-test-key", Enabled: true,
		Sort: 30, MaxConcurrency: 2, TimeoutSeconds: 180, MaxRetries: 1, DownloadURLs: true,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	if !created.APIKeyConfigured || created.APIKeyMasked == "" {
		t.Fatalf("public channel leaks key state = %#v", created)
	}
	model, err := service.CreateModel(created.ID, ImageChannelModelInput{
		DisplayName: "Image Pro", UpstreamModel: "gpt-image-pro", Capabilities: []string{"generate", "edit"},
		Resolutions: []string{"1k", "2k"}, Formats: []string{"png"}, CreditCost: 9,
		CreditCosts: map[string]int{"1k": 9, "2k": 17}, Enabled: true, Sort: 10,
	})
	if err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}
	resolved, err := service.ResolveModel(model.ID)
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if resolved.APIKey != "secret-test-key" || resolved.CreditCost != 9 || resolved.MaxConcurrency != 2 {
		t.Fatalf("resolved = %#v", resolved)
	}
	if got := ImageChannelModelCreditCost(resolved, "2k"); got != 17 {
		t.Fatalf("2k credit cost = %d, want 17", got)
	}
	raw, err := os.ReadFile(filepath.Join(dir, imageChannelsDocumentName))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if strings.Contains(string(raw), "secret-test-key") {
		t.Fatal("channel API key persisted in plaintext")
	}
	reloaded, err := NewImageChannelService(dir, backend, ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("reload error = %v", err)
	}
	if got, err := reloaded.ResolveModel(model.ID); err != nil || got.APIKey != "secret-test-key" {
		t.Fatalf("reloaded model = %#v, err = %v", got, err)
	}
	if err := reloaded.DeleteChannel(created.ID); err != nil {
		t.Fatalf("DeleteChannel() error = %v", err)
	}
	if _, err := reloaded.ResolveModel(model.ID); err == nil {
		t.Fatal("deleted channel model still resolves")
	}
}

func TestImageChannelServiceRejectsDeletingSystemChannel(t *testing.T) {
	service, _, _ := newImageChannelServiceForTest(t, ImageChannelLegacyConfig{})
	if err := service.DeleteChannel("local-account-pool"); err == nil {
		t.Fatal("DeleteChannel(system) error = nil")
	}
}

func TestImageChannelServiceMigratesLegacyArrayWithoutLosingRelayModel(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	if err := backend.SaveJSONDocument(imageChannelsDocumentName, []map[string]any{
		{
			"id": "relay-legacy", "name": "旧中转", "kind": "relay", "base_url": "https://relay.example.test/v1",
			"api_key": "legacy-secret", "enabled": true, "sort_order": 30, "concurrency_limit": 8,
			"timeout_seconds": 300, "max_retries": 1, "download_urls": true,
			"models": []map[string]any{{
				"id": "legacy-model", "provider_model": "nano-banana2", "display_name": "nano-banana2",
				"protocol": "openai_images", "credit_cost": 5, "enabled": true, "sort_order": 10,
				"supports_generation": true, "supports_edit": true,
			}},
		},
	}); err != nil {
		t.Fatal(err)
	}
	service, err := NewImageChannelService(dir, backend, ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("migration error = %v", err)
	}
	resolved, err := service.ResolveModel("legacy-model")
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if resolved.APIKey != "legacy-secret" || resolved.ChannelType != ImageChannelTypeOpenAICompatible || resolved.CreditCost != 5 {
		t.Fatalf("migrated model = %#v", resolved)
	}
	raw, err := backend.LoadJSONDocument(imageChannelsDocumentName)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) == 0 || encoded[0] != '{' || strings.Contains(string(encoded), "legacy-secret") {
		t.Fatalf("migrated document leaked or kept legacy shape: %s", encoded)
	}
}
