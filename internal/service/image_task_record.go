package service

import (
	"chatgpt2api/internal/util"
	"time"
)

// ImageTask is the persisted creation-task record (memory + image_tasks.json).
type ImageTask struct {
	ID                 string           `json:"id"`
	OwnerID            string           `json:"owner_id"`
	OwnerName          string           `json:"owner_name,omitempty"`
	Status             string           `json:"status"`
	Mode               string           `json:"mode"`
	Model              string           `json:"model,omitempty"`
	Size               string           `json:"size,omitempty"`
	Seconds            int              `json:"seconds,omitempty"`
	ResolutionName     string           `json:"resolution_name,omitempty"`
	Preset             string           `json:"preset,omitempty"`
	RequestFingerprint string           `json:"request_fingerprint,omitempty"`
	Quality            string           `json:"quality,omitempty"`
	OutputFormat       string           `json:"output_format,omitempty"`
	OutputCompression  *int             `json:"output_compression,omitempty"`
	Visibility         string           `json:"visibility,omitempty"`
	EffectiveProvider  string           `json:"effective_provider,omitempty"`
	EffectiveChannel   string           `json:"effective_channel,omitempty"`
	ProviderSource     string           `json:"provider_source,omitempty"`
	EffectiveModel     string           `json:"effective_model,omitempty"`
	ChannelModelID     string           `json:"channel_model_id,omitempty"`
	ChannelID          string           `json:"channel_id,omitempty"`
	ChannelName        string           `json:"channel_name,omitempty"`
	CreditCost         int              `json:"credit_cost,omitempty"`
	UpstreamHost       string           `json:"upstream_host,omitempty"`
	UpstreamHTTPStatus int              `json:"upstream_http_status,omitempty"`
	UpstreamCFRay      string           `json:"upstream_cf_ray,omitempty"`
	RetryIndex         int              `json:"retry_index,omitempty"`
	AttemptCount       int              `json:"attempt_count,omitempty"`
	Count              int              `json:"count"`
	CreatedAt          string           `json:"created_at"`
	UpdatedAt          string           `json:"updated_at"`
	Data               []map[string]any `json:"data,omitempty"`
	Error              string           `json:"error,omitempty"`
	ErrorCode          string           `json:"error_code,omitempty"`
	UpstreamRequestID  string           `json:"upstream_request_id,omitempty"`
	Troubleshooting    string           `json:"troubleshooting,omitempty"`
	OutputType         string           `json:"output_type,omitempty"`
	Progress           int              `json:"progress"`
	ProgressStage      string           `json:"progress_stage,omitempty"`
	ProgressMessage    string           `json:"progress_message,omitempty"`
	AccountLabel       string           `json:"account_label,omitempty"`
	AccountTokenHash   string           `json:"account_token_hash,omitempty"`
	AccountSwitchCount int              `json:"account_switch_count"`
	LogCount           int              `json:"log_count"`
	StartedAt          string           `json:"started_at,omitempty"`
	FinishedAt         string           `json:"finished_at,omitempty"`
	DurationSeconds    float64          `json:"duration_seconds"`
	Events             []map[string]any `json:"events,omitempty"`
	StageDurationsMS   map[string]int64 `json:"stage_durations_ms,omitempty"`
	BillingReconciled  bool             `json:"billing_reconciled,omitempty"`

	// Optional numeric presence (load path only emits when original JSON had the key).
	progressSet           bool      `json:"-"`
	logCountSet           bool      `json:"-"`
	accountSwitchCountSet bool      `json:"-"`
	durationSecondsSet    bool      `json:"-"`
	activeStage           string    `json:"-"`
	activeStageStartedAt  time.Time `json:"-"`
	upstreamHTTPStatusSet bool      `json:"-"`
	retryIndexSet         bool      `json:"-"`
	attemptCountSet       bool      `json:"-"`
}

func imageTaskFromMap(raw map[string]any) *ImageTask {
	if raw == nil {
		return nil
	}
	id := util.Clean(raw["id"])
	owner := util.Clean(raw["owner_id"])
	if id == "" || owner == "" {
		return nil
	}
	status := util.Clean(raw["status"])
	if status != TaskStatusQueued && status != TaskStatusRunning && status != TaskStatusSuccess && status != TaskStatusError && status != TaskStatusCancelled {
		status = TaskStatusError
	}
	mode := "generate"
	switch util.Clean(raw["mode"]) {
	case "edit":
		mode = "edit"
	case "response-image":
		mode = "response-image"
	case "chat":
		mode = "chat"
	case "video":
		mode = "video"
	}
	count := taskCount(mode, raw)
	visibility, _ := NormalizeImageVisibility(util.Clean(raw["visibility"]))
	task := &ImageTask{
		ID:                 id,
		OwnerID:            owner,
		OwnerName:          util.Clean(raw["owner_name"]),
		Status:             status,
		Mode:               mode,
		Model:              firstNonEmpty(util.Clean(raw["model"]), util.ImageModelAuto),
		Size:               util.Clean(raw["size"]),
		Seconds:            util.ToInt(raw["seconds"], 0),
		ResolutionName:     util.Clean(raw["resolution_name"]),
		Preset:             util.Clean(raw["preset"]),
		RequestFingerprint: util.Clean(raw["request_fingerprint"]),
		Quality:            util.Clean(raw["quality"]),
		OutputFormat:       NormalizeImageOutputFormat(util.Clean(raw["output_format"])),
		Visibility:         visibility,
		EffectiveProvider:  util.Clean(raw["effective_provider"]),
		EffectiveChannel:   util.Clean(raw["effective_channel"]),
		ProviderSource:     util.Clean(raw["provider_source"]),
		EffectiveModel:     util.Clean(raw["effective_model"]),
		ChannelModelID:     util.Clean(raw["channel_model_id"]),
		ChannelID:          util.Clean(raw["channel_id"]),
		ChannelName:        util.Clean(raw["channel_name"]),
		CreditCost:         util.ToInt(raw["credit_cost"], 0),
		UpstreamHost:       util.Clean(raw["upstream_host"]),
		UpstreamHTTPStatus: util.ToInt(raw["upstream_http_status"], 0),
		UpstreamCFRay:      util.Clean(raw["upstream_cf_ray"]),
		RetryIndex:         util.ToInt(raw["retry_index"], 0),
		AttemptCount:       util.ToInt(raw["attempt_count"], 0),
		Count:              count,
		CreatedAt:          firstNonEmpty(util.Clean(raw["created_at"]), util.NowLocal()),
		UpdatedAt:          firstNonEmpty(util.Clean(raw["updated_at"]), util.Clean(raw["created_at"]), util.NowLocal()),
		Error:              util.Clean(raw["error"]),
		ErrorCode:          util.Clean(raw["error_code"]),
		UpstreamRequestID:  util.Clean(raw["upstream_request_id"]),
		Troubleshooting:    util.Clean(raw["troubleshooting"]),
		OutputType:         util.Clean(raw["output_type"]),
		ProgressStage:      util.Clean(raw["progress_stage"]),
		ProgressMessage:    util.Clean(raw["progress_message"]),
		AccountLabel:       util.Clean(raw["account_label"]),
		AccountTokenHash:   util.Clean(raw["account_token_hash"]),
		StartedAt:          util.Clean(raw["started_at"]),
		FinishedAt:         util.Clean(raw["finished_at"]),
		BillingReconciled:  util.ToBool(raw["billing_reconciled"]),
	}
	if compression, ok := normalizedImageOutputCompressionValue(raw["output_compression"]); ok {
		task.OutputCompression = &compression
	}
	if mode == "video" {
		task.OutputFormat = ""
		task.OutputCompression = nil
	}
	if data := util.AsMapSlice(raw["data"]); data != nil {
		task.Data = data
	}
	if _, ok := raw["progress"]; ok {
		task.Progress = util.ToInt(raw["progress"], 0)
		task.progressSet = true
	}
	if _, ok := raw["log_count"]; ok {
		task.LogCount = util.ToInt(raw["log_count"], 0)
		task.logCountSet = true
	}
	if _, ok := raw["account_switch_count"]; ok {
		task.AccountSwitchCount = util.ToInt(raw["account_switch_count"], 0)
		task.accountSwitchCountSet = true
	}
	if _, ok := raw["duration_seconds"]; ok {
		task.DurationSeconds = toFloat64(raw["duration_seconds"])
		task.durationSecondsSet = true
	}
	if _, ok := raw["upstream_http_status"]; ok {
		task.upstreamHTTPStatusSet = true
	}
	if _, ok := raw["retry_index"]; ok {
		task.retryIndexSet = true
	}
	if _, ok := raw["attempt_count"]; ok {
		task.attemptCountSet = true
	}
	if events := restoreTaskEvents(raw["events"]); len(events) > 0 {
		task.Events = events
	}
	if durations := restoreStageDurations(raw["stage_durations_ms"]); len(durations) > 0 {
		task.StageDurationsMS = durations
	}
	if task.ProgressStage != "" {
		task.activeStage = task.ProgressStage
		if started, err := parseTaskTimestamp(task.UpdatedAt); err == nil {
			task.activeStageStartedAt = started
		}
	}
	return task
}

func (t *ImageTask) toMap() map[string]any {
	if t == nil {
		return nil
	}
	out := map[string]any{
		"id":         t.ID,
		"owner_id":   t.OwnerID,
		"status":     t.Status,
		"mode":       t.Mode,
		"model":      t.Model,
		"size":       t.Size,
		"count":      t.Count,
		"created_at": t.CreatedAt,
		"updated_at": t.UpdatedAt,
	}
	if t.Seconds > 0 {
		out["seconds"] = t.Seconds
	}
	if t.ResolutionName != "" {
		out["resolution_name"] = t.ResolutionName
	}
	if t.Preset != "" {
		out["preset"] = t.Preset
	}
	if t.RequestFingerprint != "" {
		out["request_fingerprint"] = t.RequestFingerprint
	}
	if t.OwnerName != "" {
		out["owner_name"] = t.OwnerName
	}
	if t.Quality != "" {
		out["quality"] = t.Quality
	}
	if t.OutputFormat != "" {
		out["output_format"] = t.OutputFormat
	}
	if t.OutputCompression != nil {
		out["output_compression"] = *t.OutputCompression
	}
	if t.Visibility != "" {
		out["visibility"] = t.Visibility
	}
	if t.EffectiveProvider != "" {
		out["effective_provider"] = t.EffectiveProvider
	}
	if t.EffectiveChannel != "" {
		out["effective_channel"] = t.EffectiveChannel
	}
	if t.ProviderSource != "" {
		out["provider_source"] = t.ProviderSource
	}
	if t.EffectiveModel != "" {
		out["effective_model"] = t.EffectiveModel
	}
	if t.ChannelModelID != "" {
		out["channel_model_id"] = t.ChannelModelID
	}
	if t.ChannelID != "" {
		out["channel_id"] = t.ChannelID
	}
	if t.ChannelName != "" {
		out["channel_name"] = t.ChannelName
	}
	if t.CreditCost > 0 {
		out["credit_cost"] = t.CreditCost
	}
	if t.UpstreamHost != "" {
		out["upstream_host"] = t.UpstreamHost
	}
	if t.upstreamHTTPStatusSet || t.UpstreamHTTPStatus != 0 {
		out["upstream_http_status"] = t.UpstreamHTTPStatus
	}
	if t.UpstreamCFRay != "" {
		out["upstream_cf_ray"] = t.UpstreamCFRay
	}
	if t.retryIndexSet || t.RetryIndex != 0 {
		out["retry_index"] = t.RetryIndex
	}
	if t.attemptCountSet || t.AttemptCount != 0 {
		out["attempt_count"] = t.AttemptCount
	}
	if t.Data != nil {
		out["data"] = t.Data
	}
	if t.Error != "" {
		out["error"] = t.Error
	}
	if t.ErrorCode != "" {
		out["error_code"] = t.ErrorCode
	}
	if t.UpstreamRequestID != "" {
		out["upstream_request_id"] = t.UpstreamRequestID
	}
	if t.Troubleshooting != "" {
		out["troubleshooting"] = t.Troubleshooting
	}
	if t.OutputType != "" {
		out["output_type"] = t.OutputType
	}
	if t.progressSet || t.Progress != 0 {
		out["progress"] = t.Progress
	}
	if t.ProgressStage != "" {
		out["progress_stage"] = t.ProgressStage
	}
	if t.ProgressMessage != "" {
		out["progress_message"] = t.ProgressMessage
	}
	if t.AccountLabel != "" {
		out["account_label"] = t.AccountLabel
	}
	if t.AccountTokenHash != "" {
		out["account_token_hash"] = t.AccountTokenHash
	}
	if t.accountSwitchCountSet || t.AccountSwitchCount != 0 {
		out["account_switch_count"] = t.AccountSwitchCount
	}
	if t.logCountSet || t.LogCount != 0 {
		out["log_count"] = t.LogCount
	}
	if t.StartedAt != "" {
		out["started_at"] = t.StartedAt
	}
	if t.FinishedAt != "" {
		out["finished_at"] = t.FinishedAt
	}
	if t.durationSecondsSet || t.DurationSeconds != 0 {
		out["duration_seconds"] = t.DurationSeconds
	}
	if len(t.Events) > 0 {
		out["events"] = t.Events
	}
	if len(t.StageDurationsMS) > 0 {
		out["stage_durations_ms"] = t.StageDurationsMS
	}
	if t.BillingReconciled {
		out["billing_reconciled"] = true
	}
	return out
}

func restoreStageDurations(raw any) map[string]int64 {
	values := make(map[string]int64)
	for key, value := range util.StringMap(raw) {
		key = util.Clean(key)
		if key == "" {
			continue
		}
		if duration := util.ToInt(value, 0); duration >= 0 {
			values[key] = int64(duration)
		}
	}
	return values
}

func (t *ImageTask) transitionStage(now time.Time, stage string) {
	if t == nil || stage == "" {
		return
	}
	if t.activeStage != "" && !t.activeStageStartedAt.IsZero() && !now.Before(t.activeStageStartedAt) {
		if t.StageDurationsMS == nil {
			t.StageDurationsMS = make(map[string]int64)
		}
		t.StageDurationsMS[t.activeStage] += now.Sub(t.activeStageStartedAt).Milliseconds()
	}
	t.activeStage = stage
	t.activeStageStartedAt = now
}

func (t *ImageTask) finishStage(now time.Time) {
	if t == nil || t.activeStage == "" || t.activeStageStartedAt.IsZero() || now.Before(t.activeStageStartedAt) {
		return
	}
	if t.StageDurationsMS == nil {
		t.StageDurationsMS = make(map[string]int64)
	}
	t.StageDurationsMS[t.activeStage] += now.Sub(t.activeStageStartedAt).Milliseconds()
	t.activeStageStartedAt = now
}
