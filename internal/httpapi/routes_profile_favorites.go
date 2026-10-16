package httpapi

import (
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleProfilePromptFavorites(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	ownerID := util.Clean(identity.OwnerID)
	if ownerID == "" {
		util.WriteError(w, http.StatusForbidden, "提示词收藏需要绑定用户账号")
		return
	}

	base := "/api/profile/prompt-favorites"
	if r.URL.Path == base {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, itemsResponse[service.PromptFavoritePublic]{Items: a.prompts.ListTyped(ownerID)})
		case http.MethodPost:
			body, err := readJSONMap(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
				return
			}
			item, err := a.prompts.Upsert(ownerID, body)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, itemListResponse[service.PromptFavoritePublic]{
				Item:  service.PromptFavoritePublicFromMap(item),
				Items: a.prompts.ListTyped(ownerID),
			})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	parts := splitPath(r.URL.Path)
	if len(parts) != 4 || parts[0] != "api" || parts[1] != "profile" || parts[2] != "prompt-favorites" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	okDel, err := a.prompts.Delete(ownerID, parts[3])
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !okDel {
		util.WriteError(w, http.StatusNotFound, "提示词收藏不存在")
		return
	}
	util.WriteJSON(w, http.StatusOK, itemsResponse[service.PromptFavoritePublic]{Items: a.prompts.ListTyped(ownerID)})
}
