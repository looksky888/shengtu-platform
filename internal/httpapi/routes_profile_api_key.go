package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleProfileAPIKey(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	filter, ok := profileAPIKeyFilter(identity)
	if !ok {
		util.WriteError(w, http.StatusForbidden, "API Key 功能需要绑定用户账号")
		return
	}
	base := "/api/profile/api-key"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.AuthKeyPublic]{Items: a.auth.ListPersonalAPIKeyTyped(identity)})
		case http.MethodPost:
			body, ok := readJSONMapOr400(w, r)
			if !ok {
				return
			}
			item, raw, err := a.auth.UpsertPersonalAPIKey(identity, util.Clean(body["name"]))
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, itemKeyListResponse[service.AuthKeyPublic]{
				Item:  item,
				Key:   raw,
				Items: a.auth.ListPersonalAPIKeyTyped(identity),
			})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	parts := splitPath(r.URL.Path)
	if len(parts) < 4 || parts[0] != "api" || parts[1] != "profile" || parts[2] != "api-key" {
		http.NotFound(w, r)
		return
	}
	keyID := parts[3]
	if len(parts) == 5 && parts[4] == "key" {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		key, found := a.auth.RevealKey(keyID, filter)
		if !found {
			util.WriteError(w, http.StatusNotFound, "密钥明文仅创建或轮换后可查看一次，当前未保存")
			return
		}
		util.WriteJSON(w, http.StatusOK, keyResponse{Key: key})
		return
	}
	if len(parts) != 4 {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPost:
		var updates service.AuthKeyUpdate
		if !readJSONOr400(w, r, &updates) {
			return
		}
		if !updates.HasFields() {
			util.WriteError(w, http.StatusBadRequest, "未提供可更新字段")
			return
		}
		item, err := a.auth.UpdateKey(keyID, updates, filter)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if item.ID == "" {
			util.WriteError(w, http.StatusNotFound, "个人 API Key 不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemListResponse[service.AuthKeyPublic]{
			Item:  item,
			Items: a.auth.ListPersonalAPIKeyTyped(identity),
		})
	case http.MethodDelete:
		okDel, err := a.auth.DeleteKey(keyID, filter)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !okDel {
			util.WriteError(w, http.StatusNotFound, "个人 API Key 不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemsResponse[service.AuthKeyPublic]{Items: a.auth.ListPersonalAPIKeyTyped(identity)})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func profileAPIKeyFilter(identity service.Identity) (service.AuthKeyFilter, bool) {
	role := identity.Role
	if role != service.AuthRoleAdmin && role != service.AuthRoleUser {
		return service.AuthKeyFilter{}, false
	}
	ownerID := util.Clean(identity.OwnerID)
	if ownerID == "" {
		return service.AuthKeyFilter{}, false
	}
	return service.AuthKeyFilter{Role: role, Kind: service.AuthKindAPIKey, OwnerID: ownerID}, true
}
