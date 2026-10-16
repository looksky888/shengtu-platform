package service

import (
	"context"

	"chatgpt2api/internal/util"
)

// CPAImportJobError is one failed file entry inside a stored import job.
type CPAImportJobError struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

// CPAImportJob is the persisted import job status on a CPA pool.
type CPAImportJob struct {
	JobID     string              `json:"job_id"`
	Status    string              `json:"status"`
	CreatedAt string              `json:"created_at"`
	UpdatedAt string              `json:"updated_at"`
	Total     int                 `json:"total"`
	Completed int                 `json:"completed"`
	Added     int                 `json:"added"`
	Skipped   int                 `json:"skipped"`
	Refreshed int                 `json:"refreshed"`
	Failed    int                 `json:"failed"`
	Errors    []CPAImportJobError `json:"errors"`
}

// CPAPool is the persisted CPA connection pool (includes secret_key for storage).
type CPAPool struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	BaseURL   string        `json:"base_url"`
	SecretKey string        `json:"secret_key"`
	ImportJob *CPAImportJob `json:"import_job,omitempty"`
}

// CPAImportJobErrorPublic is one failed file entry inside an import job.
type CPAImportJobErrorPublic struct {
	Name  string `json:"name,omitempty"`
	Error string `json:"error,omitempty"`
}

// CPAImportJobPublic is the API-facing import job status.
type CPAImportJobPublic struct {
	JobID     string                    `json:"job_id,omitempty"`
	Status    string                    `json:"status,omitempty"`
	CreatedAt string                    `json:"created_at,omitempty"`
	UpdatedAt string                    `json:"updated_at,omitempty"`
	Total     int                       `json:"total"`
	Completed int                       `json:"completed"`
	Added     int                       `json:"added"`
	Skipped   int                       `json:"skipped"`
	Refreshed int                       `json:"refreshed"`
	Failed    int                       `json:"failed"`
	Errors    []CPAImportJobErrorPublic `json:"errors"`
}

// CPARemoteFilePublic is a remote auth-file listing row.
type CPARemoteFilePublic struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
}

// CPAPoolPublic is a typed view of CPA pool fields for API boundaries (secret_key never included).
type CPAPoolPublic struct {
	ID        string              `json:"id,omitempty"`
	Name      string              `json:"name,omitempty"`
	BaseURL   string              `json:"base_url,omitempty"`
	ImportJob *CPAImportJobPublic `json:"import_job,omitempty"`
}

func (j *CPAImportJob) toMap() map[string]any {
	if j == nil {
		return nil
	}
	errors := make([]any, 0, len(j.Errors))
	for _, e := range j.Errors {
		errors = append(errors, map[string]any{"name": e.Name, "error": e.Error})
	}
	return map[string]any{
		"job_id":     j.JobID,
		"status":     j.Status,
		"created_at": j.CreatedAt,
		"updated_at": j.UpdatedAt,
		"total":      j.Total,
		"completed":  j.Completed,
		"added":      j.Added,
		"skipped":    j.Skipped,
		"refreshed":  j.Refreshed,
		"failed":     j.Failed,
		"errors":     errors,
	}
}

func (p CPAPool) toMap() map[string]any {
	out := map[string]any{
		"id":         p.ID,
		"name":       p.Name,
		"base_url":   p.BaseURL,
		"secret_key": p.SecretKey,
	}
	if p.ImportJob != nil {
		out["import_job"] = p.ImportJob.toMap()
	} else {
		out["import_job"] = nil
	}
	return out
}

func cpaImportJobFromMap(raw any, failUnfinished bool) *CPAImportJob {
	item, ok := raw.(map[string]any)
	if !ok || item == nil {
		return nil
	}
	status := firstNonEmpty(util.Clean(item["status"]), "failed")
	if failUnfinished && (status == "pending" || status == "running") {
		status = "failed"
	}
	errors := make([]CPAImportJobError, 0)
	for _, rawErr := range anyList(item["errors"]) {
		if m, ok := rawErr.(map[string]any); ok {
			errors = append(errors, CPAImportJobError{
				Name:  util.Clean(m["name"]),
				Error: util.Clean(m["error"]),
			})
			continue
		}
		if m, ok := rawErr.(map[string]string); ok {
			errors = append(errors, CPAImportJobError{Name: m["name"], Error: m["error"]})
		}
	}
	return &CPAImportJob{
		JobID:     firstNonEmpty(util.Clean(item["job_id"]), util.NewHex(32)),
		Status:    status,
		CreatedAt: firstNonEmpty(util.Clean(item["created_at"]), util.NowISO()),
		UpdatedAt: firstNonEmpty(util.Clean(item["updated_at"]), util.Clean(item["created_at"]), util.NowISO()),
		Total:     util.ToInt(item["total"], 0),
		Completed: util.ToInt(item["completed"], 0),
		Added:     util.ToInt(item["added"], 0),
		Skipped:   util.ToInt(item["skipped"], 0),
		Refreshed: util.ToInt(item["refreshed"], 0),
		Failed:    util.ToInt(item["failed"], 0),
		Errors:    errors,
	}
}

func cpaPoolFromMap(raw map[string]any) CPAPool {
	if raw == nil {
		raw = map[string]any{}
	}
	return CPAPool{
		ID:        firstNonEmpty(util.Clean(raw["id"]), util.NewHex(12)),
		Name:      util.Clean(raw["name"]),
		BaseURL:   util.Clean(raw["base_url"]),
		SecretKey: util.Clean(raw["secret_key"]),
		ImportJob: cpaImportJobFromMap(raw["import_job"], true),
	}
}

func newImportJobStruct(total int) *CPAImportJob {
	now := util.NowISO()
	return &CPAImportJob{
		JobID:     util.NewHex(32),
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
		Total:     total,
		Errors:    []CPAImportJobError{},
	}
}

// CPAImportJobPublicFromRecord converts a stored import job for API.
func CPAImportJobPublicFromRecord(job *CPAImportJob) *CPAImportJobPublic {
	if job == nil {
		return nil
	}
	errorsOut := make([]CPAImportJobErrorPublic, 0, len(job.Errors))
	for _, e := range job.Errors {
		errorsOut = append(errorsOut, CPAImportJobErrorPublic(e))
	}
	return &CPAImportJobPublic{
		JobID:     job.JobID,
		Status:    job.Status,
		CreatedAt: job.CreatedAt,
		UpdatedAt: job.UpdatedAt,
		Total:     job.Total,
		Completed: job.Completed,
		Added:     job.Added,
		Skipped:   job.Skipped,
		Refreshed: job.Refreshed,
		Failed:    job.Failed,
		Errors:    errorsOut,
	}
}

// CPAImportJobPublicFromMap converts normalizeImportJob-style maps.
func CPAImportJobPublicFromMap(item map[string]any) *CPAImportJobPublic {
	return CPAImportJobPublicFromRecord(cpaImportJobFromMap(item, false))
}

// CPAImportJobPublicFromAny accepts map or nil import_job values.
func CPAImportJobPublicFromAny(raw any) *CPAImportJobPublic {
	if raw == nil {
		return nil
	}
	if m, ok := raw.(map[string]any); ok {
		return CPAImportJobPublicFromMap(m)
	}
	return nil
}

// CPARemoteFilePublicFromMap converts a remote file row.
func CPARemoteFilePublicFromMap(item map[string]any) CPARemoteFilePublic {
	if item == nil {
		return CPARemoteFilePublic{}
	}
	return CPARemoteFilePublic{
		Name:  util.Clean(item["name"]),
		Email: util.Clean(item["email"]),
	}
}

// CPARemoteFilePublicListFromMaps converts remote file maps.
func CPARemoteFilePublicListFromMaps(items []map[string]any) []CPARemoteFilePublic {
	out := make([]CPARemoteFilePublic, 0, len(items))
	for _, item := range items {
		out = append(out, CPARemoteFilePublicFromMap(item))
	}
	return out
}

// CPAPoolPublicFromRecord converts a stored pool for API (secret never included).
func CPAPoolPublicFromRecord(pool CPAPool) CPAPoolPublic {
	return CPAPoolPublic{
		ID:        pool.ID,
		Name:      pool.Name,
		BaseURL:   pool.BaseURL,
		ImportJob: CPAImportJobPublicFromRecord(pool.ImportJob),
	}
}

// CPAPoolPublicFromMap converts a sanitized CPA pool map into a typed struct.
func CPAPoolPublicFromMap(item map[string]any) CPAPoolPublic {
	if item == nil {
		return CPAPoolPublic{}
	}
	// Map path may still carry secret; public view drops it.
	pool := cpaPoolFromMap(item)
	return CPAPoolPublicFromRecord(pool)
}

// CPAPoolPublicListFromMaps converts a slice of sanitized CPA pool maps.
func CPAPoolPublicListFromMaps(items []map[string]any) []CPAPoolPublic {
	out := make([]CPAPoolPublic, 0, len(items))
	for _, item := range items {
		out = append(out, CPAPoolPublicFromMap(item))
	}
	return out
}

// ListPoolsTyped returns typed public CPA pools (secret_key omitted).
func (c *CPAConfig) ListPoolsTyped() []CPAPoolPublic {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]CPAPoolPublic, 0, len(c.pools))
	for _, pool := range c.pools {
		out = append(out, CPAPoolPublicFromRecord(pool))
	}
	return out
}

// ListRemoteFilesTyped returns typed remote auth-file rows for a pool.
func (s *CPAImportService) ListRemoteFilesTyped(ctx context.Context, pool map[string]any) ([]CPARemoteFilePublic, error) {
	items, err := s.ListRemoteFiles(ctx, pool)
	if err != nil {
		return nil, err
	}
	return CPARemoteFilePublicListFromMaps(items), nil
}

// StartImportTyped starts import and returns a typed job.
func (s *CPAImportService) StartImportTyped(pool map[string]any, selected []string) (*CPAImportJobPublic, error) {
	job, err := s.StartImport(pool, selected)
	if err != nil {
		return nil, err
	}
	return CPAImportJobPublicFromMap(job), nil
}
