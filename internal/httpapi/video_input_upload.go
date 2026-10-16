package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	videoInputReferencePrefix = "video-input:"
	videoAssetReferencePrefix = "video-ref:"
	videoInputTTL             = 72 * time.Hour
	maxVideoInputsPerOwner    = 20
	maxVideoInputBodyBytes    = maxUploadImageBytes + (2 << 20)
)

var videoInputMIME = map[string]struct{}{
	"image/gif": {}, "image/jpeg": {}, "image/png": {}, "image/webp": {},
}

type videoInputUploadResponse struct {
	InputReference string `json:"input_reference"`
	Filename       string `json:"filename"`
	MIMEType       string `json:"mime_type"`
	SizeBytes      int    `json:"size_bytes"`
	ExpiresAt      string `json:"expires_at"`
}

func (a *App) handleVideoInputUpload(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	if err := parseMultipartFormWithinLimit(w, r, maxVideoInputBodyBytes, maxVideoInputBodyBytes); err != nil {
		util.WriteError(w, http.StatusBadRequest, "首帧图片上传失败：请求体过大或表单格式无效")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	files := r.MultipartForm.File["image"]
	if len(files) != 1 || files[0] == nil {
		util.WriteError(w, http.StatusBadRequest, "请选择一张首帧图片")
		return
	}
	header := files[0]
	if header.Size > maxUploadImageBytes {
		util.WriteError(w, http.StatusBadRequest, fmt.Sprintf("首帧图片不能超过 %dMB", maxUploadImageBytes>>20))
		return
	}
	file, err := header.Open()
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "读取首帧图片失败")
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxUploadImageBytes+1))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "读取首帧图片失败")
		return
	}
	if len(raw) == 0 {
		util.WriteError(w, http.StatusBadRequest, "首帧图片为空")
		return
	}
	if int64(len(raw)) > maxUploadImageBytes {
		util.WriteError(w, http.StatusBadRequest, fmt.Sprintf("首帧图片不能超过 %dMB", maxUploadImageBytes>>20))
		return
	}
	mimeType := http.DetectContentType(raw)
	if _, ok := videoInputMIME[mimeType]; !ok {
		util.WriteError(w, http.StatusBadRequest, "首帧仅支持 PNG、JPEG、WebP 或 GIF 图片")
		return
	}

	ownerDir := videoInputOwnerDir(a.config.DataDir, identityScope(identity))
	cleanupVideoInputs(ownerDir, time.Now())
	id, err := newVideoInputID()
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "创建首帧引用失败")
		return
	}
	if err := storage.AtomicWriteFile(filepath.Join(ownerDir, id), raw, 0o600); err != nil {
		util.WriteError(w, http.StatusInternalServerError, "保存首帧图片失败")
		return
	}
	expiresAt := time.Now().Add(videoInputTTL)
	util.WriteJSON(w, http.StatusCreated, videoInputUploadResponse{
		InputReference: videoInputReferencePrefix + id,
		Filename:       filepath.Base(header.Filename), MIMEType: mimeType,
		SizeBytes: len(raw), ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

func (a *App) resolveVideoInputPayload(payload map[string]any) (map[string]any, error) {
	legacyReference := payload["image_reference"] == nil && payload["reference_images"] == nil
	reference := util.Clean(payload["image_reference"])
	if reference == "" {
		reference = util.Clean(payload["input_reference"])
	}
	if !strings.HasPrefix(reference, videoInputReferencePrefix) {
		if strings.HasPrefix(reference, videoAssetReferencePrefix) {
			value, err := a.resolveVideoInputValue(reference, util.Clean(payload["owner_id"]))
			if err != nil {
				return nil, err
			}
			return a.resolveVideoReferenceList(payload, value)
		}
		return a.resolveVideoReferenceList(payload, reference)
	}
	id := strings.TrimPrefix(reference, videoInputReferencePrefix)
	if !isVideoInputID(id) {
		return nil, videoRuntimeError(http.StatusBadRequest, "video_input_invalid", "首帧图片引用无效，请重新上传")
	}
	ownerID := util.Clean(payload["owner_id"])
	if ownerID == "" {
		return nil, videoRuntimeError(http.StatusBadRequest, "video_input_owner_missing", "首帧图片缺少所属用户")
	}
	path := filepath.Join(videoInputOwnerDir(a.config.DataDir, ownerID), id)
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, videoRuntimeError(http.StatusBadRequest, "video_input_not_found", "首帧图片已失效，请重新上传")
		}
		return nil, videoRuntimeError(http.StatusInternalServerError, "video_input_read_failed", "读取首帧图片失败")
	}
	if time.Since(info.ModTime()) > videoInputTTL {
		_ = os.Remove(path)
		return nil, videoRuntimeError(http.StatusBadRequest, "video_input_expired", "首帧图片已过期，请重新上传")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, videoRuntimeError(http.StatusInternalServerError, "video_input_read_failed", "读取首帧图片失败")
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxUploadImageBytes+1))
	if err != nil || len(raw) == 0 || int64(len(raw)) > maxUploadImageBytes {
		return nil, videoRuntimeError(http.StatusBadRequest, "video_input_invalid", "首帧图片文件无效，请重新上传")
	}
	mimeType := http.DetectContentType(raw)
	if _, ok := videoInputMIME[mimeType]; !ok {
		return nil, videoRuntimeError(http.StatusBadRequest, "video_input_invalid", "首帧图片格式无效，请重新上传")
	}
	resolved := make(map[string]any, len(payload)+1)
	for key, value := range payload {
		resolved[key] = value
	}
	imageData := "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(raw)
	if legacyReference {
		resolved["input_reference"] = imageData
		return resolved, nil
	}
	resolved["input_reference"] = imageData
	resolved["image"] = map[string]any{"url": imageData}
	delete(resolved, "image_reference")
	return a.resolveVideoReferenceList(resolved, imageData)
}

func (a *App) resolveVideoReferenceList(payload map[string]any, imageReference string) (map[string]any, error) {
	resolved := make(map[string]any, len(payload)+1)
	for key, value := range payload {
		resolved[key] = value
	}
	hasImage := imageReference != "" || payload["image"] != nil
	if imageReference != "" && payload["image"] == nil {
		resolved["image"] = map[string]any{"url": imageReference}
	}
	if raw, ok := payload["reference_images"]; ok && raw != nil {
		items, ok := raw.([]any)
		if !ok || (hasImage && len(items) > 7) || (!hasImage && len(items) > 8) {
			return nil, videoRuntimeError(http.StatusBadRequest, "video_input_reference_limit", "首帧和参考图片合计最多 8 张")
		}
		refs := make([]any, 0, len(items))
		for _, item := range items {
			value := util.Clean(item)
			if value == "" {
				continue
			}
			if strings.HasPrefix(value, videoInputReferencePrefix) || strings.HasPrefix(value, videoAssetReferencePrefix) {
				one, err := a.resolveVideoInputValue(value, util.Clean(payload["owner_id"]))
				if err != nil {
					return nil, err
				}
				value = one
			}
			refs = append(refs, map[string]any{"url": value})
		}
		resolved["reference_images"] = refs
	}
	delete(resolved, "image_reference")
	return resolved, nil
}

func (a *App) resolveVideoInputValue(reference, ownerID string) (string, error) {
	if strings.HasPrefix(reference, videoAssetReferencePrefix) {
		id := strings.TrimPrefix(reference, videoAssetReferencePrefix)
		path, asset, err := a.videoRefs.Resolve(ownerID, id)
		if err != nil {
			return "", videoRuntimeError(http.StatusBadRequest, "video_reference_asset_not_found", "参考图资产不存在或已删除")
		}
		raw, err := os.ReadFile(path)
		if err != nil || len(raw) == 0 || int64(len(raw)) > maxVideoReferenceAssetBytes {
			return "", videoRuntimeError(http.StatusBadRequest, "video_reference_asset_invalid", "参考图资产文件无效")
		}
		return "data:" + asset.MIMEType + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
	}
	if ownerID == "" {
		return "", videoRuntimeError(http.StatusBadRequest, "video_input_owner_missing", "视频输入缺少所属用户")
	}
	id := strings.TrimPrefix(reference, videoInputReferencePrefix)
	if !isVideoInputID(id) {
		return "", videoRuntimeError(http.StatusBadRequest, "video_input_invalid", "视频图片引用无效")
	}
	path := filepath.Join(videoInputOwnerDir(a.config.DataDir, ownerID), id)
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", videoRuntimeError(http.StatusBadRequest, "video_input_not_found", "视频图片已失效")
		}
		return "", videoRuntimeError(http.StatusInternalServerError, "video_input_read_failed", "读取视频图片失败")
	}
	if time.Since(info.ModTime()) > videoInputTTL {
		_ = os.Remove(path)
		return "", videoRuntimeError(http.StatusBadRequest, "video_input_expired", "视频图片已过期")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", videoRuntimeError(http.StatusInternalServerError, "video_input_read_failed", "读取视频图片失败")
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxUploadImageBytes+1))
	if err != nil || len(raw) == 0 || int64(len(raw)) > maxUploadImageBytes {
		return "", videoRuntimeError(http.StatusBadRequest, "video_input_invalid", "视频图片文件无效")
	}
	mimeType := http.DetectContentType(raw)
	if _, ok := videoInputMIME[mimeType]; !ok {
		return "", videoRuntimeError(http.StatusBadRequest, "video_input_invalid", "视频图片格式无效")
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}

func newVideoInputID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func isVideoInputID(value string) bool {
	if len(value) != 32 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func videoInputOwnerDir(dataDir, ownerID string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(ownerID)))
	return filepath.Join(dataDir, "video-inputs", hex.EncodeToString(sum[:]))
}

func cleanupVideoInputs(dir string, now time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	type retainedFile struct {
		name    string
		modTime time.Time
	}
	retained := make([]retainedFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isVideoInputID(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if now.Sub(info.ModTime()) > videoInputTTL {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
			continue
		}
		retained = append(retained, retainedFile{name: entry.Name(), modTime: info.ModTime()})
	}
	// Keep room for the upload currently being accepted. This bounds one user's
	// temporary input storage without scanning or affecting other users.
	sort.Slice(retained, func(i, j int) bool { return retained[i].modTime.After(retained[j].modTime) })
	keep := min(len(retained), maxVideoInputsPerOwner-1)
	for _, item := range retained[keep:] {
		_ = os.Remove(filepath.Join(dir, item.name))
	}
}
