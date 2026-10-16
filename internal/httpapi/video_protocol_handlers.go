package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

// handleProtocolVideos exposes an OpenAI-style asynchronous video contract
// while keeping generation, billing, account scheduling and archive logic in
// ImageTaskService and VideoAssetService.
func (a *App) handleProtocolVideos(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/v1/videos" && r.Method == http.MethodPost {
		a.handleProtocolVideoSubmit(w, r, identity)
		return
	}
	if r.URL.Path == "/v1/videos" && r.Method == http.MethodGet {
		a.handleProtocolVideoList(w, r, identity)
		return
	}
	if len(parts) == 3 && parts[0] == "v1" && parts[1] == "videos" {
		id, err := url.PathUnescape(parts[2])
		if err != nil || strings.TrimSpace(id) == "" {
			util.WriteError(w, http.StatusBadRequest, "视频 ID 无效")
			return
		}
		if r.Method == http.MethodGet {
			a.handleProtocolVideoStatus(w, r, identity, id)
			return
		}
		if r.Method == http.MethodDelete {
			a.handleProtocolVideoCancel(w, r, identity, id)
			return
		}
	}
	if len(parts) == 4 && parts[0] == "v1" && parts[1] == "videos" && parts[3] == "content" && r.Method == http.MethodGet {
		a.handleProtocolVideoContent(w, r, identity, parts[2])
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}

func (a *App) handleProtocolVideoSubmit(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	body, err := readProtocolVideoBody(w, r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	clientTaskID := strings.TrimSpace(util.Clean(body["client_task_id"]))
	if headerKey := strings.TrimSpace(r.Header.Get("Idempotency-Key")); headerKey != "" {
		if clientTaskID != "" && clientTaskID != headerKey {
			util.WriteError(w, http.StatusBadRequest, "client_task_id 与 Idempotency-Key 不一致")
			return
		}
		clientTaskID = headerKey
	}
	if clientTaskID == "" {
		clientTaskID = util.NewUUID()
	}
	if len(clientTaskID) > 128 || strings.ContainsAny(clientTaskID, "\r\n\x00") {
		util.WriteError(w, http.StatusBadRequest, "幂等键长度必须为 1 到 128 个字符且不能包含控制符")
		return
	}
	body["client_task_id"] = clientTaskID
	imageReference := body["image_reference"]
	if imageReference == nil {
		imageReference = body["input_reference"]
	}
	fingerprint, err := protocolVideoRequestFingerprint(body, imageReference)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "视频请求参数无法序列化")
		return
	}
	task, err := a.tasks.SubmitVideoWithOptions(r.Context(), identity, util.Clean(body["client_task_id"]), util.Clean(body["prompt"]), firstNonEmpty(util.Clean(body["model"]), "grok-imagine-video"), util.Clean(body["size"]), util.ToInt(body["seconds"], 6), util.Clean(body["resolution_name"]), util.Clean(body["preset"]), imageReference, body["reference_images"], service.VideoTaskSubmitOptions{RequestFingerprint: fingerprint})
	if err != nil {
		writeCreationTaskSubmitError(w, err)
		return
	}
	public := service.ImageTaskPublicFromMap(task)
	result := protocolVideoFromTask(public, "")
	result.Seconds = util.ToInt(body["seconds"], 6)
	result.Size = util.Clean(body["size"])
	result.ResolutionName = util.Clean(body["resolution_name"])
	util.WriteJSON(w, http.StatusAccepted, result)
}

func protocolVideoRequestFingerprint(body map[string]any, imageReference any) (string, error) {
	canonical := map[string]any{
		"prompt":           strings.TrimSpace(util.Clean(body["prompt"])),
		"model":            firstNonEmpty(util.Clean(body["model"]), "grok-imagine-video"),
		"size":             util.Clean(body["size"]),
		"seconds":          util.ToInt(body["seconds"], 6),
		"resolution_name":  util.Clean(body["resolution_name"]),
		"preset":           util.Clean(body["preset"]),
		"image_reference":  imageReference,
		"reference_images": body["reference_images"],
	}
	encoded, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func (a *App) handleProtocolVideoList(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	limit := util.ToInt(r.URL.Query().Get("limit"), 20)
	status, err := protocolVideoStatusFilter(r.URL.Query().Get("status"))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	page, err := a.tasks.ListVideoTasksPage(identity, limit, r.URL.Query().Get("after"), status)
	if err != nil {
		var persistenceErr *service.ImageTaskPersistenceError
		if errors.As(err, &persistenceErr) {
			util.WriteError(w, http.StatusServiceUnavailable, err.Error())
		} else {
			util.WriteError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	data := make([]protocolVideo, 0, len(page.Items))
	for _, task := range page.Items {
		contentURL := ""
		if task.Status == service.TaskStatusSuccess {
			if asset, ok := a.videos.FindOwned(task.ID, identityScope(identity), false); ok {
				contentURL = "/v1/videos/" + url.PathEscape(asset.ID) + "/content"
			}
		}
		item := protocolVideoFromTask(task, contentURL)
		if asset, ok := a.videos.FindOwned(task.ID, identityScope(identity), false); ok {
			item.Seconds, item.Size, item.ResolutionName = asset.Seconds, asset.Size, asset.ResolutionName
		}
		data = append(data, item)
	}
	util.WriteJSON(w, http.StatusOK, protocolVideoList{Object: "list", Data: data, Total: page.Total, HasMore: page.HasMore, NextCursor: page.NextCursor})
}

func protocolVideoStatusFilter(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "all":
		return "", nil
	case "queued":
		return service.TaskStatusQueued, nil
	case "in_progress":
		return service.TaskStatusRunning, nil
	case "completed":
		return service.TaskStatusSuccess, nil
	case "failed":
		return service.TaskStatusError, nil
	case "cancelled":
		return service.TaskStatusCancelled, nil
	default:
		return "", fmt.Errorf("视频状态必须为 queued、in_progress、completed、failed 或 cancelled")
	}
}

func (a *App) handleProtocolVideoCancel(w http.ResponseWriter, r *http.Request, identity service.Identity, id string) {
	if _, found := a.tasks.FindOwnedVideoTask(identity, id); !found {
		http.NotFound(w, r)
		return
	}
	task, err := a.tasks.CancelTask(identity, id)
	if err != nil {
		util.WriteError(w, creationTaskErrorStatus(err), mapCreationTaskError(err))
		return
	}
	public := service.ImageTaskPublicFromMap(task)
	util.WriteJSON(w, http.StatusOK, protocolVideoFromTask(public, ""))
}

func (a *App) handleProtocolVideoStatus(w http.ResponseWriter, r *http.Request, identity service.Identity, id string) {
	task, found := a.tasks.FindOwnedVideoTask(identity, id)
	if !found || task.Mode != "video" {
		http.NotFound(w, r)
		return
	}
	contentURL := ""
	if task.Status == service.TaskStatusSuccess {
		if asset, ok := a.videos.FindOwned(id, identityScope(identity), false); ok {
			contentURL = "/v1/videos/" + url.PathEscape(asset.ID) + "/content"
			result := protocolVideoFromTask(task, contentURL)
			result.Seconds, result.Size, result.ResolutionName = asset.Seconds, asset.Size, asset.ResolutionName
			util.WriteJSON(w, http.StatusOK, result)
			return
		}
	}
	util.WriteJSON(w, http.StatusOK, protocolVideoFromTask(task, contentURL))
}

func (a *App) handleProtocolVideoContent(w http.ResponseWriter, r *http.Request, identity service.Identity, id string) {
	decoded, err := url.PathUnescape(id)
	if err != nil || strings.TrimSpace(decoded) == "" {
		http.NotFound(w, r)
		return
	}
	asset, ok := a.videos.FindOwned(decoded, identityScope(identity), false)
	if !ok {
		http.NotFound(w, r)
		return
	}
	path := a.videos.ContentPath(asset.OwnerID, asset.TaskID)
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", firstNonEmpty(asset.ContentType, "video/mp4"))
	w.Header().Set("Cache-Control", "private, no-store")
	if util.ToBool(r.URL.Query().Get("download")) {
		name := asset.ID
		if len(name) > 16 {
			name = name[:16]
		}
		w.Header().Set("Content-Disposition", `attachment; filename="grok-video-`+name+`.mp4"`)
	}
	http.ServeFile(w, r, path)
}

func readProtocolVideoBody(w http.ResponseWriter, r *http.Request) (map[string]any, error) {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := parseMultipartFormWithinLimit(w, r, maxVideoContentBytes, maxMultipartFormMemory); err != nil {
			return nil, fmt.Errorf("解析视频表单失败（体积可能过大）")
		}
		body := map[string]any{
			"client_task_id": firstForm(r.MultipartForm, "client_task_id"), "prompt": firstForm(r.MultipartForm, "prompt"),
			"model": firstForm(r.MultipartForm, "model"), "size": firstForm(r.MultipartForm, "size"),
			"seconds": util.ToInt(firstForm(r.MultipartForm, "seconds"), 6), "resolution_name": firstForm(r.MultipartForm, "resolution_name"), "preset": firstForm(r.MultipartForm, "preset"),
		}
		var refs []any
		for _, field := range []string{"image", "image[]", "reference_image", "reference_images"} {
			for _, header := range r.MultipartForm.File[field] {
				if len(refs) >= 8 {
					return nil, fmt.Errorf("首帧和参考图片合计最多 8 张")
				}
				image, err := readUpload(header)
				if err != nil {
					return nil, err
				}
				mimeType := http.DetectContentType(image.Data)
				if !strings.HasPrefix(mimeType, "image/") {
					return nil, fmt.Errorf("参考文件必须是图片")
				}
				refs = append(refs, "data:"+mimeType+";base64,"+base64.StdEncoding.EncodeToString(image.Data))
			}
		}
		if len(refs) > 0 {
			body["image_reference"] = refs[0]
			if len(refs) > 1 {
				body["reference_images"] = refs[1:]
			}
		}
		return body, nil
	}
	body, err := readJSONMap(r)
	if err != nil {
		return nil, fmt.Errorf("请求体不是合法 JSON")
	}
	return body, nil
}

func protocolVideoTimestamp(value any) int64 {
	text := strings.TrimSpace(util.Clean(value))
	if text == "" {
		return 0
	}
	if seconds, err := strconv.ParseInt(text, 10, 64); err == nil {
		return seconds
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05"} {
		if parsed, err := time.ParseInLocation(layout, text, util.ChinaLocation()); err == nil {
			return parsed.Unix()
		}
	}
	return 0
}

func protocolVideoProgress(value any) int {
	n := util.ToInt(value, 0)
	if n < 0 {
		return 0
	}
	if n > 100 {
		return 100
	}
	return n
}
