package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

const (
	BackupStatusIdle    = "idle"
	BackupStatusRunning = "running"
	BackupStatusSuccess = "success"
	BackupStatusFailed  = "failed"
)

// BackupConfig is the persisted backup configuration (includes R2 secret for storage).
type BackupConfig struct {
	Enabled           bool     `json:"enabled"`
	Provider          string   `json:"provider"`
	LocalDir          string   `json:"local_dir"`
	IntervalMinutes   int      `json:"interval_minutes"`
	Include           []string `json:"include"`
	LastMaxFiles      int      `json:"last_max_files"`
	R2AccountID       string   `json:"r2_account_id"`
	R2AccessKeyID     string   `json:"r2_access_key_id"`
	R2SecretAccessKey string   `json:"r2_secret_access_key"`
	R2Bucket          string   `json:"r2_bucket"`
	R2Prefix          string   `json:"r2_prefix"`
}

// BackupState is the persisted last-run backup status.
type BackupState struct {
	TaskID              string `json:"task_id,omitempty"`
	Status              string `json:"status"`
	Phase               string `json:"phase,omitempty"`
	StartedAt           string `json:"started_at,omitempty"`
	FinishedAt          string `json:"finished_at,omitempty"`
	LastRunAt           string `json:"last_run_at"`
	LastSuccessAt       string `json:"last_success_at"`
	LastError           string `json:"last_error"`
	LastFile            string `json:"last_file"`
	LastFileName        string `json:"last_file_name"`
	LastSize            int64  `json:"last_size"`
	LastFileCount       int    `json:"last_file_count"`
	LastDurationMS      int64  `json:"last_duration_ms"`
	Provider            string `json:"provider"`
	RemoteKey           string `json:"remote_key"`
	RemoteURL           string `json:"remote_url"`
	RemovedLocalBackups int    `json:"removed_local_backups,omitempty"`
	UpdatedAt           string `json:"updated_at"`
}

// BackupConfigPublic is the API-facing backup configuration (R2 secret never returned as plaintext).
type BackupConfigPublic struct {
	Enabled            bool     `json:"enabled"`
	Provider           string   `json:"provider,omitempty"`
	LocalDir           string   `json:"local_dir,omitempty"`
	IntervalMinutes    int      `json:"interval_minutes,omitempty"`
	Include            []string `json:"include,omitempty"`
	LastMaxFiles       int      `json:"last_max_files,omitempty"`
	R2AccountID        string   `json:"r2_account_id,omitempty"`
	R2AccessKeyID      string   `json:"r2_access_key_id,omitempty"`
	R2SecretAccessKey  string   `json:"r2_secret_access_key,omitempty"` // write-only; empty on GET
	R2SecretConfigured bool     `json:"r2_secret_access_key_configured"`
	R2Bucket           string   `json:"r2_bucket,omitempty"`
	R2Prefix           string   `json:"r2_prefix,omitempty"`
}

// BackupStatePublic is the last-run backup status for API.
type BackupStatePublic struct {
	TaskID         string `json:"task_id,omitempty"`
	Status         string `json:"status"`
	Phase          string `json:"phase,omitempty"`
	StartedAt      string `json:"started_at,omitempty"`
	FinishedAt     string `json:"finished_at,omitempty"`
	LastRunAt      string `json:"last_run_at,omitempty"`
	LastSuccessAt  string `json:"last_success_at,omitempty"`
	LastError      string `json:"last_error,omitempty"`
	LastFile       string `json:"last_file,omitempty"`
	LastFileName   string `json:"last_file_name,omitempty"`
	LastSize       int64  `json:"last_size"`
	LastFileCount  int    `json:"last_file_count"`
	LastDurationMS int64  `json:"last_duration_ms"`
	Provider       string `json:"provider,omitempty"`
	RemoteKey      string `json:"remote_key,omitempty"`
	RemoteURL      string `json:"remote_url,omitempty"`
	UpdatedAt      string `json:"updated_at,omitempty"`
}

// BackupPayloadPublic is GET/POST /api/admin/backup response.
type BackupPayloadPublic struct {
	Config BackupConfigPublic `json:"config"`
	State  BackupStatePublic  `json:"state"`
}

// BackupRunResultPublic is POST /api/admin/backup/run response.
type BackupRunResultPublic struct {
	State   BackupStatePublic `json:"state"`
	Error   string            `json:"error,omitempty"`
	Started bool              `json:"started"`
}

func backupDefaultConfigStruct() BackupConfig {
	return BackupConfig{
		Enabled:         false,
		Provider:        "local",
		LocalDir:        "data/backups",
		IntervalMinutes: 1440,
		Include:         []string{"config", "data", "images"},
		LastMaxFiles:    20,
		R2Prefix:        "shengtu-backups",
	}
}

func backupDefaultStateStruct() BackupState {
	return BackupState{Status: BackupStatusIdle, Provider: "local"}
}

func normalizeBackupConfigStruct(cfg BackupConfig) BackupConfig {
	def := backupDefaultConfigStruct()
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		provider = def.Provider
	}
	cfg.Provider = provider
	cfg.LocalDir = strings.TrimSpace(cfg.LocalDir)
	if cfg.IntervalMinutes < 1 {
		cfg.IntervalMinutes = def.IntervalMinutes
	}
	if cfg.LastMaxFiles < 1 {
		cfg.LastMaxFiles = def.LastMaxFiles
	}
	if len(cfg.Include) == 0 {
		cfg.Include = append([]string(nil), def.Include...)
	}
	cfg.R2AccountID = strings.TrimSpace(cfg.R2AccountID)
	cfg.R2AccessKeyID = strings.TrimSpace(cfg.R2AccessKeyID)
	cfg.R2SecretAccessKey = strings.TrimSpace(cfg.R2SecretAccessKey)
	cfg.R2Bucket = strings.TrimSpace(cfg.R2Bucket)
	cfg.R2Prefix = strings.TrimSpace(cfg.R2Prefix)
	return cfg
}

func backupConfigFromMap(raw map[string]any) BackupConfig {
	if raw == nil {
		return backupDefaultConfigStruct()
	}
	cfg := backupDefaultConfigStruct()
	cfg.Enabled = util.ToBool(util.ValueOr(raw["enabled"], cfg.Enabled))
	if v := util.Clean(raw["provider"]); v != "" {
		cfg.Provider = v
	}
	if v := util.Clean(raw["local_dir"]); v != "" || raw["local_dir"] != nil {
		cfg.LocalDir = util.Clean(raw["local_dir"])
	}
	cfg.IntervalMinutes = maxInt(1, util.ToInt(raw["interval_minutes"], cfg.IntervalMinutes))
	cfg.LastMaxFiles = maxInt(1, util.ToInt(raw["last_max_files"], cfg.LastMaxFiles))
	if includes := util.AsStringSlice(raw["include"]); len(includes) > 0 {
		cfg.Include = includes
	}
	cfg.R2AccountID = util.Clean(raw["r2_account_id"])
	cfg.R2AccessKeyID = util.Clean(raw["r2_access_key_id"])
	cfg.R2SecretAccessKey = util.Clean(raw["r2_secret_access_key"])
	cfg.R2Bucket = util.Clean(raw["r2_bucket"])
	if v := util.Clean(raw["r2_prefix"]); v != "" || raw["r2_prefix"] != nil {
		cfg.R2Prefix = util.Clean(raw["r2_prefix"])
	}
	return normalizeBackupConfigStruct(cfg)
}

func backupStateFromMap(raw map[string]any) BackupState {
	if raw == nil {
		return backupDefaultStateStruct()
	}
	state := BackupState{
		TaskID:              util.Clean(raw["task_id"]),
		Status:              normalizeBackupStatus(util.Clean(raw["status"])),
		Phase:               util.Clean(raw["phase"]),
		StartedAt:           util.Clean(raw["started_at"]),
		FinishedAt:          util.Clean(raw["finished_at"]),
		LastRunAt:           util.Clean(raw["last_run_at"]),
		LastSuccessAt:       util.Clean(raw["last_success_at"]),
		LastError:           util.Clean(raw["last_error"]),
		LastFile:            util.Clean(raw["last_file"]),
		LastFileName:        util.Clean(raw["last_file_name"]),
		LastSize:            int64(util.ToInt(raw["last_size"], 0)),
		LastFileCount:       util.ToInt(raw["last_file_count"], 0),
		LastDurationMS:      int64(util.ToInt(raw["last_duration_ms"], 0)),
		Provider:            firstNonEmpty(util.Clean(raw["provider"]), "local"),
		RemoteKey:           util.Clean(raw["remote_key"]),
		RemoteURL:           util.Clean(raw["remote_url"]),
		RemovedLocalBackups: util.ToInt(raw["removed_local_backups"], 0),
		UpdatedAt:           util.Clean(raw["updated_at"]),
	}
	if state.Status == BackupStatusIdle {
		if state.LastError != "" {
			state.Status = BackupStatusFailed
		} else if state.LastSuccessAt != "" {
			state.Status = BackupStatusSuccess
		}
	}
	return state
}

func normalizeBackupStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case BackupStatusRunning, BackupStatusSuccess, BackupStatusFailed:
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return BackupStatusIdle
	}
}

func (c BackupConfig) toMap() map[string]any {
	include := append([]string(nil), c.Include...)
	return map[string]any{
		"enabled":              c.Enabled,
		"provider":             c.Provider,
		"local_dir":            c.LocalDir,
		"interval_minutes":     c.IntervalMinutes,
		"include":              include,
		"last_max_files":       c.LastMaxFiles,
		"r2_account_id":        c.R2AccountID,
		"r2_access_key_id":     c.R2AccessKeyID,
		"r2_secret_access_key": c.R2SecretAccessKey,
		"r2_bucket":            c.R2Bucket,
		"r2_prefix":            c.R2Prefix,
	}
}

func (s BackupState) toMap() map[string]any {
	return map[string]any{
		"task_id":               s.TaskID,
		"status":                s.Status,
		"phase":                 s.Phase,
		"started_at":            s.StartedAt,
		"finished_at":           s.FinishedAt,
		"last_run_at":           s.LastRunAt,
		"last_success_at":       s.LastSuccessAt,
		"last_error":            s.LastError,
		"last_file":             s.LastFile,
		"last_file_name":        s.LastFileName,
		"last_size":             s.LastSize,
		"last_file_count":       s.LastFileCount,
		"last_duration_ms":      s.LastDurationMS,
		"provider":              s.Provider,
		"remote_key":            s.RemoteKey,
		"remote_url":            s.RemoteURL,
		"removed_local_backups": s.RemovedLocalBackups,
		"updated_at":            s.UpdatedAt,
	}
}

// BackupConfigPublicFromConfig converts storage config for API (secret stripped).
func BackupConfigPublicFromConfig(cfg BackupConfig) BackupConfigPublic {
	include := append([]string(nil), cfg.Include...)
	if include == nil {
		include = []string{}
	}
	return BackupConfigPublic{
		Enabled:            cfg.Enabled,
		Provider:           cfg.Provider,
		LocalDir:           cfg.LocalDir,
		IntervalMinutes:    cfg.IntervalMinutes,
		Include:            include,
		LastMaxFiles:       cfg.LastMaxFiles,
		R2AccountID:        cfg.R2AccountID,
		R2AccessKeyID:      cfg.R2AccessKeyID,
		R2SecretAccessKey:  "",
		R2SecretConfigured: strings.TrimSpace(cfg.R2SecretAccessKey) != "",
		R2Bucket:           cfg.R2Bucket,
		R2Prefix:           cfg.R2Prefix,
	}
}

// BackupStatePublicFromState converts storage state for API.
func BackupStatePublicFromState(state BackupState) BackupStatePublic {
	return BackupStatePublic{
		TaskID:         state.TaskID,
		Status:         normalizeBackupStatus(state.Status),
		Phase:          state.Phase,
		StartedAt:      state.StartedAt,
		FinishedAt:     state.FinishedAt,
		LastRunAt:      state.LastRunAt,
		LastSuccessAt:  state.LastSuccessAt,
		LastError:      state.LastError,
		LastFile:       state.LastFile,
		LastFileName:   state.LastFileName,
		LastSize:       state.LastSize,
		LastFileCount:  state.LastFileCount,
		LastDurationMS: state.LastDurationMS,
		Provider:       state.Provider,
		RemoteKey:      state.RemoteKey,
		RemoteURL:      state.RemoteURL,
		UpdatedAt:      state.UpdatedAt,
	}
}

// GetTyped returns typed backup config/state (secret stripped).
func (s *BackupService) GetTyped() BackupPayloadPublic {
	s.mu.Lock()
	defer s.mu.Unlock()
	return BackupPayloadPublic{
		Config: BackupConfigPublicFromConfig(s.config),
		State:  BackupStatePublicFromState(s.state),
	}
}

// UpdateTyped updates config and returns typed public payload.
func (s *BackupService) UpdateTyped(updates map[string]any) (BackupPayloadPublic, error) {
	if _, err := s.Update(updates); err != nil {
		return BackupPayloadPublic{}, err
	}
	return s.GetTyped(), nil
}

// RunTyped runs backup synchronously for internal callers/tests.
func (s *BackupService) RunTyped() BackupRunResultPublic {
	state, err := s.Run()
	out := BackupRunResultPublic{State: BackupStatePublicFromState(backupStateFromMap(state)), Started: err == nil}
	if err != nil {
		out.Error = err.Error()
	}
	return out
}

// RunStatusTyped returns current asynchronous backup task state.
func (s *BackupService) RunStatusTyped() BackupRunResultPublic {
	s.mu.Lock()
	defer s.mu.Unlock()
	return BackupRunResultPublic{State: BackupStatePublicFromState(s.state), Started: false}
}
