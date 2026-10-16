package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const maxVideoReferenceAssetBytes = 20 << 20

func (a *App) handleVideoReferenceAssets(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	ownerID := identityScope(identity)
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/video-reference-assets" {
		switch r.Method {
		case http.MethodGet:
			limit := normalizedMediaPageLimit(util.ToInt(r.URL.Query().Get("limit"), 50))
			page, err := a.videoRefs.ListPage(ownerID, limit, r.URL.Query().Get("cursor"))
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			items := page.Items
			for index := range items {
				items[index] = decorateVideoReferenceAsset(items[index])
			}
			util.WriteJSON(w, http.StatusOK, cursorPageResponse[service.VideoReferenceAsset]{
				Items: items, Total: page.Total, HasMore: page.HasMore, NextCursor: page.NextCursor, Limit: limit,
			})
		case http.MethodPost:
			a.createVideoReferenceAsset(w, r, ownerID)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) == 3 && parts[0] == "api" && parts[1] == "video-reference-assets" && r.Method == http.MethodDelete {
		id, err := url.PathUnescape(parts[2])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "资产 ID 无效")
			return
		}
		if err := a.videoRefs.Delete(ownerID, id); err != nil {
			util.WriteError(w, http.StatusNotFound, "参考图片不存在")
			return
		}
		util.WriteJSON(w, http.StatusOK, deletedResponse{Deleted: true})
		return
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "video-reference-assets" && parts[3] == "content" {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		id, err := url.PathUnescape(parts[2])
		if err != nil {
			http.NotFound(w, r)
			return
		}
		path, asset, err := a.videoRefs.Resolve(ownerID, id)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", asset.MIMEType)
		http.ServeFile(w, r, path)
		return
	}
	http.NotFound(w, r)
}

func (a *App) createVideoReferenceAsset(w http.ResponseWriter, r *http.Request, ownerID string) {
	if err := parseMultipartFormWithinLimit(w, r, maxVideoReferenceAssetBytes+(2<<20), maxVideoReferenceAssetBytes+(2<<20)); err != nil {
		util.WriteError(w, http.StatusBadRequest, "参考图片上传失败")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	files := r.MultipartForm.File["image"]
	if len(files) != 1 || files[0] == nil {
		util.WriteError(w, http.StatusBadRequest, "请选择一张参考图片")
		return
	}
	header := files[0]
	if header.Size <= 0 || header.Size > maxVideoReferenceAssetBytes {
		util.WriteError(w, http.StatusBadRequest, fmt.Sprintf("参考图片不能超过 %dMB", maxVideoReferenceAssetBytes>>20))
		return
	}
	file, err := header.Open()
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "读取参考图片失败")
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxVideoReferenceAssetBytes+1))
	if err != nil || len(raw) == 0 || len(raw) > maxVideoReferenceAssetBytes {
		util.WriteError(w, http.StatusBadRequest, "参考图片文件无效")
		return
	}
	mimeType := http.DetectContentType(raw)
	if _, ok := map[string]struct{}{"image/png": {}, "image/jpeg": {}, "image/webp": {}, "image/gif": {}}[mimeType]; !ok {
		util.WriteError(w, http.StatusBadRequest, "仅支持 PNG、JPEG、WebP 或 GIF")
		return
	}
	asset, err := a.videoRefs.New(ownerID, header.Filename, mimeType, raw)
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "保存参考图片失败")
		return
	}
	asset = decorateVideoReferenceAsset(asset)
	util.WriteJSON(w, http.StatusCreated, asset)
}

func decorateVideoReferenceAsset(asset service.VideoReferenceAsset) service.VideoReferenceAsset {
	asset.Name = strings.TrimSpace(asset.Name)
	asset.URL = "/api/video-reference-assets/" + url.PathEscape(asset.ID) + "/content"
	return asset
}
