package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleCreationTasks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/creation-tasks/video-inputs" && r.Method == http.MethodPost {
		a.handleVideoInputUpload(w, r, identity)
		return
	}
	if r.URL.Path == "/api/creation-tasks" && r.Method == http.MethodGet {
		// Typed list pilot: stable ImageTaskPublic JSON (same wire shape as publicTask maps).
		ids := util.ParseCommaList(r.URL.Query().Get("ids"))
		if len(ids) > 0 {
			util.WriteJSON(w, http.StatusOK, a.tasks.ListTasksTyped(identity, ids))
		} else {
			util.WriteJSON(w, http.StatusOK, a.tasks.ListRecentTasksTyped(identity, util.ToInt(r.URL.Query().Get("limit"), 20), r.URL.Query().Get("status")))
		}
		return
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "creation-tasks" && parts[3] == "cancel" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		task, err := a.tasks.CancelTask(identity, parts[2])
		if err != nil {
			util.WriteError(w, creationTaskErrorStatus(err), mapCreationTaskError(err))
			return
		}
		util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
		return
	}
	if r.URL.Path == "/api/creation-tasks/image-generations" && r.Method == http.MethodPost {
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
		if err := validateImageGenerationResolution(body, model, false); err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		metadata, err := a.imageTaskRequestMetadata(body, model, service.ImageCapabilityGenerate)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		task, err := a.tasks.SubmitGenerationWithOptions(r.Context(), identity, util.Clean(body["client_task_id"]), util.Clean(body["prompt"]), model, util.Clean(body["size"]), util.Clean(body["quality"]), a.resolveImageBaseURL(r), util.ToInt(body["n"], 1), body["messages"], metadata, imageOutputOptionsFromBody(body), util.Clean(body["visibility"]))
		if err != nil {
			writeCreationTaskSubmitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
		return
	}
	if r.URL.Path == "/api/creation-tasks/response-image-generations" && r.Method == http.MethodPost {
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
		if err := validateImageGenerationResolution(body, model, len(util.AsStringSlice(body["images"])) > 0); err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		metadata, err := a.imageTaskRequestMetadata(body, model, service.ImageCapabilityGenerate)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		task, err := a.tasks.SubmitResponseImageGenerationWithOptions(r.Context(), identity, util.Clean(body["client_task_id"]), util.Clean(body["prompt"]), model, util.Clean(body["size"]), util.Clean(body["quality"]), a.resolveImageBaseURL(r), body["images"], util.ToInt(body["n"], 1), body["messages"], metadata, imageOutputOptionsFromBody(body), util.Clean(body["visibility"]))
		if err != nil {
			writeCreationTaskSubmitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
		return
	}
	if r.URL.Path == "/api/creation-tasks/chat-completions" && r.Method == http.MethodPost {
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		task, err := a.tasks.SubmitChat(r.Context(), identity, util.Clean(body["client_task_id"]), util.Clean(body["prompt"]), firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto), body["messages"])
		if err != nil {
			writeCreationTaskSubmitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
		return
	}
	if r.URL.Path == "/api/creation-tasks/video-generations" && r.Method == http.MethodPost {
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		imageReference := body["image_reference"]
		if imageReference == nil {
			// Legacy single-reference requests treat the image as the first frame.
			imageReference = body["input_reference"]
		}
		task, err := a.tasks.SubmitVideo(
			r.Context(), identity, util.Clean(body["client_task_id"]), util.Clean(body["prompt"]),
			firstNonEmpty(util.Clean(body["model"]), "grok-imagine-video"), util.Clean(body["size"]),
			util.ToInt(body["seconds"], 6), util.Clean(body["resolution_name"]), util.Clean(body["preset"]),
			imageReference, body["reference_images"],
		)
		if err != nil {
			writeCreationTaskSubmitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
		return
	}
	if r.URL.Path == "/api/creation-tasks/image-edits" && r.Method == http.MethodPost {
		body, images, err := readMultipartImageBody(w, r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
		if err := validateImageGenerationResolution(body, model, true); err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		metadata, err := a.imageTaskRequestMetadata(body, model, service.ImageCapabilityEdit)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		task, err := a.tasks.SubmitEditWithOptions(r.Context(), identity, util.Clean(body["client_task_id"]), util.Clean(body["prompt"]), model, util.Clean(body["size"]), util.Clean(body["quality"]), a.resolveImageBaseURL(r), images, util.ToInt(body["n"], 1), body["messages"], metadata, imageOutputOptionsFromBody(body), util.Clean(body["visibility"]))
		if err != nil {
			writeCreationTaskSubmitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, service.ImageTaskPublicFromMap(task))
		return
	}
	http.NotFound(w, r)
}

func (a *App) imageTaskRequestMetadata(body map[string]any, model string, capability string) (map[string]any, error) {
	size := util.Clean(body["size"])
	metadata, err := a.imageTaskRouteMetadataForRequest(body, model, capability)
	if err != nil {
		return nil, err
	}
	if err := validateImageSizeForProvider(util.Clean(metadata["effective_provider"]), size); err != nil {
		return nil, err
	}
	resolution := strings.ToLower(strings.TrimSpace(util.Clean(body["image_resolution"])))
	if util.IsGrokImageModel(model) {
		if resolution == "" || resolution == "auto" {
			resolution = "1k"
		}
	}
	if preset := service.NormalizeImageResolutionPreset(resolution); preset != "" {
		metadata["image_resolution"] = preset
	}
	if size != "" {
		metadata["requested_size"] = size
	}
	return metadata, nil
}

func validateGrokImageResolution(body map[string]any, model string, editing bool) error {
	if !util.IsGrokImageModel(model) {
		return nil
	}
	resolution := strings.ToLower(strings.TrimSpace(util.Clean(body["image_resolution"])))
	if resolution == "" || resolution == "auto" {
		body["image_resolution"] = "1k"
		return nil
	}
	if resolution != "1k" && resolution != "2k" {
		return fmt.Errorf("grok 图片分辨率仅支持 1K 或 2K")
	}
	if editing && resolution == "2k" {
		return fmt.Errorf("grok web 图片编辑当前仅支持 1K")
	}
	body["image_resolution"] = resolution
	return nil
}

// validateImageGenerationResolution enforces the creation-studio contract at
// the server boundary. GPT image generation has one supported tier (1K),
// while Grok keeps its existing 1K/2K rules. Missing or legacy Auto values are
// normalized to 1K so old saved drafts remain usable; explicit unsupported
// tiers are rejected instead of silently changing the user's request.
func validateImageGenerationResolution(body map[string]any, model string, editing bool) error {
	if util.IsGrokImageModel(model) {
		return validateGrokImageResolution(body, model, editing)
	}
	// The studio's canonical GPT image model is the only path with the 1K-only
	// contract. Keep `auto` and Responses/chat image tools backward compatible;
	// those callers may negotiate a different upstream capability.
	if strings.TrimSpace(model) != util.ImageModelGPT {
		return nil
	}
	resolution := strings.ToLower(strings.TrimSpace(util.Clean(body["image_resolution"])))
	if resolution == "" || resolution == "auto" {
		body["image_resolution"] = "1k"
		return nil
	}
	if resolution != "1k" {
		return fmt.Errorf("GPT 图片分辨率仅支持 1K")
	}
	body["image_resolution"] = "1k"
	return nil
}

func imageOutputOptionsFromBody(body map[string]any) service.ImageOutputOptions {
	format := service.NormalizeImageOutputFormat(util.Clean(body["output_format"]))
	options := service.ImageOutputOptions{Format: format}
	if format != "png" {
		if compression, ok := imageOutputCompressionFromBody(body["output_compression"]); ok {
			options.Compression = &compression
		}
	}
	return options
}

func imageOutputCompressionFromBody(value any) (int, bool) {
	if value == nil || strings.TrimSpace(util.Clean(value)) == "" {
		return 0, false
	}
	compression := util.ToInt(value, -1)
	if compression < 0 {
		return 0, false
	}
	if compression > 100 {
		compression = 100
	}
	return compression, true
}

func writeCreationTaskSubmitError(w http.ResponseWriter, err error) {
	var idempotencyErr service.ImageTaskIdempotencyConflictError
	if errors.As(err, &idempotencyErr) {
		util.WriteCodedError(w, http.StatusConflict, "idempotency_conflict", err.Error())
		return
	}
	var limitErr service.ImageTaskLimitError
	if errors.As(err, &limitErr) {
		code := "user_concurrency_limited"
		if strings.Contains(strings.ToLower(limitErr.Error()), "rpm") {
			code = "user_rpm_limited"
		}
		util.WriteCodedError(w, http.StatusTooManyRequests, code, mapCreationTaskError(err))
		return
	}
	message := mapCreationTaskError(err)
	if strings.Contains(message, "图片任务队列已满") {
		util.WriteCodedError(w, http.StatusTooManyRequests, "image_queue_full", message)
		return
	}
	if strings.Contains(message, "视频任务队列已满") {
		util.WriteCodedError(w, http.StatusTooManyRequests, "video_queue_full", message)
		return
	}
	util.WriteError(w, http.StatusBadRequest, message)
}

func mapCreationTaskError(err error) string {
	if err == nil {
		return "请求失败"
	}
	msg := strings.TrimSpace(err.Error())
	switch msg {
	case "client_task_id is required", "请提供任务 ID":
		return "请提供任务 ID"
	case "creation task not found", "创作任务不存在":
		return "创作任务不存在"
	case "请填写提示词", "请提供 messages":
		return msg
	default:
		// Prefer classified Chinese image errors when present.
		return service.FriendlyImageTaskErrorForHTTP(err)
	}
}

func creationTaskErrorStatus(err error) int {
	var persistenceErr *service.ImageTaskPersistenceError
	if errors.As(err, &persistenceErr) {
		return http.StatusServiceUnavailable
	}
	return http.StatusNotFound
}
