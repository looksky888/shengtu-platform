package service

import (
	"encoding/json"
	"testing"
)

func TestPublicImageChannelModelsSerializeEmptyCapabilitiesAsArray(t *testing.T) {
	service, _, _ := newImageChannelServiceForTest(t, ImageChannelLegacyConfig{})
	service.state.Models = append(service.state.Models, ImageChannelModel{
		ID: "legacy-video", ChannelID: "local-grok-runtime", UpstreamModel: "grok-imagine-video",
		Enabled: true, CreditCost: 4,
	})
	models := service.ListPublicModels()
	data, err := json.Marshal(models)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, model := range decoded {
		if _, ok := model["capabilities"].([]any); !ok {
			t.Fatalf("model %s capabilities must serialize as array, got %v", model["id"], model["capabilities"])
		}
		if model["id"] == "legacy-video" {
			found = true
			if len(model["capabilities"].([]any)) != 0 || model["credit_cost"] != float64(4) || model["channel_type"] != ImageChannelTypeGrokRuntime {
				t.Fatal("empty capabilities must not invent image support or alter billing/routing")
			}
		}
	}
	if !found {
		t.Fatal("missing legacy video model")
	}
}

func TestAdminListModelsSerializesEmptyCapabilitiesAsArrayAndAllowsVideoModelUpdate(t *testing.T) {
	service, _, _ := newImageChannelServiceForTest(t, ImageChannelLegacyConfig{})
	service.state.Models = append(service.state.Models, ImageChannelModel{
		ID:            "legacy-grok-video",
		ChannelID:     "local-grok-runtime",
		DisplayName:   "grok-imagine-video",
		UpstreamModel: "grok-imagine-video",
		Capabilities:  nil,
		Resolutions:   nil,
		Formats:       nil,
		CreditCost:    4,
		Enabled:       true,
		Sort:          20,
	})

	adminModels := service.ListModels("local-grok-runtime", true)
	data, err := json.Marshal(adminModels)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range decoded {
		caps, ok := item["capabilities"].([]any)
		if !ok {
			t.Fatalf("admin ListModels model %v serialized capabilities as %T (%v), expected JSON array", item["id"], item["capabilities"], item["capabilities"])
		}
		if item["id"] == "legacy-grok-video" {
			found = true
			if len(caps) != 0 {
				t.Fatalf("expected empty capabilities array for legacy video model, got %v", caps)
			}
		}
	}
	if !found {
		t.Fatal("expected legacy-grok-video in ListModels output")
	}

	updated, err := service.UpdateModel("local-grok-runtime", "legacy-grok-video", ImageChannelModelInput{
		DisplayName:   "Grok Imagine Video",
		UpstreamModel: "grok-imagine-video",
		Capabilities:  []string{},
		Resolutions:   []string{},
		Formats:       []string{},
		CreditCost:    4,
		Enabled:       false,
		Sort:          25,
	})
	if err != nil {
		t.Fatalf("UpdateModel on migrated video model failed: %v", err)
	}
	if updated.Capabilities == nil || len(updated.Capabilities) != 0 {
		t.Fatalf("expected non-nil empty capabilities after UpdateModel, got %#v", updated.Capabilities)
	}
	if updated.Enabled {
		t.Fatal("expected updated video model to be disabled")
	}
}
