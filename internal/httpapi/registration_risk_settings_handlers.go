package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const registrationRiskSettingsPath = "/api/admin/registration-risk-settings"

func (a *App) handleAdminRegistrationRiskSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	path := strings.TrimRight(r.URL.Path, "/")
	switch {
	case path == registrationRiskSettingsPath:
		a.handleRegistrationRiskPolicy(w, r)
	case path == registrationRiskSettingsPath+"/blocks":
		a.handleRegistrationRiskBlocks(w, r)
	case strings.HasPrefix(path, registrationRiskSettingsPath+"/blocks/"):
		a.handleRegistrationRiskBlockDelete(w, r, strings.TrimPrefix(path, registrationRiskSettingsPath+"/blocks/"))
	default:
		http.NotFound(w, r)
	}
}

func (a *App) handleRegistrationRiskPolicy(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, settingsResponse[service.RegistrationRiskPolicy]{Settings: a.regQuota.Policy()})
	case http.MethodPut:
		var body service.RegistrationRiskPolicy
		if !readJSONOr400(w, r, &body) {
			return
		}
		settings, err := a.regQuota.UpdatePolicy(body)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, settingsResponse[service.RegistrationRiskPolicy]{Settings: settings})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleRegistrationRiskBlocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	items, err := a.regQuota.ActiveBlocks()
	if err != nil {
		util.WriteError(w, http.StatusServiceUnavailable, "读取注册封禁记录失败")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemsTotalResponse[service.RegistrationRiskBlock]{Items: items, Total: len(items)})
}

func (a *App) handleRegistrationRiskBlockDelete(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	deleted, err := a.regQuota.DeleteBlock(id)
	if err != nil {
		util.WriteError(w, http.StatusServiceUnavailable, "解除注册封禁失败")
		return
	}
	if !deleted {
		util.WriteError(w, http.StatusNotFound, "封禁记录不存在或已过期")
		return
	}
	util.WriteJSON(w, http.StatusOK, deletedResponse{Deleted: true})
}
