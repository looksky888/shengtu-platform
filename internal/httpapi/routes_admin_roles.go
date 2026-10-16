package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminRoles(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	base := "/api/admin/roles"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.ManagedRolePublic]{Items: a.auth.ListRolesTyped()})
		case http.MethodPost:
			var body service.ManagedRoleCreate
			if !readJSONOr400(w, r, &body) {
				return
			}
			item, err := a.auth.CreateRole(body)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, itemListResponse[service.ManagedRolePublic]{
				Item:  item,
				Items: a.auth.ListRolesTyped(),
			})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	parts := splitPath(r.URL.Path)
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "admin" || parts[2] != "roles" {
		http.NotFound(w, r)
		return
	}
	roleID := parts[3]
	switch r.Method {
	case http.MethodPost:
		var body service.ManagedRoleUpdate
		if !readJSONOr400(w, r, &body) {
			return
		}
		item, err := a.auth.UpdateRole(roleID, body)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "角色不存在" {
				status = http.StatusNotFound
			}
			util.WriteError(w, status, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, itemListResponse[service.ManagedRolePublic]{
			Item:  item,
			Items: a.auth.ListRolesTyped(),
		})
	case http.MethodDelete:
		deleted, err := a.auth.DeleteRole(roleID)
		if err != nil {
			status := http.StatusBadRequest
			msg := err.Error()
			if msg == "role is assigned to users" || msg == "角色仍分配给用户，无法删除" {
				status = http.StatusConflict
			}
			util.WriteError(w, status, msg)
			return
		}
		if !deleted {
			util.WriteError(w, http.StatusNotFound, "角色不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, itemsResponse[service.ManagedRolePublic]{Items: a.auth.ListRolesTyped()})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
