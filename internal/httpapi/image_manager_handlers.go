package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"errors"
	"net/http"
	"net/url"
	"strings"
)

func (a *App) handleImages(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		scope, status, message := imageListAccessScope(identity, r.URL.Query().Get("scope"))
		if status != 0 {
			util.WriteError(w, status, message)
			return
		}
		q := r.URL.Query()
		limit, err := parseImageListLimit(q)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		payload, err := a.images.ListImagesQuery(a.resolveImageBaseURL(r), service.ImageListQuery{
			StartDate:    strings.TrimSpace(q.Get("start_date")),
			EndDate:      strings.TrimSpace(q.Get("end_date")),
			Scope:        scope,
			Limit:        limit,
			Cursor:       strings.TrimSpace(q.Get("cursor")),
			UpdatedAfter: strings.TrimSpace(q.Get("updated_after")),
		})
		if err != nil {
			if a.logger != nil {
				a.logger.Error("list images failed", "error", err.Error())
			}
			util.WriteError(w, http.StatusInternalServerError, mapImageAPIError(err))
			return
		}
		a.decorateImageList(payload)
		// Typed list pilot: ImagePublic items/groups (same wire shape as map list).
		util.WriteJSON(w, http.StatusOK, service.ImageListFromPayload(payload))
	case http.MethodDelete:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
			return
		}
		// Non-admin callers may only delete their own images, even if RBAC grants DELETE.
		result, err := a.images.DeleteImagesTyped(util.AsStringSlice(body["paths"]), imageAccessScope(identity))
		if err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, service.ErrImageGalleryIndexPersistence) {
				status = http.StatusInternalServerError
			}
			util.WriteError(w, status, mapImageAPIError(err))
			return
		}
		util.WriteJSON(w, http.StatusOK, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleImageVisibility(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	path := util.Clean(body["path"])
	if path == "" {
		util.WriteError(w, http.StatusBadRequest, "请提供图片路径")
		return
	}
	visibility := util.Clean(body["visibility"])
	scope := service.ImageAccessScope{OwnerID: identityScope(identity)}
	if identity.Role == service.AuthRoleAdmin {
		scope = service.ImageAccessScope{All: true}
	}
	item, err := a.images.UpdateImageVisibility(path, visibility, scope)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, service.ErrImageGalleryIndexPersistence) {
			status = http.StatusInternalServerError
		}
		if err.Error() == "image not found" || err.Error() == "图片不存在" {
			status = http.StatusNotFound
		}
		util.WriteError(w, status, mapImageAPIError(err))
		return
	}
	a.decorateImageItem(item, a.imageOwnerDisplayNames())
	util.WriteJSON(w, http.StatusOK, itemResponse[service.ImagePublic]{Item: service.ImagePublicFromMap(item)})
}

func imageAccessScope(identity service.Identity) service.ImageAccessScope {
	if identity.Role == service.AuthRoleAdmin {
		return service.ImageAccessScope{All: true}
	}
	return service.ImageAccessScope{OwnerID: identityScope(identity)}
}

func imageListAccessScope(identity service.Identity, value string) (service.ImageAccessScope, int, string) {
	switch strings.TrimSpace(value) {
	case "":
		return imageAccessScope(identity), 0, ""
	case "mine":
		return service.ImageAccessScope{OwnerID: identityScope(identity)}, 0, ""
	case "public":
		// Public gallery is visibility-filtered for everyone, including admins.
		// Admins use scope=all for the full library (including private images).
		return service.ImageAccessScope{Public: true}, 0, ""
	case "all":
		if identity.Role != service.AuthRoleAdmin {
			return service.ImageAccessScope{}, http.StatusForbidden, "需要管理员权限"
		}
		return service.ImageAccessScope{All: true}, 0, ""
	default:
		return service.ImageAccessScope{}, http.StatusBadRequest, "scope 仅支持 mine、public 或 all"
	}
}

func parseImageListLimit(values url.Values) (int, error) {
	if !values.Has("limit") {
		return service.DefaultImageListLimit, nil
	}
	limit := util.ToInt(values.Get("limit"), 0)
	if limit < 1 || limit > service.MaxImageListLimit {
		return 0, errors.New("limit 必须是 1 到 200 之间的整数")
	}
	return limit, nil
}

func mapImageAPIError(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, service.ErrImageGalleryIndexPersistence) {
		return "图片索引保存失败，请稍后重试"
	}
	msg := strings.TrimSpace(err.Error())
	switch msg {
	case "image not found", "图片不存在":
		return "图片不存在"
	case "invalid visibility", "visibility must be private or public", "可见性仅支持 private 或 public":
		return "可见性仅支持 private 或 public"
	case "paths is required", "请提供图片路径":
		return "请提供图片路径"
	case "invalid image path", "图片路径无效":
		return "图片路径无效"
	default:
		return msg
	}
}

func (a *App) recordGeneratedImages(identity service.Identity, urls []string, visibility string) {
	if len(urls) == 0 || a.images == nil {
		return
	}
	ownerID := identityScope(identity)
	if err := a.images.RecordGeneratedImages(urls, ownerID, identityDisplayName(identity), visibility); err != nil && a.logger != nil {
		a.logger.Error("record generated images failed", "owner_id", ownerID, "image_count", len(urls), "error", err.Error())
	}
}

func (a *App) recordGeneratedImagesForPayload(identity service.Identity, urls []string, visibility string, payload map[string]any) {
	if len(urls) == 0 || a.images == nil {
		return
	}
	ownerID := identityScope(identity)
	err := a.images.RecordGeneratedImages(urls, ownerID, identityDisplayName(identity), visibility, service.GeneratedImageMetadata{
		ResolutionPreset: util.Clean(payload["image_resolution"]),
		RequestedSize:    util.Clean(payload["size"]),
		OutputFormat:     service.NormalizeImageOutputFormat(util.Clean(payload["output_format"])),
	})
	if err != nil && a.logger != nil {
		a.logger.Error("record generated image task output failed", "owner_id", ownerID, "image_count", len(urls), "error", err.Error())
	}
}

func (a *App) decorateImageList(payload map[string]any) {
	ownerNames := a.imageOwnerDisplayNames()
	for _, item := range util.AsMapSlice(payload["items"]) {
		a.decorateImageItem(item, ownerNames)
	}
}

func (a *App) decorateImageItem(item map[string]any, ownerNames map[string]string) {
	if item == nil || util.Clean(item["owner_name"]) != "" {
		return
	}
	ownerID := util.Clean(item["owner_id"])
	if ownerID == "" {
		item["owner_name"] = "未知用户"
		return
	}
	if name := ownerNames[ownerID]; name != "" {
		item["owner_name"] = name
		return
	}
	item["owner_name"] = "未知用户"
}

func (a *App) imageOwnerDisplayNames() map[string]string {
	names := map[string]string{"admin": "管理员"}
	for _, item := range a.auth.ListUsersTyped() {
		name := util.Clean(item.Name)
		if name == "" {
			continue
		}
		if id := util.Clean(item.ID); id != "" {
			names[id] = name
		}
		if ownerID := util.Clean(item.OwnerID); ownerID != "" {
			names[ownerID] = name
		}
	}
	return names
}
