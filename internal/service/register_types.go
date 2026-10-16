package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

// RegisterLog is one in-memory register console line (not persisted).
type RegisterLog struct {
	Time  string `json:"time"`
	Text  string `json:"text"`
	Level string `json:"level"`
}

// RegisterStats is the live job stats block stored in register.json.
type RegisterStats struct {
	JobID            string  `json:"job_id,omitempty"`
	Success          int     `json:"success"`
	Fail             int     `json:"fail"`
	Done             int     `json:"done"`
	Running          int     `json:"running"`
	Threads          int     `json:"threads"`
	ElapsedSeconds   float64 `json:"elapsed_seconds"`
	AvgSeconds       float64 `json:"avg_seconds"`
	SuccessRate      float64 `json:"success_rate"`
	CurrentQuota     int     `json:"current_quota"`
	CurrentAvailable int     `json:"current_available"`
	StartedAt        string  `json:"started_at,omitempty"`
	UpdatedAt        string  `json:"updated_at,omitempty"`
	FinishedAt       string  `json:"finished_at,omitempty"`
}

// RegisterClearanceConfig is the clearance block persisted with register config.
type RegisterClearanceConfig struct {
	Enabled                bool   `json:"enabled"`
	Mode                   string `json:"mode"`
	FlareSolverrURL        string `json:"flaresolverr_url"`
	TimeoutSeconds         int    `json:"timeout_seconds"`
	RefreshIntervalSeconds int    `json:"refresh_interval_seconds"`
	Proxy                  string `json:"proxy"`
	UserAgent              string `json:"user_agent"`
	CFClearance            string `json:"cf_clearance"`
	CFCookies              string `json:"cf_cookies"`
}

// RegisterMailConfig is the mail block; providers stay flexible maps by type.
type RegisterMailConfig struct {
	RequestTimeout int              `json:"request_timeout"`
	WaitTimeout    int              `json:"wait_timeout"`
	WaitInterval   int              `json:"wait_interval"`
	UserAgent      string           `json:"user_agent,omitempty"`
	Providers      []map[string]any `json:"providers"`
}

// RegisterConfig is the persisted register machine configuration (stats included; logs are separate).
type RegisterConfig struct {
	Enabled bool `json:"enabled"`
	// Target is openai | grok (platform segmented UI; Grok full flow needs python backend).
	Target          string                  `json:"target,omitempty"`
	Mail            RegisterMailConfig      `json:"mail"`
	Proxy           string                  `json:"proxy"`
	Clearance       RegisterClearanceConfig `json:"clearance"`
	Total           int                     `json:"total"`
	Threads         int                     `json:"threads"`
	Mode            string                  `json:"mode"`
	TargetQuota     int                     `json:"target_quota"`
	TargetAvailable int                     `json:"target_available"`
	CheckInterval   int                     `json:"check_interval"`
	// Grok holds captcha/turnstile and pool options for target=grok.
	Grok  map[string]any `json:"grok,omitempty"`
	Stats RegisterStats  `json:"stats"`
}

// RegisterClearancePublic is the API-facing clearance block for the register machine.
type RegisterClearancePublic struct {
	Enabled                bool   `json:"enabled"`
	Mode                   string `json:"mode,omitempty"`
	FlareSolverrURL        string `json:"flaresolverr_url,omitempty"`
	TimeoutSeconds         int    `json:"timeout_seconds"`
	RefreshIntervalSeconds int    `json:"refresh_interval_seconds"`
	Proxy                  string `json:"proxy,omitempty"`
	UserAgent              string `json:"user_agent,omitempty"`
	CFClearance            string `json:"cf_clearance,omitempty"`
	CFCookies              string `json:"cf_cookies,omitempty"`
}

// RegisterMailPublic is the API-facing mail block.
// Providers remain map slices because provider schemas vary by type (outlook_token, duckmail, etc.).
type RegisterMailPublic struct {
	RequestTimeout int              `json:"request_timeout"`
	WaitTimeout    int              `json:"wait_timeout"`
	WaitInterval   int              `json:"wait_interval"`
	UserAgent      string           `json:"user_agent,omitempty"`
	Providers      []map[string]any `json:"providers"`
}

// RegisterStatsPublic is the live job stats block.
type RegisterStatsPublic struct {
	JobID            string `json:"job_id,omitempty"`
	Success          int    `json:"success"`
	Fail             int    `json:"fail"`
	Done             int    `json:"done"`
	Running          int    `json:"running"`
	Threads          int    `json:"threads"`
	ElapsedSeconds   any    `json:"elapsed_seconds,omitempty"`
	AvgSeconds       any    `json:"avg_seconds,omitempty"`
	SuccessRate      any    `json:"success_rate,omitempty"`
	CurrentQuota     int    `json:"current_quota"`
	CurrentAvailable int    `json:"current_available"`
	StartedAt        string `json:"started_at,omitempty"`
	UpdatedAt        string `json:"updated_at,omitempty"`
	FinishedAt       string `json:"finished_at,omitempty"`
}

// RegisterLogPublic is a single register console log line.
type RegisterLogPublic struct {
	Time  string `json:"time,omitempty"`
	Text  string `json:"text,omitempty"`
	Level string `json:"level,omitempty"`
}

// RegisterConfigPublic is the API-facing register machine snapshot.
type RegisterConfigPublic struct {
	Enabled         bool                    `json:"enabled"`
	Target          string                  `json:"target,omitempty"`
	Mail            RegisterMailPublic      `json:"mail"`
	Proxy           string                  `json:"proxy"`
	Clearance       RegisterClearancePublic `json:"clearance"`
	Total           int                     `json:"total"`
	Threads         int                     `json:"threads"`
	Mode            string                  `json:"mode"`
	TargetQuota     int                     `json:"target_quota"`
	TargetAvailable int                     `json:"target_available"`
	CheckInterval   int                     `json:"check_interval"`
	Grok            map[string]any          `json:"grok,omitempty"`
	Stats           RegisterStatsPublic     `json:"stats"`
	Logs            []RegisterLogPublic     `json:"logs"`
}

func (l RegisterLog) toMap() map[string]any {
	return map[string]any{"time": l.Time, "text": l.Text, "level": l.Level}
}

func (s RegisterStats) toMap() map[string]any {
	out := map[string]any{
		"success":           s.Success,
		"fail":              s.Fail,
		"done":              s.Done,
		"running":           s.Running,
		"threads":           s.Threads,
		"elapsed_seconds":   s.ElapsedSeconds,
		"avg_seconds":       s.AvgSeconds,
		"success_rate":      s.SuccessRate,
		"current_quota":     s.CurrentQuota,
		"current_available": s.CurrentAvailable,
		"updated_at":        s.UpdatedAt,
	}
	if s.JobID != "" {
		out["job_id"] = s.JobID
	}
	if s.StartedAt != "" {
		out["started_at"] = s.StartedAt
	}
	if s.FinishedAt != "" {
		out["finished_at"] = s.FinishedAt
	}
	return out
}

func (c RegisterClearanceConfig) toMap() map[string]any {
	return map[string]any{
		"enabled":                  c.Enabled,
		"mode":                     c.Mode,
		"flaresolverr_url":         c.FlareSolverrURL,
		"timeout_seconds":          c.TimeoutSeconds,
		"refresh_interval_seconds": c.RefreshIntervalSeconds,
		"proxy":                    c.Proxy,
		"user_agent":               c.UserAgent,
		"cf_clearance":             c.CFClearance,
		"cf_cookies":               c.CFCookies,
	}
}

func (m RegisterMailConfig) toMap() map[string]any {
	providers := make([]map[string]any, 0, len(m.Providers))
	for _, provider := range m.Providers {
		providers = append(providers, util.CopyMap(provider))
	}
	return map[string]any{
		"request_timeout": m.RequestTimeout,
		"wait_timeout":    m.WaitTimeout,
		"wait_interval":   m.WaitInterval,
		"user_agent":      m.UserAgent,
		"providers":       providers,
	}
}

func (c RegisterConfig) toMap() map[string]any {
	out := map[string]any{
		"enabled":          c.Enabled,
		"target":           firstNonEmpty(c.Target, "openai"),
		"mail":             c.Mail.toMap(),
		"proxy":            c.Proxy,
		"clearance":        c.Clearance.toMap(),
		"total":            c.Total,
		"threads":          c.Threads,
		"mode":             c.Mode,
		"target_quota":     c.TargetQuota,
		"target_available": c.TargetAvailable,
		"check_interval":   c.CheckInterval,
		"stats":            c.Stats.toMap(),
	}
	if c.Grok != nil {
		out["grok"] = util.CopyMap(c.Grok)
	} else {
		out["grok"] = map[string]any{}
	}
	return out
}

func registerStatsFromMap(raw map[string]any) RegisterStats {
	if raw == nil {
		raw = map[string]any{}
	}
	return RegisterStats{
		JobID:            util.Clean(raw["job_id"]),
		Success:          util.ToInt(raw["success"], 0),
		Fail:             util.ToInt(raw["fail"], 0),
		Done:             util.ToInt(raw["done"], 0),
		Running:          util.ToInt(raw["running"], 0),
		Threads:          maxInt(1, util.ToInt(raw["threads"], 1)),
		ElapsedSeconds:   toFloat64(raw["elapsed_seconds"]),
		AvgSeconds:       toFloat64(raw["avg_seconds"]),
		SuccessRate:      toFloat64(raw["success_rate"]),
		CurrentQuota:     util.ToInt(raw["current_quota"], 0),
		CurrentAvailable: util.ToInt(raw["current_available"], 0),
		StartedAt:        util.Clean(raw["started_at"]),
		UpdatedAt:        util.Clean(raw["updated_at"]),
		FinishedAt:       util.Clean(raw["finished_at"]),
	}
}

func toFloat64(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	default:
		return float64(util.ToInt(v, 0))
	}
}

// RegisterConfigPublicFromMap converts a snapshotLocked/Get() map into a typed public config.
func RegisterConfigPublicFromMap(item map[string]any) RegisterConfigPublic {
	if item == nil {
		item = registerDefaultConfig().toMap()
	}
	mailRaw := util.StringMap(item["mail"])
	providers := util.AsMapSlice(mailRaw["providers"])
	if providers == nil {
		providers = []map[string]any{}
	}
	// Deep-copy provider maps so callers cannot mutate service state via the public view.
	providersOut := make([]map[string]any, 0, len(providers))
	for _, provider := range providers {
		providersOut = append(providersOut, util.CopyMap(provider))
	}

	clearanceRaw := util.StringMap(item["clearance"])
	statsRaw := util.StringMap(item["stats"])
	logsRaw := util.AsMapSlice(item["logs"])
	logs := make([]RegisterLogPublic, 0, len(logsRaw))
	for _, logItem := range logsRaw {
		logs = append(logs, RegisterLogPublic{
			Time:  util.Clean(logItem["time"]),
			Text:  util.Clean(logItem["text"]),
			Level: util.Clean(logItem["level"]),
		})
	}
	if logs == nil {
		logs = []RegisterLogPublic{}
	}

	target := strings.ToLower(util.Clean(item["target"]))
	if target != "grok" {
		target = "openai"
	}
	grok := util.StringMap(item["grok"])
	if grok == nil {
		grok = map[string]any{}
	} else {
		grok = util.CopyMap(grok)
	}

	return RegisterConfigPublic{
		Enabled: util.ToBool(item["enabled"]),
		Target:  target,
		Mail: RegisterMailPublic{
			RequestTimeout: util.ToInt(mailRaw["request_timeout"], 15),
			WaitTimeout:    util.ToInt(mailRaw["wait_timeout"], 30),
			WaitInterval:   util.ToInt(mailRaw["wait_interval"], 3),
			UserAgent:      util.Clean(mailRaw["user_agent"]),
			Providers:      providersOut,
		},
		Proxy: util.Clean(item["proxy"]),
		Clearance: RegisterClearancePublic{
			Enabled:                util.ToBool(clearanceRaw["enabled"]),
			Mode:                   util.Clean(clearanceRaw["mode"]),
			FlareSolverrURL:        util.Clean(clearanceRaw["flaresolverr_url"]),
			TimeoutSeconds:         util.ToInt(clearanceRaw["timeout_seconds"], 60),
			RefreshIntervalSeconds: util.ToInt(clearanceRaw["refresh_interval_seconds"], 3600),
			Proxy:                  util.Clean(clearanceRaw["proxy"]),
			UserAgent:              util.Clean(clearanceRaw["user_agent"]),
			CFClearance:            util.Clean(clearanceRaw["cf_clearance"]),
			CFCookies:              util.Clean(clearanceRaw["cf_cookies"]),
		},
		Total:           util.ToInt(item["total"], 1),
		Threads:         util.ToInt(item["threads"], 1),
		Mode:            util.Clean(util.ValueOr(item["mode"], "total")),
		TargetQuota:     util.ToInt(item["target_quota"], 1),
		TargetAvailable: util.ToInt(item["target_available"], 1),
		CheckInterval:   util.ToInt(item["check_interval"], 5),
		Grok:            grok,
		Stats: RegisterStatsPublic{
			JobID:            util.Clean(statsRaw["job_id"]),
			Success:          util.ToInt(statsRaw["success"], 0),
			Fail:             util.ToInt(statsRaw["fail"], 0),
			Done:             util.ToInt(statsRaw["done"], 0),
			Running:          util.ToInt(statsRaw["running"], 0),
			Threads:          util.ToInt(statsRaw["threads"], util.ToInt(item["threads"], 1)),
			ElapsedSeconds:   statsRaw["elapsed_seconds"],
			AvgSeconds:       statsRaw["avg_seconds"],
			SuccessRate:      statsRaw["success_rate"],
			CurrentQuota:     util.ToInt(statsRaw["current_quota"], 0),
			CurrentAvailable: util.ToInt(statsRaw["current_available"], 0),
			StartedAt:        util.Clean(statsRaw["started_at"]),
			UpdatedAt:        util.Clean(statsRaw["updated_at"]),
			FinishedAt:       util.Clean(statsRaw["finished_at"]),
		},
		Logs: logs,
	}
}

// GetTyped returns the typed public register snapshot.
func (s *RegisterService) GetTyped() RegisterConfigPublic {
	return RegisterConfigPublicFromMap(s.Get())
}

// UpdateTyped updates config and returns the typed public snapshot.
func (s *RegisterService) UpdateTyped(updates map[string]any) (RegisterConfigPublic, error) {
	value, err := s.Update(updates)
	return RegisterConfigPublicFromMap(value), err
}

// StartTyped starts registration and returns the typed public snapshot.
func (s *RegisterService) StartTyped() (RegisterConfigPublic, error) {
	value, err := s.Start()
	return RegisterConfigPublicFromMap(value), err
}

// StopTyped requests stop and returns the typed public snapshot.
func (s *RegisterService) StopTyped() (RegisterConfigPublic, error) {
	value, err := s.Stop()
	return RegisterConfigPublicFromMap(value), err
}

// ResetTyped resets stats/logs and returns the typed public snapshot.
func (s *RegisterService) ResetTyped() (RegisterConfigPublic, error) {
	value, err := s.Reset()
	return RegisterConfigPublicFromMap(value), err
}

// ResetOutlookPoolTyped resets outlook pool state and returns the typed public snapshot.
func (s *RegisterService) ResetOutlookPoolTyped(scope string) (RegisterConfigPublic, error) {
	value, err := s.ResetOutlookPool(scope)
	return RegisterConfigPublicFromMap(value), err
}
