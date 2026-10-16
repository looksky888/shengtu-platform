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
