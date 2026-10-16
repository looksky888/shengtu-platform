package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type paymentReconciliationTriggerRequest struct {
	ChannelID string `json:"channel_id"`
	BillDate  string `json:"bill_date"`
}

func (a *App) handleAdminPaymentReconciliations(w http.ResponseWriter, r *http.Request) {
	_, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentAdmin == nil || !a.paymentAdmin.Available() || a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "账单对账需要数据库存储后端")
		return
	}
	base := "/api/admin/payment-reconciliations"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			q := r.URL.Query()
			result, err := a.paymentOrders.QueryReconciliations(storage.PaymentReconciliationFilter{
				Page: util.ToInt(q.Get("page"), 1), PageSize: util.ToInt(q.Get("page_size"), 25),
				ChannelID: strings.TrimSpace(q.Get("channel_id")), Status: strings.TrimSpace(q.Get("status")), BillDate: strings.TrimSpace(q.Get("bill_date")),
			})
			if err != nil {
				writePaymentReconciliationAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, result)
		case http.MethodPost:
			var body paymentReconciliationTriggerRequest
			if !readJSONOr400(w, r, &body) {
				return
			}
			if strings.TrimSpace(body.ChannelID) == "" || strings.TrimSpace(body.BillDate) == "" {
				util.WriteError(w, http.StatusBadRequest, "channel_id 和 bill_date 必填")
				return
			}
			if a.rootCtx == nil {
				util.WriteError(w, http.StatusServiceUnavailable, "支付对账服务上下文未就绪")
				return
			}
			item, err := a.paymentOrders.TriggerTradeBillReconciliation(a.rootCtx, body.ChannelID, body.BillDate)
			if err != nil {
				writePaymentReconciliationAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusAccepted, itemResponse[service.PaymentReconciliationRunPublic]{Item: item})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "payment-reconciliations" || r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}
	q := r.URL.Query()
	result, err := a.paymentOrders.GetReconciliation(parts[3], storage.PaymentReconciliationItemFilter{
		Page: util.ToInt(q.Get("page"), 1), PageSize: util.ToInt(q.Get("page_size"), 25), Category: strings.TrimSpace(q.Get("category")),
	})
	if err != nil {
		writePaymentReconciliationAdminError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, result)
}

func writePaymentReconciliationAdminError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, storage.ErrPaymentRecordNotFound) {
		status = http.StatusNotFound
	}
	if strings.Contains(err.Error(), "服务正在关闭") {
		status = http.StatusServiceUnavailable
	}
	util.WriteError(w, status, err.Error())
}
