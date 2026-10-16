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
	TaskID     string  `json:"task_id,omitempty"`
	Status     string  `json:"status"`
	Phase      string  `json:"phase,omitempty"`
	StartedAt  string  `json:"started_at,omitempty"`
	FinishedAt string  `json:"finished_at,omitempty"`
	UpdatedAt  string  `json:"updated_at"`
	Error      string  `json:"error,omitempty"`
	Checks     []Check `json:"checks"`
}

type PreflightRequest struct {
	TargetVersion string `json:"target_version,omitempty"`
	Image         string `json:"image,omitempty"`
	Digest        string `json:"digest,omitempty"`
}

type PreflightResult struct {
	State   State `json:"state"`
	Started bool  `json:"started"`
}

type Options struct {
	StateDir       string
	InstallDir     string
	ComposeFiles   []string
	BackupDir      string
	HealthURL      string
	MinimumFree    uint64
	CommandTimeout time.Duration
}
