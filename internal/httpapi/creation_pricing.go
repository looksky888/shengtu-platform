package httpapi

import (
	"net/http"

	"chatgpt2api/internal/util"
)

func (a *App) handleCreationPricing(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{
		"image_credit_cost_1080p":            a.config.ImageCreditCost1080P(),
		"image_credit_cost_2k":               a.config.ImageCreditCost2K(),
		"image_credit_cost_4k":               a.config.ImageCreditCost4K(),
		"gpt_image_2_credit_cost":            a.config.GPTImage2CreditCost(),
		"gpt_image_2_5_credit_cost":          a.config.GPTImage25CreditCost(),
		"gpt_image_2_5_flare_credit_cost":    a.config.GPTImage25FlareCreditCost(),
		"gpt_image_2_5_sunburst_credit_cost": a.config.GPTImage25SunburstCreditCost(),
		"grok_image_credit_cost_1k":          a.config.GrokImageCreditCost1K(),
		"grok_image_credit_cost_2k":          a.config.GrokImageCreditCost2K(),
		"video_credit_cost_per_second":       a.config.VideoCreditCostPerSecond(),
		"image_provider":                     a.config.ImageProvider(),
		"image_default_model":                a.config.ImageDefaultModel(),
	})
}
