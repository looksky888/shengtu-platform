package service

import (
	"chatgpt2api/internal/util"
	"strings"
)

func imageTaskVisibility(values ...string) (string, error) {
	if len(values) == 0 {
		return ImageVisibilityPrivate, nil
	}
	return NormalizeImageVisibility(values[0])
}

func ownerID(identity Identity) string {
	if owner := util.Clean(identity.OwnerID); owner != "" {
		return owner
	}
	if id := util.Clean(identity.ID); id != "" {
		return id
	}
	return "anonymous"
}

func taskKey(owner, id string) string {
	return owner + ":" + id
}

const MaxImageTaskCount = 15

func normalizedImageTaskCount(n int) int {
	if n < 1 {
		return 1
	}
	if n > MaxImageTaskCount {
		return MaxImageTaskCount
	}
	return n
}

func imageTaskCount(payload map[string]any) int {
	if payload["n"] == nil {
		return normalizedImageTaskCount(util.ToInt(payload["count"], 1))
	}
	return normalizedImageTaskCount(util.ToInt(payload["n"], 1))
}

func taskCount(mode string, payload map[string]any) int {
	if mode == "chat" || mode == "video" {
		return 1
	}
	return imageTaskCount(payload)
}

func mergeImageTaskMetadata(payload map[string]any, metadata map[string]any) {
	if len(metadata) == 0 {
		return
	}
	if preset := NormalizeImageResolutionPreset(util.Clean(metadata["image_resolution"])); preset != "" {
		payload["image_resolution"] = preset
	}
	if requestedSize := strings.TrimSpace(util.Clean(metadata["requested_size"])); requestedSize != "" {
		payload["requested_size"] = requestedSize
	}
	for _, key := range []string{
		"effective_provider", "effective_channel", "provider_source",
		"effective_model", "upstream_host", "channel_model_id", "channel_id", "channel_name",
		"channel_base_url", "channel_api_key",
	} {
		if value := strings.TrimSpace(util.Clean(metadata[key])); value != "" {
			payload[key] = value
		}
	}
	for _, key := range []string{"image_credit_cost", "channel_timeout_seconds", "channel_max_retries", "channel_max_concurrency"} {
		if value := util.ToInt(metadata[key], 0); value > 0 || key == "channel_max_retries" {
			payload[key] = value
		}
	}
	if value, ok := metadata["channel_download_urls"]; ok {
		payload["channel_download_urls"] = util.ToBool(value)
	}
}

func mergeImageOutputOptions(payload map[string]any, options ImageOutputOptions) {
	format := NormalizeImageOutputFormat(options.Format)
	if format == "" {
		return
	}
	payload["output_format"] = format
	if format == "png" || options.Compression == nil {
		delete(payload, "output_compression")
		return
	}
	compression := *options.Compression
	if compression < 0 {
		compression = 0
	} else if compression > 100 {
		compression = 100
	}
	payload["output_compression"] = compression
}

func NormalizeImageOutputFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "png":
		return "png"
	case "jpg", "jpeg":
		return "jpeg"
	case "webp":
		return "webp"
	default:
		return "png"
	}
}

func normalizedImageOutputCompressionValue(value any) (int, bool) {
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

func storedTaskCount(task *ImageTask) int {
	if task == nil {
		return 1
	}
	if task.Mode == "chat" || task.Mode == "video" {
		return 1
	}
	return normalizedImageTaskCount(task.Count)
}

func isImageTaskMode(mode string) bool {
	return mode == "generate" || mode == "edit" || mode == "response-image" || mode == "video"
}

func taskResultData(result map[string]any) []map[string]any {
	if result == nil {
		return []map[string]any{}
	}
	data := util.AsMapSlice(result["data"])
	if data == nil {
		return []map[string]any{}
	}
	return data
}

func isActiveTaskStatus(status string) bool {
	return status == TaskStatusQueued || status == TaskStatusRunning
}
