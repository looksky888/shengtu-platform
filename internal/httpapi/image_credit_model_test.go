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
	if _, err := app.config.Update(map[string]any{
		"gpt_image_2_credit_cost":            11,
		"gpt_image_2_5_credit_cost":          12,
		"gpt_image_2_5_flare_credit_cost":    13,
		"gpt_image_2_5_sunburst_credit_cost": 14,
	}); err != nil {
		t.Fatalf("update model costs: %v", err)
	}
	for model, want := range map[string]int{
		util.ImageModelGPT:           11,
		util.ImageModelGPT25:         12,
		util.ImageModelGPT25Flare:    13,
		util.ImageModelGPT25Sunburst: 14,
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
