package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminEmailSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	base := "/api/admin/email-settings"
	if r.URL.Path == base+"/test" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Recipient string `json:"recipient"`
		}
		if !readJSONOr400(w, r, &body) {
			return
		}
		if err := a.email.TestMail(r.Context(), body.Recipient); err != nil {
			if a.logger != nil {
				a.logger.Warning("SMTP test mail failed", "error", err.Error())
			}
			util.WriteError(w, http.StatusBadGateway, "测试邮件发送失败，请检查 SMTP 配置")
			return
		}
		util.WriteJSON(w, http.StatusOK, sentResponse{Sent: true})
		return
	}
	if strings.TrimRight(r.URL.Path, "/") != base {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, settingsResponse[service.EmailSettingsPublic]{Settings: a.email.Settings()})
	case http.MethodPut:
		var body service.EmailSettingsInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		settings, err := a.email.UpdateSettings(body)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, settingsResponse[service.EmailSettingsPublic]{Settings: settings})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
