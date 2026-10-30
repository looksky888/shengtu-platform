package service

import (
	"chatgpt2api/internal/util"
	"log"
	"strings"
)

// ImageTaskPublic is a typed view of public creation-task fields for API boundaries.
// Internal storage is ImageTask; convert public maps with these helpers at list/read edges.
type ImageTaskPublic struct {
	ID                 string `json:"id,omitempty"`
	Status             string `json:"status,omitempty"`
	Mode               string `json:"mode,omitempty"`
	Model              string `json:"model,omitempty"`
	Size               string `json:"size,omitempty"`
	Seconds            int    `json:"seconds,omitempty"`
	ResolutionName     string `json:"resolution_name,omitempty"`
	Preset             string `json:"preset,omitempty"`
	Quality            string `json:"quality,omitempty"`
	OutputFormat       string `json:"output_format,omitempty"`
	OutputCompression  any    `json:"output_compression,omitempty"`
	EffectiveProvider  string `json:"effective_provider,omitempty"`
	EffectiveChannel   string `json:"effective_channel,omitempty"`
	ProviderSource     string `json:"provider_source,omitempty"`
	EffectiveModel     string `json:"effective_model,omitempty"`
	UpstreamHost       string `json:"upstream_host,omitempty"`
	UpstreamHTTPStatus any    `json:"upstream_http_status,omitempty"`
	UpstreamCFRay      string `json:"upstream_cf_ray,omitempty"`
	RetryIndex         any    `json:"retry_index,omitempty"`
	AttemptCount       any    `json:"attempt_count,omitempty"`
	CreatedAt          any    `json:"created_at,omitempty"`
	UpdatedAt          any    `json:"updated_at,omitempty"`
	Data               any    `json:"data,omitempty"`
	Error              string `json:"error,omitempty"`
	ErrorCode          string `json:"error_code,omitempty"`
	UpstreamRequestID  string `json:"upstream_request_id,omitempty"`
	Troubleshooting    string `json:"troubleshooting,omitempty"`
	OwnerID            string `json:"owner_id,omitempty"`
	OwnerName          string `json:"owner_name,omitempty"`
	Count              any    `json:"count,omitempty"`
	OutputType         string `json:"output_type,omitempty"`
	Visibility         string `json:"visibility,omitempty"`
	Progress           any    `json:"progress,omitempty"`
	ProgressStage      string `json:"progress_stage,omitempty"`
	ProgressMessage    string `json:"progress_message,omitempty"`
	AccountLabel       string `json:"account_label,omitempty"`
	AccountTokenHash   string `json:"account_token_hash,omitempty"`
	AccountSwitchCount any    `json:"account_switch_count,omitempty"`
	LogCount           any    `json:"log_count,omitempty"`
	StartedAt          any    `json:"started_at,omitempty"`
	FinishedAt         any    `json:"finished_at,omitempty"`
	DurationSeconds    any    `json:"duration_seconds,omitempty"`
	StageDurationsMS   any    `json:"stage_durations_ms,omitempty"`
	Events             any    `json:"events,omitempty"`
}

// ImageTaskListResponse is the typed list payload for GET /api/creation-tasks.
type ImageTaskListResponse struct {
	Items      []ImageTaskPublic `json:"items"`
	MissingIDs []string          `json:"missing_ids"`
	Limited    bool              `json:"limited,omitempty"`
}

// ImageTaskPublicFromMap converts a publicTask/publicTaskSummary map into a typed struct.
func ImageTaskPublicFromMap(item map[string]any) ImageTaskPublic {
	if item == nil {
		return ImageTaskPublic{}
	}
	return ImageTaskPublic{
		ID:                 util.Clean(item["id"]),
		Status:             util.Clean(item["status"]),
		Mode:               util.Clean(item["mode"]),
		Model:              util.Clean(item["model"]),
		Size:               util.Clean(item["size"]),
		Seconds:            util.ToInt(item["seconds"], 0),
		ResolutionName:     util.Clean(item["resolution_name"]),
		Preset:             util.Clean(item["preset"]),
		Quality:            util.Clean(item["quality"]),
		OutputFormat:       util.Clean(item["output_format"]),
		OutputCompression:  item["output_compression"],
		EffectiveProvider:  util.Clean(item["effective_provider"]),
		EffectiveChannel:   util.Clean(item["effective_channel"]),
		ProviderSource:     util.Clean(item["provider_source"]),
		EffectiveModel:     util.Clean(item["effective_model"]),
		UpstreamHost:       util.Clean(item["upstream_host"]),
		UpstreamHTTPStatus: item["upstream_http_status"],
		UpstreamCFRay:      util.Clean(item["upstream_cf_ray"]),
		RetryIndex:         item["retry_index"],
		AttemptCount:       item["attempt_count"],
		CreatedAt:          item["created_at"],
		UpdatedAt:          item["updated_at"],
		Data:               item["data"],
		Error:              util.Clean(item["error"]),
		ErrorCode:          util.Clean(item["error_code"]),
		UpstreamRequestID:  util.Clean(item["upstream_request_id"]),
		Troubleshooting:    util.Clean(item["troubleshooting"]),
		OwnerID:            util.Clean(item["owner_id"]),
		OwnerName:          util.Clean(item["owner_name"]),
		Count:              item["count"],
		OutputType:         util.Clean(item["output_type"]),
		Visibility:         util.Clean(item["visibility"]),
		Progress:           item["progress"],
		ProgressStage:      util.Clean(item["progress_stage"]),
		ProgressMessage:    util.Clean(item["progress_message"]),
		AccountLabel:       util.Clean(item["account_label"]),
		AccountTokenHash:   util.Clean(item["account_token_hash"]),
		AccountSwitchCount: item["account_switch_count"],
		LogCount:           item["log_count"],
		StartedAt:          item["started_at"],
		FinishedAt:         item["finished_at"],
		DurationSeconds:    item["duration_seconds"],
		StageDurationsMS:   item["stage_durations_ms"],
		Events:             item["events"],
	}
}

// ImageTaskPublicListFromMaps converts a slice of public task maps.
func ImageTaskPublicListFromMaps(items []map[string]any) []ImageTaskPublic {
	out := make([]ImageTaskPublic, 0, len(items))
	for _, item := range items {
		out = append(out, ImageTaskPublicFromMap(item))
	}
	return out
}

// ImageTaskListFromPayload converts ListTasks/ListRecentTasks map payloads to typed response.
func ImageTaskListFromPayload(payload map[string]any) ImageTaskListResponse {
	if payload == nil {
		return ImageTaskListResponse{Items: []ImageTaskPublic{}, MissingIDs: []string{}}
	}
	var items []map[string]any
	switch v := payload["items"].(type) {
	case []map[string]any:
		items = v
	case []any:
		items = make([]map[string]any, 0, len(v))
		for _, raw := range v {
			if m, ok := raw.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	missing := util.AsStringSlice(payload["missing_ids"])
	if missing == nil {
		missing = []string{}
	}
	return ImageTaskListResponse{
		Items:      ImageTaskPublicListFromMaps(items),
		MissingIDs: missing,
		Limited:    util.ToBool(payload["limited"]),
	}
}

// ListTasksTyped returns typed public tasks for the caller (pilot migration off map[string]any).
func (s *ImageTaskService) ListTasksTyped(identity Identity, taskIDs []string) ImageTaskListResponse {
	return ImageTaskListFromPayload(s.ListTasks(identity, taskIDs))
}

// ListRecentTasksTyped returns typed recent/active tasks for the caller.
func (s *ImageTaskService) ListRecentTasksTyped(identity Identity, limit int, status string) ImageTaskListResponse {
	return ImageTaskListFromPayload(s.ListRecentTasks(identity, limit, status))
}

// FindTaskTyped returns one task only when it belongs to the caller. Admins
// may read any owner task; this keeps protocol handlers from reaching into the
// in-memory task map and preserves tenant isolation at the service boundary.
func (s *ImageTaskService) FindTaskTyped(identity Identity, id string) (ImageTaskPublic, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return ImageTaskPublic{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cleanupLocked() {
		if err := s.saveLocked(); err != nil {
			log.Printf("image task protocol lookup cleanup persistence failed: %v", err)
		}
	}
	if identity.Role == AuthRoleAdmin {
		for _, task := range s.tasks {
			if task != nil && task.ID == id {
				return ImageTaskPublicFromMap(publicTask(task)), true
			}
		}
		return ImageTaskPublic{}, false
	}
	task := s.tasks[taskKey(ownerID(identity), id)]
	if task == nil {
		return ImageTaskPublic{}, false
	}
	return ImageTaskPublicFromMap(publicTask(task)), true
}

// ImageTaskLogListResponse is the typed list payload for GET /api/admin/image-task-logs.
type ImageTaskLogListResponse struct {
	Items     []ImageTaskPublic        `json:"items"`
	Total     int                      `json:"total"`
	Executors ImageTaskExecutorsPublic `json:"executors"`
}

type ImageTaskExecutorPublic struct {
	Workers       int `json:"workers"`
	QueueCapacity int `json:"queue_capacity"`
	Queued        int `json:"queued"`
	Running       int `json:"running"`
}

type ImageTaskExecutorsPublic struct {
	Image ImageTaskExecutorPublic `json:"image"`
	Relay ImageTaskExecutorPublic `json:"relay"`
	Video ImageTaskExecutorPublic `json:"video"`
}

type CreationBillingCandidate struct {
	TaskID       string
	OwnerID      string
	ChargeReason string
	RefID        string
	BilledCount  int
	SuccessCount int
}

// FailedBillingCandidates returns terminal failed/cancelled tasks that may
// require a full or partial refund. CreditService remains the source of truth
// and ignores candidates without a matching charge or with an existing refund.
func (s *ImageTaskService) FailedBillingCandidates() []CreationBillingCandidate {
	if s == nil {
		return []CreationBillingCandidate{}
	}
	s.mu.RLock()
	out := make([]CreationBillingCandidate, 0)
	for _, task := range s.tasks {
		if task == nil || task.BillingReconciled || (task.Status != TaskStatusError && task.Status != TaskStatusCancelled) {
			continue
		}
		_, reason, refID := BillingRefForTask(task)
		if reason == "" || refID == "" || task.OwnerID == "" {
			continue
		}
		count := task.Count
		if count < 1 || task.Mode == "video" {
			count = 1
		}
		success := len(task.Data)
		if task.Mode == "video" {
			success = 0
		}
		out = append(out, CreationBillingCandidate{TaskID: task.ID, OwnerID: task.OwnerID, ChargeReason: reason, RefID: refID, BilledCount: count, SuccessCount: success})
	}
	s.mu.RUnlock()
	return out
}

// MarkBillingReconciled records that a terminal failed/cancelled task has completed
// credit reconciliation so future background ticks do not re-query the ledger.
func (s *ImageTaskService) MarkBillingReconciled(ownerID, id string) {
	if s == nil {
		return
	}
	key := taskKey(strings.TrimSpace(ownerID), strings.TrimSpace(id))
	if key == ":" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil || task.BillingReconciled {
		return
	}
	task.BillingReconciled = true
	s.scheduleSaveLocked(key)
}

// ImageTaskLogListFromPayload converts ListTaskLogs map payload to typed response.
func ImageTaskLogListFromPayload(payload map[string]any) ImageTaskLogListResponse {
	if payload == nil {
		return ImageTaskLogListResponse{Items: []ImageTaskPublic{}, Total: 0}
	}
	var items []map[string]any
	switch v := payload["items"].(type) {
	case []map[string]any:
		items = v
	case []any:
		items = make([]map[string]any, 0, len(v))
		for _, raw := range v {
			if m, ok := raw.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	return ImageTaskLogListResponse{
		Items: ImageTaskPublicListFromMaps(items),
		Total: util.ToInt(payload["total"], len(items)),
	}
}

// ListTaskLogsTyped returns typed admin task logs (pilot migration off map[string]any).
func (s *ImageTaskService) ListTaskLogsTyped(filters map[string]string) ImageTaskLogListResponse {
	response := ImageTaskLogListFromPayload(s.ListTaskLogs(filters))
	response.Executors = s.ExecutorSnapshot()
	return response
}

func (s *ImageTaskService) ExecutorSnapshot() ImageTaskExecutorsPublic {
	s.mu.RLock()
	defer s.mu.RUnlock()
	imageWorkers, imageCapacity := s.workerCount, s.queueCapacity
	videoWorkers, videoCapacity := s.videoWorkerCount, s.videoQueueCapacity
	if imageWorkers < 1 {
		imageWorkers = defaultImageTaskWorkers
	}
	if imageCapacity < 1 {
		imageCapacity = defaultImageTaskQueueCap
	}
	if videoWorkers < 1 {
		videoWorkers = defaultVideoTaskWorkers
	}
	if videoCapacity < 1 {
		videoCapacity = defaultVideoTaskQueueCap
	}
	snapshot := ImageTaskExecutorsPublic{
		Image: ImageTaskExecutorPublic{Workers: imageWorkers, QueueCapacity: imageCapacity},
		Relay: ImageTaskExecutorPublic{Workers: imageWorkers, QueueCapacity: imageCapacity},
		Video: ImageTaskExecutorPublic{Workers: videoWorkers, QueueCapacity: videoCapacity},
	}
	for _, task := range s.tasks {
		if task == nil {
			continue
		}
		lane := &snapshot.Image
		if util.Clean(task.Mode) == "video" {
			lane = &snapshot.Video
		} else if imageTaskLaneFromRecord(task) == imageTaskLaneRelay {
			lane = &snapshot.Relay
		}
		switch util.Clean(task.Status) {
		case TaskStatusQueued:
			lane.Queued++
		case TaskStatusRunning:
			lane.Running++
		}
	}
	return snapshot
}
