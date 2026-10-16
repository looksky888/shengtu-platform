package hostupdate

import "time"

const (
	StatusIdle      = "idle"
	StatusPreflight = "preflight"
	StatusReady     = "ready"
	StatusFailed    = "failed"
)

type Check struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type State struct {
	TaskID     string         `json:"task_id,omitempty"`
	Status     string         `json:"status"`
	Phase      string         `json:"phase,omitempty"`
	StartedAt  string         `json:"started_at,omitempty"`
	FinishedAt string         `json:"finished_at,omitempty"`
	UpdatedAt  string         `json:"updated_at"`
	Error      string         `json:"error,omitempty"`
	Checks     []Check        `json:"checks"`
	Target     *ReleaseTarget `json:"target,omitempty"`
}

type PreflightRequest struct {
	TargetVersion string `json:"target_version,omitempty"`
}

type PreflightResult struct {
	State   State `json:"state"`
	Started bool  `json:"started"`
}

type Options struct {
	StateDir        string
	InstallDir      string
	ComposeFiles    []string
	BackupDir       string
	ReadinessURL    string
	AppControlURL   string
	AppControlToken string
	Repository      string
	GitHubToken     string
	GitHubAPIBase   string
	Platform        string
	ExpectedImage   string
	MinimumFree     uint64
	CommandTimeout  time.Duration
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
