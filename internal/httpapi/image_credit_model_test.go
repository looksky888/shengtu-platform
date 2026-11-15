package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/util"
)

func TestImageCreditBaseAmountUsesGPTModelCosts(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	for _, model := range []string{util.ImageModelGPT26, util.ImageModelGPT26Flare, util.ImageModelGPT26Sunburst} {
		if got := app.imageCreditBaseAmount(map[string]any{"model": model, "size": "1024x1024"}); got != 5 {
			t.Fatalf("default model %s cost = %d, want 5", model, got)
		}
	}
	if _, err := app.config.Update(map[string]any{
		"gpt_image_2_credit_cost":            11,
		"gpt_image_2_5_credit_cost":          12,
		"gpt_image_2_5_flare_credit_cost":    13,
		"gpt_image_2_5_sunburst_credit_cost": 14,
		"gpt_image_2_6_credit_cost":          15,
		"gpt_image_2_6_flare_credit_cost":    16,
		"gpt_image_2_6_sunburst_credit_cost": 17,
	}); err != nil {
		t.Fatalf("update model costs: %v", err)
	}
	for model, want := range map[string]int{
		util.ImageModelGPT:           11,
		util.ImageModelGPT25:         12,
		util.ImageModelGPT25Flare:    13,
		util.ImageModelGPT25Sunburst: 14,
		util.ImageModelGPT26:         15,
		util.ImageModelGPT26Flare:    16,
		util.ImageModelGPT26Sunburst: 17,
	} {
		if got := app.imageCreditBaseAmount(map[string]any{"model": model, "size": "1024x1024"}); got != want {
			t.Fatalf("model %s cost = %d, want %d", model, got, want)
		}
	}
}

func TestHandleCreationPricingExposesGPTSubModelCostsAndProvider(t *testing.T) {
	unsetTestEnv(t, "CHATGPT2API_IMAGE_DEFAULT_MODEL")
	unsetTestEnv(t, "CHATGPT2API_IMAGE_PROVIDER")
	app := newTestApp(t)
	defer app.Close()
	if _, err := app.config.Update(map[string]any{
		"registration_enabled":               true,
		"image_default_model":                util.ImageModelGPT25Sunburst,
		"gpt_image_2_credit_cost":            5,
		"gpt_image_2_5_credit_cost":          6,
		"gpt_image_2_5_flare_credit_cost":    7,
		"gpt_image_2_5_sunburst_credit_cost": 8,
	}); err != nil {
		t.Fatalf("update config: %v", err)
	}

	userToken := registerTestUser(t, app, "pricing-reader", "PricingReader", "")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/creation-pricing", nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	app.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/creation-pricing status = %d body=%s", rec.Code, rec.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal pricing: %v", err)
	}
	for key, want := range map[string]float64{
		"gpt_image_2_credit_cost":            5,
		"gpt_image_2_5_credit_cost":          6,
		"gpt_image_2_5_flare_credit_cost":    7,
		"gpt_image_2_5_sunburst_credit_cost": 8,
		"gpt_image_2_6_credit_cost":          5,
		"gpt_image_2_6_flare_credit_cost":    5,
		"gpt_image_2_6_sunburst_credit_cost": 5,
	} {
		if got, _ := payload[key].(float64); got != want {
			t.Fatalf("%s = %#v, want %v", key, payload[key], want)
		}
	}
	if payload["image_provider"] != "account_pool" {
		t.Fatalf("image_provider = %#v, want account_pool", payload["image_provider"])
	}
	if payload["image_default_model"] != util.ImageModelGPT25Sunburst {
		t.Fatalf("image_default_model = %#v, want %s", payload["image_default_model"], util.ImageModelGPT25Sunburst)
	}
}

func TestImageTaskRequestMetadataValidatesGIFOutput(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	if _, err := app.imageTaskRequestMetadata(map[string]any{
		"model":         util.ImageModelGPT25Flare,
		"output_format": "gif",
	}, util.ImageModelGPT25Flare, "generate"); err == nil {
		t.Fatal("expected gif output_format on gpt-image-2.5-flare to be rejected")
	}

	if _, err := app.imageTaskRequestMetadata(map[string]any{
		"model":         util.ImageModelGPT26Flare,
		"output_format": "gif",
		"stream":        true,
	}, util.ImageModelGPT26Flare, "generate"); err == nil {
		t.Fatal("expected streaming gif output_format on gpt-image-2.6-flare to be rejected")
	}

	meta, err := app.imageTaskRequestMetadata(map[string]any{
		"model":             util.ImageModelGPT26Flare,
		"output_format":     "gif",
		"frame_count":       8,
		"frame_duration_ms": 120,
	}, util.ImageModelGPT26Flare, "generate")
	if err != nil {
		t.Fatalf("expected non-streaming gif on gpt-image-2.6-flare to pass validation, got %v", err)
	}
	if got := util.ToInt(meta["image_credit_cost"], 0); got != 5 {
		t.Fatalf("seeded local-account-pool gpt-image-2.6-flare credit_cost = %d, want 5", got)
	}
}
