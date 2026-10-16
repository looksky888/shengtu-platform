package httpapi

import (
	"net/http"
	"net/url"
	"os"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleVideos(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/videos" {
		switch r.Method {
		case http.MethodGet:
			scope, status, message := videoListScope(identity, r.URL.Query().Get("scope"))
			if status != 0 {
				util.WriteError(w, status, message)
				return
			}
			limit := normalizedMediaPageLimit(util.ToInt(r.URL.Query().Get("limit"), 50))
			page, err := a.videos.ListPage(scope, limit, r.URL.Query().Get("cursor"))
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			items := page.Items
			for index := range items {
				items[index].URL = "/api/videos/" + url.PathEscape(items[index].ID) + "/content"
			}
			util.WriteJSON(w, http.StatusOK, scopedCursorPageResponse[service.VideoAsset]{
				Items: items, Total: page.Total, HasMore: page.HasMore, NextCursor: page.NextCursor, Limit: limit,
				Scope: scope.Kind,
			})
		case http.MethodDelete:
			body, readOK := readJSONMapOr400(w, r)
			if !readOK {
				return
			}
			scope := service.VideoAssetScope{OwnerID: identityScope(identity), Kind: service.VideoAssetScopeMine}
			if identity.Role == service.AuthRoleAdmin {
				scope.Kind = service.VideoAssetScopeAll
			}
			deleted, err := a.videos.Delete(firstNonEmpty(util.Clean(body["id"]), util.Clean(body["task_id"])), scope)
			if err != nil {
				util.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if !deleted {
				http.NotFound(w, r)
				return
			}
			util.WriteJSON(w, http.StatusOK, deletedResponse{Deleted: true})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if r.URL.Path == "/api/videos/visibility" {
		if r.Method != http.MethodPatch {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		body, readOK := readJSONMapOr400(w, r)
		if !readOK {
			return
		}
		scope := service.VideoAssetScope{OwnerID: identityScope(identity), Kind: service.VideoAssetScopeMine}
		if identity.Role == service.AuthRoleAdmin {
			scope.Kind = service.VideoAssetScopeAll
		}
		item, err := a.videos.UpdateVisibility(firstNonEmpty(util.Clean(body["id"]), util.Clean(body["task_id"])), util.Clean(body["visibility"]), scope)
		if err != nil {
			if os.IsNotExist(err) {
				http.NotFound(w, r)
				return
			}
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		item.URL = "/api/videos/" + url.PathEscape(item.ID) + "/content"
		util.WriteJSON(w, http.StatusOK, itemResponse[service.VideoAsset]{Item: item})
		return
	}
	if r.Method != http.MethodGet || len(parts) != 4 || parts[0] != "api" || parts[1] != "videos" || parts[3] != "content" {
		http.NotFound(w, r)
		return
	}
	assetID, err := url.PathUnescape(parts[2])
	if err != nil || strings.TrimSpace(assetID) == "" {
		util.WriteError(w, http.StatusBadRequest, "视频 ID 无效")
		return
	}
	asset, exists := a.videos.FindAccessible(assetID, identityScope(identity), identity.Role == service.AuthRoleAdmin)
	if !exists {
		http.NotFound(w, r)
		return
	}
	path := a.videos.ContentPath(asset.OwnerID, asset.TaskID)
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if util.ToBool(r.URL.Query().Get("download")) {
		filenameID := asset.ID
		if len(filenameID) > 16 {
			filenameID = filenameID[:16]
		}
		w.Header().Set("Content-Disposition", `attachment; filename="grok-video-`+filenameID+`.mp4"`)
	}
	http.ServeFile(w, r, path)
}

func videoListScope(identity service.Identity, requested string) (service.VideoAssetScope, int, string) {
	kind := strings.ToLower(strings.TrimSpace(requested))
	if kind == "" {
		if identity.Role == service.AuthRoleAdmin {
			kind = service.VideoAssetScopeAll
		} else {
			kind = service.VideoAssetScopeMine
		}
	}
	if kind != service.VideoAssetScopeMine && kind != service.VideoAssetScopePublic && kind != service.VideoAssetScopeAll {
		return service.VideoAssetScope{}, http.StatusBadRequest, "视频库范围必须为 mine、public 或 all"
	}
	if kind == service.VideoAssetScopeAll && identity.Role != service.AuthRoleAdmin {
		return service.VideoAssetScope{}, http.StatusForbidden, "只有管理员可以查看全部视频"
	}
	return service.VideoAssetScope{OwnerID: identityScope(identity), Kind: kind}, 0, ""
}
