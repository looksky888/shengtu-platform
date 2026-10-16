package httpapi

import (
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
