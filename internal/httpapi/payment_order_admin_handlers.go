package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminPaymentOrders(w http.ResponseWriter, r *http.Request) {
	_, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentAdmin == nil || !a.paymentAdmin.Available() || a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	base := "/api/admin/payment-orders"
	if r.URL.Path == base && r.Method == http.MethodGet {
		q := r.URL.Query()
		page := util.ToInt(q.Get("page"), 1)
		pageSize := util.ToInt(q.Get("page_size"), 20)
		result, err := a.paymentAdmin.QueryOrders(service.PaymentOrderAdminQuery{
			Page: page, PageSize: pageSize, Keyword: q.Get("keyword"), Status: q.Get("status"),
			ChannelID: q.Get("channel_id"), UserID: q.Get("user_id"), StartAt: q.Get("start_at"), EndAt: q.Get("end_at"),
		})
		if err != nil {
			writePaymentAdminError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) != 4 && len(parts) != 5 {
		http.NotFound(w, r)
		return
	}
	if parts[0] != "api" || parts[1] != "admin" || parts[2] != "payment-orders" {
		http.NotFound(w, r)
		return
	}
	if len(parts) == 5 && parts[4] == "query" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		item, err := a.paymentOrders.QueryOrderAsAdmin(r.Context(), parts[3])
		if err != nil {
			writePaymentOrderAdminError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentOrderAdminPublic]{Item: item})
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	item, err := a.paymentAdmin.GetOrder(parts[3])
	if err != nil {
		writePaymentOrderAdminError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentOrderAdminPublic]{Item: item})
}

func writePaymentOrderAdminError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, storage.ErrPaymentRecordNotFound) {
		status = http.StatusNotFound
	}
	if strings.Contains(err.Error(), "查单失败") {
		status = http.StatusBadGateway
	}
	util.WriteError(w, status, err.Error())
}
