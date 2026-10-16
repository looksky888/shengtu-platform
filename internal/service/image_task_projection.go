package service

import (
	"sort"
	"time"

	"chatgpt2api/internal/util"
)

func taskSortTime(task map[string]any) time.Time {
	created := parseTaskTime(task["created_at"])
	if !created.IsZero() && created.Unix() > 0 {
		return created
	}
	return parseTaskTime(task["updated_at"])
}

func imageTaskSortTime(task *ImageTask) time.Time {
	if task == nil {
		return time.Unix(0, 0)
	}
	created := parseTaskTime(task.CreatedAt)
	if !created.IsZero() && created.Unix() > 0 {
		return created
	}
	return parseTaskTime(task.UpdatedAt)
}

func sortTasksNewestFirst(items []map[string]any) {
	sort.SliceStable(items, func(i, j int) bool {
		ti, tj := taskSortTime(items[i]), taskSortTime(items[j])
		if !ti.Equal(tj) {
			return ti.After(tj)
		}
		return util.Clean(items[i]["id"]) > util.Clean(items[j]["id"])
	})
}

func sortImageTasksNewestFirst(items []*ImageTask) {
	sort.SliceStable(items, func(i, j int) bool {
		ti, tj := imageTaskSortTime(items[i]), imageTaskSortTime(items[j])
		if !ti.Equal(tj) {
			return ti.After(tj)
		}
		return items[i].ID > items[j].ID
	})
}

func publicTaskSummary(task *ImageTask) map[string]any {
	if task == nil {
		return map[string]any{}
	}
	item := map[string]any{
		"id": task.ID, "status": task.Status, "mode": task.Mode, "model": task.Model,
		"size": task.Size, "created_at": task.CreatedAt, "updated_at": task.UpdatedAt,
	}
	addVideoTaskOptions(item, task)
	if task.Quality != "" {
		item["quality"] = task.Quality
	}
	if task.Mode != "video" && task.OutputFormat != "" {
		item["output_format"] = task.OutputFormat
	}
	if task.OutputCompression != nil {
		item["output_compression"] = *task.OutputCompression
	}
	addTaskResultFields(item, task, false)
	if task.Count != 0 {
		item["count"] = task.Count
	}
	if task.OutputType != "" {
		item["output_type"] = task.OutputType
	}
	if task.Visibility != "" {
		item["visibility"] = task.Visibility
	}
	addTaskObservabilityFields(item, task)
	addTaskProgressFields(item, task)
	return item
}

func publicTask(task *ImageTask) map[string]any {
	if task == nil {
		return map[string]any{}
	}
	item := map[string]any{
		"id": task.ID, "status": task.Status, "mode": task.Mode, "model": task.Model,
		"size": task.Size, "created_at": task.CreatedAt, "updated_at": task.UpdatedAt,
	}
	addVideoTaskOptions(item, task)
	if quality := util.Clean(task.Quality); quality != "" {
		item["quality"] = quality
	}
	if format := NormalizeImageOutputFormat(util.Clean(task.OutputFormat)); task.Mode != "video" && format != "" {
		item["output_format"] = format
	}
	if task.OutputCompression != nil {
		if compression, ok := normalizedImageOutputCompressionValue(*task.OutputCompression); ok {
			item["output_compression"] = compression
		}
	}
	if task.Data != nil {
		item["data"] = task.Data
	}
	addTaskResultFields(item, task, true)
	if task.Count != 0 {
		item["count"] = task.Count
	}
	addTaskProgressFields(item, task)
	if util.Clean(task.OutputType) != "" {
		item["output_type"] = task.OutputType
	}
	if visibility := util.Clean(task.Visibility); visibility != "" {
		item["visibility"] = visibility
	}
	addTaskObservabilityFields(item, task)
	return item
}

func addVideoTaskOptions(item map[string]any, task *ImageTask) {
	if task == nil || task.Mode != "video" {
		return
	}
	if task.Seconds > 0 {
		item["seconds"] = task.Seconds
	}
	if task.ResolutionName != "" {
		item["resolution_name"] = task.ResolutionName
	}
	if task.Preset != "" {
		item["preset"] = task.Preset
	}
}

func addTaskResultFields(item map[string]any, task *ImageTask, cleanError bool) {
	errorText := task.Error
	if cleanError {
		errorText = util.Clean(errorText)
	}
	if errorText != "" {
		item["error"] = task.Error
	}
	if task.ErrorCode != "" {
		item["error_code"] = task.ErrorCode
	}
	if task.UpstreamRequestID != "" {
		item["upstream_request_id"] = task.UpstreamRequestID
	}
	if task.Troubleshooting != "" {
		item["troubleshooting"] = task.Troubleshooting
	}
	if task.OwnerID != "" {
		item["owner_id"] = task.OwnerID
	}
	if task.OwnerName != "" {
		item["owner_name"] = task.OwnerName
	}
}

func addTaskProgressFields(item map[string]any, task *ImageTask) {
	if task.progressSet || task.Progress != 0 {
		item["progress"] = task.Progress
	}
	if task.ProgressStage != "" {
		item["progress_stage"] = task.ProgressStage
	}
	if task.ProgressMessage != "" {
		item["progress_message"] = task.ProgressMessage
	}
	if task.AccountLabel != "" {
		item["account_label"] = task.AccountLabel
	}
	if task.AccountTokenHash != "" {
		item["account_token_hash"] = task.AccountTokenHash
	}
	if task.logCountSet || task.LogCount != 0 {
		item["log_count"] = task.LogCount
	}
	if task.StartedAt != "" {
		item["started_at"] = task.StartedAt
	}
	if task.FinishedAt != "" {
		item["finished_at"] = task.FinishedAt
	}
	if task.durationSecondsSet || task.DurationSeconds != 0 {
		item["duration_seconds"] = task.DurationSeconds
	}
	if task.accountSwitchCountSet || task.AccountSwitchCount != 0 {
		item["account_switch_count"] = task.AccountSwitchCount
	}
	if len(task.Events) > 0 {
		item["events"] = task.Events
	}
	if len(task.StageDurationsMS) > 0 {
		item["stage_durations_ms"] = task.StageDurationsMS
	}
}

func addTaskObservabilityFields(item map[string]any, task *ImageTask) {
	if item == nil || task == nil {
		return
	}
	if task.EffectiveProvider != "" {
		item["effective_provider"] = task.EffectiveProvider
	}
	if task.EffectiveChannel != "" {
		item["effective_channel"] = task.EffectiveChannel
	}
	if task.ProviderSource != "" {
		item["provider_source"] = task.ProviderSource
	}
	if task.EffectiveModel != "" {
		item["effective_model"] = task.EffectiveModel
	}
	if task.UpstreamHost != "" {
		item["upstream_host"] = task.UpstreamHost
	}
	if task.upstreamHTTPStatusSet || task.UpstreamHTTPStatus != 0 {
		item["upstream_http_status"] = task.UpstreamHTTPStatus
	}
	if task.UpstreamCFRay != "" {
		item["upstream_cf_ray"] = task.UpstreamCFRay
	}
	if task.retryIndexSet || task.RetryIndex != 0 {
		item["retry_index"] = task.RetryIndex
	}
	if task.attemptCountSet || task.AttemptCount != 0 {
		item["attempt_count"] = task.AttemptCount
	}
}
