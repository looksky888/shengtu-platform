package httpapi

import (
	"net/http"
	"os"
	"path/filepath"

	"chatgpt2api/internal/util"
)

func (a *App) handleProfile(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		a.writeLoginResponse(w, identity, "")
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
			return
		}
		updated, err := a.auth.UpdateProfileName(identity, util.Clean(body["name"]))
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		a.writeLoginResponse(w, *updated, "")
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleProfilePassword(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	if err := a.auth.ChangeProfilePassword(identity, util.Clean(body["current_password"]), util.Clean(body["new_password"])); err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	// F-08: destroy one-time bootstrap credentials after successful password change.
	if a.config != nil {
		notePath := filepath.Join(a.config.DataDir, "bootstrap-admin.txt")
		if err := os.Remove(notePath); err != nil && !os.IsNotExist(err) {
			if a.logger != nil {
				a.logger.Warning("failed to remove bootstrap admin credentials file", "path", notePath, "error", err.Error())
			}
		}
	}
	util.WriteJSON(w, http.StatusOK, okResponse{OK: true})
}
