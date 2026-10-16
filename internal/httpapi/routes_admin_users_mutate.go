package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAdminUserRevealKey(w http.ResponseWriter, r *http.Request, userID string) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !a.auth.ManagedUserExists(userID) {
		util.WriteError(w, http.StatusNotFound, "用户不存在")
		return
	}
	key, found := a.auth.RevealUserAPIKey(userID)
	if !found {
		util.WriteError(w, http.StatusNotFound, "密钥明文仅重置后可查看一次，当前未保存")
		return
	}
	util.WriteJSON(w, http.StatusOK, keyResponse{Key: key})
}

func (a *App) handleAdminUserResetKey(w http.ResponseWriter, r *http.Request, userID string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, ok := readJSONMapOr400(w, r)
	if !ok {
		return
	}
	item, apiKey, raw, found, err := a.auth.ResetUserAPIKey(userID, util.Clean(body["name"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !found {
		util.WriteError(w, http.StatusNotFound, "用户不存在")
		return
	}
	util.WriteJSON(w, http.StatusOK, userResetKeyResponse{Item: item, APIKey: apiKey, Key: raw})
}

func (a *App) handleAdminUserUpdate(w http.ResponseWriter, r *http.Request, userID string) {
	var updates service.ManagedUserUpdate
	if !readJSONOr400(w, r, &updates) {
		return
	}
	if !updates.HasFields() {
		util.WriteError(w, http.StatusBadRequest, "未提供可更新字段")
		return
	}
	if updates.RoleID != nil {
		if roleID := util.Clean(*updates.RoleID); roleID != "" && !a.auth.RoleExists(roleID) {
			util.WriteError(w, http.StatusBadRequest, "角色不存在")
			return
		}
	}
	item, err := a.auth.UpdateUser(userID, updates)
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if item.ID == "" {
		util.WriteError(w, http.StatusNotFound, "用户不存在")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemResponse[service.ManagedUserPublic]{Item: item})
}

func (a *App) handleAdminUserDelete(w http.ResponseWriter, r *http.Request, identity service.Identity, userID string) {
	// Safety: never delete the currently signed-in identity or protected admins.
	selfID := util.Clean(identity.ID)
	ownerID := util.Clean(identity.OwnerID)
	if selfID != "" && userID == selfID {
		util.WriteError(w, http.StatusBadRequest, "不能删除当前登录账号")
		return
	}
	if ownerID != "" && userID == ownerID {
		util.WriteError(w, http.StatusBadRequest, "不能删除当前登录账号")
		return
	}
	if a.auth.IsProtectedManagedUser(userID) {
		util.WriteError(w, http.StatusBadRequest, "不能删除受保护的管理员账号")
		return
	}
	// Snapshot before delete for accountability audit.
	target, _ := a.auth.GetManagedUserPublic(userID)
	creditBalance := 0
	if a.credits != nil {
		if acc, err := a.credits.Account(userID); err == nil {
			creditBalance = acc.Balance
		}
	}
	okDel, err := a.auth.DeleteUser(userID)
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !okDel {
		util.WriteError(w, http.StatusNotFound, "用户不存在")
		return
	}
	a.logAdminUserDeleted(r, identity, target, userID, creditBalance)
	util.WriteJSON(w, http.StatusOK, deletedIDResponse{DeletedID: userID})
}
