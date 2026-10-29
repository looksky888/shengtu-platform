package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type imageCreditCharge struct {
	UserID string
	Amount int
	RefID  string
	// N is the billed image count (payload n). Used for partial refunds when some images succeed.
	N            int
	RefundReason string
}

// ErrImageChargeAlreadySettled is returned when the same client_task_id was already
// billed and not fully refunded. Callers must not re-run upstream generation for free.
var ErrImageChargeAlreadySettled = errors.New("该请求已扣过积分，请勿使用相同任务 ID 重复提交")

func (a *App) deductImageCredits(identity service.Identity, payload map[string]any, reason, refPrefix string) (*imageCreditCharge, error) {
	if a.credits == nil {
		return nil, nil
	}
	userID := imageCreditUserID(identity)
	if userID == "" {
		return nil, fmt.Errorf("图片积分功能需要绑定用户账号")
	}
	amount := a.imageCreditAmount(payload)
	// Align with imageTaskCount / OpenAI-style n (1–4); unbounded n would inflate charges or refund math.
	n := util.ToInt(payload["n"], 1)
	if n < 1 {
		n = 1
	}
	if n > 4 {
		n = 4
	}
	// Prefer stable client_task_id so retries / FE resubmits do not double-charge.
	clientTaskID := firstNonEmpty(util.Clean(payload["client_task_id"]), util.Clean(payload["task_id"]))
	if clientTaskID == "" {
		clientTaskID = util.NewHex(12)
	}
	baseRef := strings.Trim(refPrefix, "/") + ":" + clientTaskID
	return a.deductCreationCreditsOnce(userID, amount, n, reason, service.CreditReasonImageRefund, baseRef)
}

func (a *App) deductCreationCreditsOnce(userID string, amount, n int, reason, refundReason, baseRef string) (*imageCreditCharge, error) {
	refID := baseRef
	_, _, charged, err := a.credits.DeductOnce(userID, amount, reason, refID)
	if err != nil {
		return nil, err
	}
	if charged {
		return &imageCreditCharge{UserID: userID, Amount: amount, RefID: refID, N: n, RefundReason: refundReason}, nil
	}
	// Idempotent hit: either prior success (do not re-run free) or prior failure that refunded.
	if a.creationChargeFullyRefunded(userID, refundReason, baseRef) {
		// Full refund path uses AddOnce(..., image_refund, baseRef). Allow one atomic retry.
		_, entry, charged, err := a.credits.DeductRetryOnce(userID, amount, reason, refundReason, baseRef)
		if err != nil {
			return nil, err
		}
		if !charged {
			return nil, ErrImageChargeAlreadySettled
		}
		return &imageCreditCharge{UserID: userID, Amount: amount, RefID: entry.RefID, N: n, RefundReason: refundReason}, nil
	}
	return nil, ErrImageChargeAlreadySettled
}

func (a *App) creationChargeFullyRefunded(userID, refundReason, chargeRefID string) bool {
	if a.credits == nil || userID == "" || chargeRefID == "" {
		return false
	}
	// Full refund writes AddOnce with the same ref_id as the charge.
	return a.credits.HasLedgerEntry(userID, refundReason, chargeRefID)
}

func (a *App) refundImageCredits(charge *imageCreditCharge) {
	if a.credits == nil || charge == nil || charge.UserID == "" || charge.Amount <= 0 || charge.RefID == "" {
		return
	}
	refundReason := firstNonEmpty(charge.RefundReason, service.CreditReasonImageRefund)
	if err := a.applyCreationCreditRefund(charge.UserID, charge.Amount, refundReason, charge.RefID); err != nil && a.logger != nil {
		a.logger.Warning("image credit refund failed", "user_id", charge.UserID, "ref_id", charge.RefID, "amount", charge.Amount, "error", err.Error())
	}
}

// refundImageCreditsForSuccess refunds only the failed portion when some images were delivered.
// successCount is the number of images the client actually received.
func (a *App) refundImageCreditsForSuccess(charge *imageCreditCharge, successCount int) {
	if a.credits == nil || charge == nil || charge.UserID == "" || charge.Amount <= 0 || charge.RefID == "" {
		return
	}
	n := charge.N
	if n < 1 {
		n = 1
	}
	if successCount < 0 {
		successCount = 0
	}
	if successCount <= 0 {
		a.refundImageCredits(charge)
		return
	}
	if successCount >= n {
		return
	}
	// amount was base*n; unit cost is exact when n divides amount (always true for current billing).
	unit := charge.Amount / n
	if unit <= 0 {
		a.refundImageCredits(charge)
		return
	}
	refund := unit * (n - successCount)
	if refund <= 0 {
		return
	}
	// Distinct ref so full-refund AddOnce(ref) and partial refunds do not collide.
	refID := fmt.Sprintf("%s:partial:%d_of_%d", charge.RefID, successCount, n)
	if err := a.applyCreationCreditRefund(charge.UserID, refund, service.CreditReasonImageRefund, refID); err != nil && a.logger != nil {
		a.logger.Warning("image credit partial refund failed", "user_id", charge.UserID, "ref_id", refID, "amount", refund, "success_count", successCount, "n", n, "error", err.Error())
	}
}

func (a *App) applyCreationCreditRefund(userID string, amount int, reason, refID string) error {
	if a.creditRefunds != nil {
		return a.creditRefunds.Refund(service.CreditRefundIntent{
			UserID: userID, Amount: amount, Reason: reason, RefID: refID,
		})
	}
	_, _, _, err := a.credits.AddOnce(userID, amount, reason, refID)
	return err
}

func (a *App) writeCreditBillingError(w http.ResponseWriter, err error) {
	util.WriteError(w, creditBillingHTTPStatus(err), creditBillingMessage(err))
}

func creditBillingHTTPStatus(err error) int {
	if errors.Is(err, service.ErrInsufficientCredits) {
		return http.StatusPaymentRequired
	}
	if errors.Is(err, ErrImageChargeAlreadySettled) {
		return http.StatusConflict
	}
	return http.StatusForbidden
}

func creditBillingMessage(err error) string {
	if err == nil {
		return "请求失败"
	}
	if errors.Is(err, service.ErrInsufficientCredits) {
		return "积分不足，请充值或联系管理员"
	}
	if errors.Is(err, ErrImageChargeAlreadySettled) {
		return err.Error()
	}
	if errors.Is(err, service.ErrCreditCardNotFound) {
		return "兑换码不存在"
	}
	if errors.Is(err, service.ErrCreditCardInactive) {
		return "兑换码不可用"
	}
	msg := strings.TrimSpace(err.Error())
	if strings.Contains(msg, "bound user") || strings.Contains(msg, "绑定用户") {
		return "图片积分功能需要绑定用户账号"
	}
	return firstNonEmpty(msg, "积分操作失败")
}

func imageCreditUserID(identity service.Identity) string {
	if identity.OwnerID != "" {
		return identity.OwnerID
	}
	return identity.ID
}

func (a *App) imageCreditAmount(payload map[string]any) int {
	base := a.imageCreditBaseAmount(payload)
	count := util.ToInt(payload["n"], 1)
	if count < 1 {
		count = 1
	}
	if count > 4 {
		count = 4
	}
	return base * count
}

func (a *App) imageCreditBaseAmount(payload map[string]any) int {
	if frozen := util.ToInt(payload["image_credit_cost"], 0); frozen > 0 {
		return frozen
	}
	model := util.Clean(payload["model"])
	if util.IsGrokImageModel(model) {
		if service.NormalizeImageResolutionPreset(util.Clean(payload["image_resolution"])) == "2k" {
			return a.config.GrokImageCreditCost2K()
		}
		return a.config.GrokImageCreditCost1K()
	}
	switch model {
	case util.ImageModelGPT:
		return a.config.GPTImage2CreditCost()
	case util.ImageModelGPT25:
		return a.config.GPTImage25CreditCost()
	case util.ImageModelGPT25Flare:
		return a.config.GPTImage25FlareCreditCost()
	case util.ImageModelGPT25Sunburst:
		return a.config.GPTImage25SunburstCreditCost()
	}
	resolution := service.NormalizeImageResolutionPreset(util.Clean(payload["image_resolution"]))
	if resolution == "" {
		resolution = service.NormalizeImageResolutionPreset(util.Clean(payload["resolution_preset"]))
	}
	size := strings.ToLower(strings.TrimSpace(firstNonEmpty(resolution, util.Clean(payload["requested_size"]), util.Clean(payload["size"]))))
	size = strings.ToLower(protocol.NormalizeImageGenerationSize(size))
	if strings.Contains(size, "4k") || strings.Contains(size, "2880") || strings.Contains(size, "4096") {
		return a.config.ImageCreditCost4K()
	}
	if strings.Contains(size, "2k") || strings.Contains(size, "2048") {
		return a.config.ImageCreditCost2K()
	}
	return a.config.ImageCreditCost1080P()
}

func imageCreditReasonForEndpoint(endpoint string) string {
	if strings.Contains(endpoint, "edit") {
		return service.CreditReasonImageEdit
	}
	return service.CreditReasonImageGeneration
}
