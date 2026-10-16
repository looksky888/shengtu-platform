package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type paymentChannelCreateRequest struct {
	Channel     service.PaymentChannelInput     `json:"channel"`
	Credentials service.PaymentCredentialsInput `json:"credentials"`
}

type paymentChannelCreateResponse struct {
	Item    service.PaymentChannelPublic        `json:"item"`
	Version service.PaymentChannelVersionPublic `json:"version"`
}

func (a *App) handleAdminPaymentChannels(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentAdmin == nil || !a.paymentAdmin.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	base := "/api/admin/payment-channels"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			items, err := a.paymentAdmin.ListChannels()
			if err != nil {
				writePaymentAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.PaymentChannelPublic]{Items: items})
		case http.MethodPost:
			var body paymentChannelCreateRequest
			if !readJSONOr400(w, r, &body) {
				return
			}
			item, version, err := a.paymentAdmin.CreateChannel(body.Channel, body.Credentials, identityScope(identity))
			if err != nil {
				writePaymentAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusCreated, paymentChannelCreateResponse{Item: item, Version: version})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" && parts[2] == "payment-channels" {
		if r.Method == http.MethodGet {
			item, err := a.paymentAdmin.GetChannel(parts[3])
			if err != nil {
				writePaymentAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentChannelPublic]{Item: item})
			return
		}
		if r.Method != http.MethodPatch {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body service.PaymentChannelInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		item, err := a.paymentAdmin.UpdateChannel(parts[3], body, identityScope(identity))
		if err != nil {
			writePaymentAdminError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentChannelPublic]{Item: item})
		return
	}
	if len(parts) == 5 && parts[4] == "versions" && parts[0] == "api" && parts[1] == "admin" && parts[2] == "payment-channels" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body service.PaymentCredentialsInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		version, err := a.paymentAdmin.RotateChannel(parts[3], body, identityScope(identity))
		if err != nil {
			writePaymentAdminError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusCreated, itemResponse[service.PaymentChannelVersionPublic]{Item: version})
		return
	}
	http.NotFound(w, r)
}

func (a *App) handleAdminPaymentSettings(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentAdmin == nil || !a.paymentAdmin.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	switch r.Method {
	case http.MethodGet:
		item, err := a.paymentAdmin.Settings()
		if err != nil {
			writePaymentAdminError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentSettingsPublic]{Item: item})
	case http.MethodPut:
		var body service.PaymentSettingsInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		item, err := a.paymentAdmin.UpdateSettings(body, identityScope(identity))
		if err != nil {
			writePaymentAdminError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, itemResponse[service.PaymentSettingsPublic]{Item: item})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleAdminPaymentStats(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if a.paymentAdmin == nil || !a.paymentAdmin.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	item, err := a.paymentAdmin.Stats()
	if err != nil {
		writePaymentAdminError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, item)
}

func (a *App) handleAdminRechargeProducts(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.paymentAdmin == nil || !a.paymentAdmin.Available() {
		util.WriteError(w, http.StatusServiceUnavailable, "在线支付需要数据库存储后端")
		return
	}
	base := "/api/admin/recharge-products"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			items, err := a.paymentAdmin.ListProducts()
			if err != nil {
				writePaymentAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.RechargeProductPublic]{Items: items})
		case http.MethodPost:
			var body service.RechargeProductInput
			if !readJSONOr400(w, r, &body) {
				return
			}
			item, err := a.paymentAdmin.CreateProduct(body, identityScope(identity))
			if err != nil {
				writePaymentAdminError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusCreated, itemResponse[service.RechargeProductPublic]{Item: item})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "recharge-products" {
		http.NotFound(w, r)
		return
	}
	if r.Method == http.MethodDelete {
		deleted, err := a.paymentAdmin.ArchiveProduct(parts[3], identityScope(identity))
		if err != nil {
			writePaymentAdminError(w, err)
			return
		}
		if !deleted {
			util.WriteError(w, http.StatusNotFound, "充值套餐不存在或已删除")
			return
		}
		util.WriteJSON(w, http.StatusOK, deletedResponse{Deleted: true})
		return
	}
	if r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body service.RechargeProductInput
	if !readJSONOr400(w, r, &body) {
		return
	}
	item, err := a.paymentAdmin.UpdateProduct(parts[3], body, identityScope(identity))
	if err != nil {
		writePaymentAdminError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[service.RechargeProductPublic]{Item: item})
}

func writePaymentAdminError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, storage.ErrPaymentRecordNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, storage.ErrPaymentRecordConflict) {
		status = http.StatusConflict
	}
	message := strings.TrimSpace(err.Error())
	if errors.Is(err, storage.ErrPaymentRecordConflict) {
		message = "支付渠道 code 或充值套餐 SKU 已存在"
	}
	util.WriteError(w, status, message)
}
