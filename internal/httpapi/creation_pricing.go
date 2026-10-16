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
		"image_credit_cost_1080p":      a.config.ImageCreditCost1080P(),
		"image_credit_cost_2k":         a.config.ImageCreditCost2K(),
		"image_credit_cost_4k":         a.config.ImageCreditCost4K(),
		"grok_image_credit_cost_1k":    a.config.GrokImageCreditCost1K(),
		"grok_image_credit_cost_2k":    a.config.GrokImageCreditCost2K(),
		"video_credit_cost_per_second": a.config.VideoCreditCostPerSecond(),
	})
}
