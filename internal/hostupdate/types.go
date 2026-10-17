package hostupdate

import "time"

const (
	StatusIdle       = "idle"
	StatusPreflight  = "preflight"
	StatusReady      = "ready"
	StatusUpdating   = "updating"
	StatusSucceeded  = "succeeded"
	StatusRollback   = "rolling_back"
	StatusRolledBack = "rolled_back"
	StatusFailed     = "failed"
)

type Check struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type State struct {
	TaskID      string               `json:"task_id,omitempty"`
	Status      string               `json:"status"`
	Phase       string               `json:"phase,omitempty"`
	StartedAt   string               `json:"started_at,omitempty"`
	FinishedAt  string               `json:"finished_at,omitempty"`
	UpdatedAt   string               `json:"updated_at"`
	Error       string               `json:"error,omitempty"`
	Checks      []Check              `json:"checks"`
	Target      *ReleaseTarget       `json:"target,omitempty"`
	Source      *ApplicationIdentity `json:"source,omitempty"`
	Transaction *UpdateTransaction   `json:"transaction,omitempty"`
}

type PreflightRequest struct {
	TargetVersion string `json:"target_version,omitempty"`
}

type PreflightResult struct {
	State   State `json:"state"`
	Started bool  `json:"started"`
}

type UpdateRequest struct {
	TaskID string `json:"task_id"`
}

type UpdateResult struct {
	State   State `json:"state"`
	Started bool  `json:"started"`
}

type Options struct {
	StateDir             string
	InstallDir           string
	ComposeFiles         []string
	BackupDir            string
	ReadinessURL         string
	AppControlURL        string
	AppControlToken      string
	DataDir              string
	ComposeProject       string
	AppService           string
	ManagedOverride      string
	Repository           string
	GitHubToken          string
	GitHubAPIBase        string
	Platform             string
	ExpectedImage        string
	MinimumFree          uint64
	CommandTimeout       time.Duration
	DrainTimeout         time.Duration
	UpdateTimeout        time.Duration
	ReadinessInterval    time.Duration
	ReadinessStableCount int
}

type ApplicationIdentity struct {
	Version       string `json:"version"`
	SchemaVersion int    `json:"schema_version"`
}

type BackupArtifact struct {
	Path      string `json:"path"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"created_at"`
}

type UpdateTransaction struct {
	Backup                  *BackupArtifact `json:"backup,omitempty"`
	PreviousOverridePath    string          `json:"previous_override_path,omitempty"`
	PreviousOverrideExisted bool            `json:"previous_override_existed"`
	OverridePrepared        bool            `json:"override_prepared"`
	StopInitiated           bool            `json:"stop_initiated"`
	AppStopped              bool            `json:"app_stopped"`
	OverrideSwitched        bool            `json:"override_switched"`
}

type AppDrainTasks struct {
	Accepting bool   `json:"accepting"`
	Draining  bool   `json:"draining"`
	Drained   bool   `json:"drained"`
	Queued    int    `json:"queued"`
	Running   int    `json:"running"`
	Active    int    `json:"active"`
	Reason    string `json:"reason,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
}

type AppDrainRequests struct {
	Accepting bool   `json:"accepting"`
	Draining  bool   `json:"draining"`
	Drained   bool   `json:"drained"`
	Active    int    `json:"active"`
	Reason    string `json:"reason,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
}

type AppDrainState struct {
	Message  string           `json:"message"`
	Drained  bool             `json:"drained"`
	Tasks    AppDrainTasks    `json:"tasks"`
	Requests AppDrainRequests `json:"requests"`
}

type ReleaseTarget struct {
	Version                string `json:"version"`
	Channel                string `json:"channel"`
	Commit                 string `json:"commit"`
	Platform               string `json:"platform"`
	Image                  string `json:"image"`
	Digest                 string `json:"digest"`
	StorageSchemaVersion   int    `json:"storage_schema_version"`
	MinSourceSchemaVersion int    `json:"min_source_schema_version"`
}

