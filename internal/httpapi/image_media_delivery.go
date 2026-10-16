package httpapi

import (
	"chatgpt2api/internal/service"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (a *App) handleImageFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rel, err := imageFileRequestPath(r)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ref, ok := a.authorizeImageFileRequest(w, r, rel)
	if !ok {
		return
	}
	if ref.Remote {
		if r.Method == http.MethodGet && imageDownloadRequested(r) {
			reader, contentType, err := a.images.OpenImage(r.Context(), ref)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer reader.Close()
			if err := streamImageDownload(w, rel, contentType, ref.Asset.SizeBytes, reader); err != nil && a.logger != nil {
				a.logger.Warning("stream remote image download failed", "path", rel, "error", err.Error())
			}
			return
		}
		delivery, err := a.images.Delivery(r.Context(), ref, service.MediaDeliveryOptions{Method: r.Method, Download: imageDownloadRequested(r)})
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if delivery.RedirectURL != "" {
			redirectRemoteMedia(w, r, delivery.RedirectURL)
			return
		}
		if delivery.ContentType != "" {
			w.Header().Set("Content-Type", delivery.ContentType)
		}
		http.ServeFile(w, r, delivery.LocalPath)
		return
	}
	if imageDownloadRequested(r) {
		w.Header().Set("Content-Disposition", service.MediaDownloadDisposition(rel))
	}
	http.ServeFile(w, r, ref.Path)
}

func streamImageDownload(w http.ResponseWriter, rel, contentType string, size int64, reader io.Reader) error {
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Content-Disposition", service.MediaDownloadDisposition(rel))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	if size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	_, err := io.Copy(w, reader)
	return err
}

func (a *App) authorizeImageFileRequest(w http.ResponseWriter, r *http.Request, rel string) (service.ImageFileAccess, bool) {
	ref, err := a.images.ImageFileAccess(rel, service.ImageAccessScope{All: true})
	if err != nil {
		http.NotFound(w, r)
		return service.ImageFileAccess{}, false
	}
	if ref.Visibility == service.ImageVisibilityPublic {
		return ref, true
	}
	identity, ok := a.imageRequestIdentity(w, r)
	if !ok {
		return service.ImageFileAccess{}, false
	}
	if identity.Role == service.AuthRoleAdmin || (ref.OwnerID != "" && ref.OwnerID == identityScope(identity)) {
		return ref, true
	}
	http.NotFound(w, r)
	return service.ImageFileAccess{}, false
}

func (a *App) handleImageThumbnail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	thumbnailRel, err := imageThumbnailRequestPath(r)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	sourceRel, sourceErr := a.images.SourceImageRelativePathFromThumbnail(thumbnailRel)
	if sourceErr != nil {
		http.NotFound(w, r)
		return
	}
	access, ok := a.authorizeImageFileRequest(w, r, sourceRel)
	if !ok {
		return
	}
	if access.Remote {
		delivery, err := a.images.Delivery(r.Context(), access, service.MediaDeliveryOptions{Thumbnail: true, Method: r.Method})
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if delivery.RedirectURL != "" {
			redirectRemoteMedia(w, r, delivery.RedirectURL)
			return
		}
		w.Header().Set("Cache-Control", imageThumbnailCacheControl)
		if delivery.ContentType != "" {
			w.Header().Set("Content-Type", delivery.ContentType)
		}
		http.ServeFile(w, r, delivery.LocalPath)
		return
	}
	_ = a.images.EnsureThumbnail(thumbnailRel)
	thumbPath := filepath.Join(a.config.ImageThumbnailsDir(), filepath.FromSlash(thumbnailRel))
	if info, err := os.Stat(thumbPath); err == nil && !info.IsDir() {
		w.Header().Set("Cache-Control", imageThumbnailCacheControl)
		http.ServeFile(w, r, thumbPath)
		return
	}
	sourcePath := filepath.Join(a.config.ImagesDir(), filepath.FromSlash(sourceRel))
	if info, err := os.Stat(sourcePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, sourcePath)
		return
	}
	http.NotFound(w, r)
}

func redirectRemoteMedia(w http.ResponseWriter, r *http.Request, target string) {
	w.Header().Set("Cache-Control", remoteMediaCacheControl)
	http.Redirect(w, r, target, http.StatusFound)
}

func imageDownloadRequested(r *http.Request) bool {
	return r != nil && r.URL.Query().Get("download") == "1"
}

func imageFileRequestPath(r *http.Request) (string, error) {
	raw := strings.TrimPrefix(r.URL.EscapedPath(), "/images/")
	if raw == "" || raw == r.URL.EscapedPath() {
		return "", errors.New("图片路径无效")
	}
	return url.PathUnescape(raw)
}

func imageThumbnailRequestPath(r *http.Request) (string, error) {
	raw := strings.TrimPrefix(r.URL.EscapedPath(), "/image-thumbnails/")
	if raw == "" || raw == r.URL.EscapedPath() {
		return "", errors.New("缩略图路径无效")
	}
	return url.PathUnescape(raw)
}
