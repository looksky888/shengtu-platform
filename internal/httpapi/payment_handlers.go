package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type createPaymentOrderRequest struct {
	ProductID     string `json:"product_id"`
	CustomCredits int    `json:"custom_credits"`
	ChannelID     string `json:"channel_id"`
}

func (a *App) handlePaymentSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	item, err := a.paymentOrders.Settings()
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "读取充值设置失败")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentSettingsPublic]{Item: item})
}

func (a *App) handlePaymentChannels(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	items, err := a.paymentOrders.Channels()
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "读取支付渠道失败")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemsResponse[service.PaymentChannelOption]{Items: items})
}

func (a *App) handlePaymentProducts(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	items, err := a.paymentOrders.Products()
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "读取充值套餐失败")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemsResponse[service.RechargeProductPublic]{Items: items})
}

func (a *App) handlePaymentStorageEntitlement(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	item, err := a.paymentOrders.StorageEntitlement(identityScope(identity))
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "读取云存储权益失败")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[storage.PaymentStorageEntitlementSummary]{Item: item})
}

func (a *App) handlePaymentOrders(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/payment/orders" && r.Method == http.MethodPost {
		a.handleCreatePaymentOrder(w, r)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "payment" && parts[2] == "orders" && parts[4] == "cancel" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if a.paymentOrders == nil || !a.paymentOrders.Available() {
			util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
			return
		}
		item, err := a.paymentOrders.CancelOrder(r.Context(), identityScope(identity), parts[3])
		if err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, storage.ErrPaymentRecordNotFound) {
				status = http.StatusNotFound
			} else if errors.Is(err, service.ErrPaymentOrderAlreadyPaid) || errors.Is(err, service.ErrPaymentOrderNotCancellable) || errors.Is(err, storage.ErrPaymentStateConflict) {
				status = http.StatusConflict
			} else if strings.Contains(err.Error(), "关单失败") {
				status = http.StatusBadGateway
			}
			util.WriteError(w, status, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentOrderPublic]{Item: item})
		return
	}
	if r.Method != http.MethodGet || len(parts) != 4 || parts[0] != "api" || parts[1] != "payment" || parts[2] != "orders" {
		http.NotFound(w, r)
		return
	}
	item, err := a.paymentOrders.QueryOrder(r.Context(), identityScope(identity), parts[3])
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, storage.ErrPaymentRecordNotFound) {
			status = http.StatusNotFound
		}
		if strings.Contains(err.Error(), "查单失败") {
			status = http.StatusBadGateway
		}
		util.WriteError(w, status, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentOrderPublic]{Item: item})
}

func (a *App) handleCreatePaymentOrder(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	var body createPaymentOrderRequest
	if !readJSONOr400(w, r, &body) {
		return
	}
	hasProduct := strings.TrimSpace(body.ProductID) != ""
	hasCustomCredits := body.CustomCredits > 0
	if hasProduct == hasCustomCredits {
		util.WriteError(w, http.StatusBadRequest, "套餐与自定义积分必须且只能选择一种")
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" {
		util.WriteError(w, http.StatusBadRequest, "缺少 Idempotency-Key")
		return
	}
	var item service.PaymentOrderPublic
	var created bool
	var err error
	if hasCustomCredits {
		item, created, err = a.paymentOrders.CreateCustomCreditsOrder(r.Context(), identityScope(identity), body.CustomCredits, body.ChannelID, idempotencyKey)
	} else {
		item, created, err = a.paymentOrders.CreateOrder(r.Context(), identityScope(identity), body.ProductID, body.ChannelID, idempotencyKey)
	}
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, storage.ErrPaymentRecordNotFound) {
			status = http.StatusNotFound
		}
		if strings.Contains(err.Error(), "预下单失败") {
			status = http.StatusBadGateway
		}
		util.WriteError(w, status, err.Error())
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	util.WriteJSON(w, status, itemResponse[service.PaymentOrderPublic]{Item: item})
}

func (a *App) handleWechatPaymentNotify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) != 6 || parts[0] != "api" || parts[1] != "payment" || parts[2] != "wechat" || parts[3] != "notify" {
		http.NotFound(w, r)
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		writeWechatNotifyFailure(w)
		return
	}
	if _, err := a.paymentOrders.HandleWechatNotify(r.Context(), r, parts[4], parts[5]); err != nil {
		if a.logger != nil {
			a.logger.Warning("wechat payment notification failed", "error", err.Error())
		}
		writeWechatNotifyFailure(w)
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]string{"code": "SUCCESS", "message": "成功"})
}

func writeWechatNotifyFailure(w http.ResponseWriter) {
	util.WriteJSON(w, http.StatusInternalServerError, map[string]string{"code": "FAIL", "message": "处理失败"})
}

func (a *App) handleAlipayPaymentNotify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) != 6 || parts[0] != "api" || parts[1] != "payment" || parts[2] != "alipay" || parts[3] != "notify" {
		http.NotFound(w, r)
		return
	}
	if a.paymentOrders == nil || !a.paymentOrders.Available() {
		writeAlipayNotifyResult(w, false)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if _, err := a.paymentOrders.HandleAlipayNotify(r.Context(), r, parts[4], parts[5]); err != nil {
		if a.logger != nil {
			a.logger.Warning("alipay payment notification failed", "error", err.Error())
		}
		writeAlipayNotifyResult(w, false)
		return
	}
	writeAlipayNotifyResult(w, true)
}

func writeAlipayNotifyResult(w http.ResponseWriter, success bool) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if !success {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("failure"))
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("success"))
}
