package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleUserKeys(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	filter, owner, canManage := userKeyScope(identity)
	if !canManage {
		util.WriteError(w, http.StatusForbidden, "需要登录或管理员权限")
		return
	}
	base := "/api/auth/users"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			var items []service.AuthKeyPublic
			if identity.Role != service.AuthRoleAdmin {
				items = a.auth.ListSingleAPIKeyForOwnerTyped(identity.OwnerID)
			} else {
				items = a.auth.ListKeysTyped(filter)
			}
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.AuthKeyPublic]{Items: items})
		case http.MethodPost:
			body, ok := readJSONMapOr400(w, r)
			if !ok {
				return
			}
			var item service.AuthKeyPublic
			var raw string
			var err error
			if identity.Role == service.AuthRoleAdmin {
				item, raw, err = a.auth.CreateAPIKey(service.AuthRoleUser, util.Clean(body["name"]), owner)
			} else {
				item, raw, err = a.auth.UpsertAPIKeyForOwner(util.Clean(body["name"]), owner)
			}
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, itemKeyListResponse[service.AuthKeyPublic]{
				Item:  item,
				Key:   raw,
				Items: a.auth.ListKeysTyped(filter),
			})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) < 4 || parts[0] != "api" || parts[1] != "auth" || parts[2] != "users" {
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
			// Credential exists but plaintext is not stored (new keys), or id not found.
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
			util.WriteError(w, http.StatusNotFound, "用户密钥不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemListResponse[service.AuthKeyPublic]{
			Item:  item,
			Items: a.auth.ListKeysTyped(filter),
		})
	case http.MethodDelete:
		okDel, err := a.auth.DeleteKey(keyID, filter)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !okDel {
			util.WriteError(w, http.StatusNotFound, "用户密钥不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemsResponse[service.AuthKeyPublic]{Items: a.auth.ListKeysTyped(filter)})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func userKeyScope(identity service.Identity) (service.AuthKeyFilter, service.AuthOwner, bool) {
	filter := service.AuthKeyFilter{Role: service.AuthRoleUser, Kind: service.AuthKindAPIKey}
	if identity.Role == service.AuthRoleAdmin {
		return filter, service.AuthOwner{}, true
	}
	if identity.Role != service.AuthRoleUser || identity.OwnerID == "" {
		return service.AuthKeyFilter{}, service.AuthOwner{}, false
	}
	filter.OwnerID = identity.OwnerID
	return filter, service.AuthOwner{ID: identity.OwnerID, Name: identity.Name, Provider: identity.Provider}, true
}
