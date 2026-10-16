package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

// AccountPoolHealthPublic is the ops snapshot for task-queue /admin account-pool health.
type AccountPoolHealthPublic struct {
	Total           int                         `json:"total"`
	Available       int                         `json:"available"`
	FreeSlots       int                         `json:"free_slots"`
	Locked          int                         `json:"locked"`
	Cooling         int                         `json:"cooling"`
	Invalid         int                         `json:"invalid"`
	Disabled        int                         `json:"disabled"`
	RateLimited     int                         `json:"rate_limited"`
	Schedule        string                      `json:"schedule,omitempty"`
	LeaseTTLSec     int                         `json:"lease_ttl_sec,omitempty"`
	OpsDay          string                      `json:"ops_day,omitempty"`
	Ops             map[string]int              `json:"ops,omitempty"`
	Dispose         AccountDisposeMetricsPublic `json:"dispose,omitempty"`
	QuarantineCount int                         `json:"quarantine_count"`
	QuarantineMax   int                         `json:"quarantine_max"`
	UpdatedAt       string                      `json:"updated_at,omitempty"`
}

// AccountDisposeMetricsPublic is today's (China date) account disposal / restore counters
// for ops dashboards. Ratios are 0–1; denominators are the relevant action subsets.
type AccountDisposeMetricsPublic struct {
	Day                   string `json:"day,omitempty"`
	DeletedPermanent      int    `json:"deleted_permanent"`
	MarkedInvalid         int    `json:"marked_invalid"`
	QuarantineWriteFailed int    `json:"quarantine_write_failed"`
	RefreshRecovered      int    `json:"refresh_recovered"`
	QuarantinedTemporary  int    `json:"quarantined_temporary"`
	CooledTemporary       int    `json:"cooled_temporary"`
	SoftFailUnknown       int    `json:"soft_fail_unknown"`
	AutoRestoredTemporary int    `json:"auto_restored_temporary"`
	ManualRestored        int    `json:"manual_restored"`
	TotalActions          int    `json:"total_actions"`
	// DeleteShare = deleted_permanent / total_actions
	DeleteShare float64 `json:"delete_share"`
	// RecoverShare = refresh_recovered / (refresh_recovered + deleted_permanent + marked_invalid)
	RecoverShare float64 `json:"recover_share"`
	// QuarantineFailShare = quarantine_write_failed / (quarantine_write_failed + deleted_permanent)
	QuarantineFailShare float64 `json:"quarantine_fail_share"`
}

// AccountPoolHealthSnapshotPublic is the lightweight /health probe payload.
type AccountPoolHealthSnapshotPublic struct {
	Total                int            `json:"total"`
	Available            int            `json:"available"`
	FreeSlots            int            `json:"free_slots"`
	RateLimited          int            `json:"rate_limited"`
	Invalid              int            `json:"invalid"`
	Disabled             int            `json:"disabled"`
	Paid                 int            `json:"paid"`
	UnknownQuota         int            `json:"unknown_quota"`
	NoQuotaOrUnavailable int            `json:"no_quota_or_unavailable"`
	ByStatus             map[string]int `json:"by_status,omitempty"`
	Codes                map[string]any `json:"codes,omitempty"`
}

// QuarantineItemPublic is a redacted quarantine list row (never includes access_token).
type QuarantineItemPublic struct {
	Email     string `json:"email,omitempty"`
	TokenHash string `json:"token_hash,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Source    string `json:"source,omitempty"`
	Grade     string `json:"grade,omitempty"`
	RemovedAt string `json:"removed_at,omitempty"`
	HasToken  bool   `json:"has_token"`
}

// QuarantineListPublic is the admin quarantine list with grade filter + counts.
type QuarantineListPublic struct {
	Items          []QuarantineItemPublic `json:"items"`
	Total          int                    `json:"total"`
	TemporaryCount int                    `json:"temporary_count"`
	PermanentCount int                    `json:"permanent_count"`
	OtherCount     int                    `json:"other_count"`
	GradeFilter    string                 `json:"grade_filter,omitempty"`
}

// RestoreQuarantineResultPublic is the POST /api/admin/account-quarantine response.
type RestoreQuarantineResultPublic struct {
	Restored  bool           `json:"restored"`
	Error     string         `json:"error,omitempty"`
	Email     string         `json:"email,omitempty"`
	TokenHash string         `json:"token_hash,omitempty"`
	Add       map[string]any `json:"add,omitempty"`
}

// PurgeQuarantineResultPublic is DELETE purge of a cabin row (no re-import to pool).
type PurgeQuarantineResultPublic struct {
	Purged    bool   `json:"purged"`
	Error     string `json:"error,omitempty"`
	Email     string `json:"email,omitempty"`
	TokenHash string `json:"token_hash,omitempty"`
	Grade     string `json:"grade,omitempty"`
}

// PurgeQuarantineAllResultPublic is the bulk permanent-cabin delete response.
type PurgeQuarantineAllResultPublic struct {
	Requested int      `json:"requested"`
	Purged    int      `json:"purged"`
	Failed    int      `json:"failed"`
	Errors    []string `json:"errors,omitempty"`
}

// AccountPoolHealthPublicFromMap converts PoolHealth() map to typed public struct.
func AccountPoolHealthPublicFromMap(item map[string]any) AccountPoolHealthPublic {
	if item == nil {
		return AccountPoolHealthPublic{}
	}
	ops := map[string]int{}
	if raw, ok := item["ops"].(map[string]int); ok {
		ops = raw
	} else if raw, ok := item["ops"].(map[string]any); ok {
		for k, v := range raw {
			ops[k] = util.ToInt(v, 0)
		}
	}
	opsDay := util.Clean(item["ops_day"])
	dispose := disposeMetricsFromMap(item["dispose"])
	if dispose.Day == "" {
		dispose = buildDisposeMetrics(opsDay, ops)
	}
	return AccountPoolHealthPublic{
		Total:           util.ToInt(item["total"], 0),
		Available:       util.ToInt(item["available"], 0),
		FreeSlots:       util.ToInt(item["free_slots"], 0),
		Locked:          util.ToInt(item["locked"], 0),
		Cooling:         util.ToInt(item["cooling"], 0),
		Invalid:         util.ToInt(item["invalid"], 0),
		Disabled:        util.ToInt(item["disabled"], 0),
		RateLimited:     util.ToInt(item["rate_limited"], 0),
		Schedule:        util.Clean(item["schedule"]),
		LeaseTTLSec:     util.ToInt(item["lease_ttl_sec"], 0),
		OpsDay:          opsDay,
		Ops:             ops,
		Dispose:         dispose,
		QuarantineCount: util.ToInt(item["quarantine_count"], 0),
		QuarantineMax:   util.ToInt(item["quarantine_max"], 0),
		UpdatedAt:       util.Clean(item["updated_at"]),
	}
}

func buildDisposeMetrics(day string, ops map[string]int) AccountDisposeMetricsPublic {
	if ops == nil {
		ops = map[string]int{}
	}
	m := AccountDisposeMetricsPublic{
		Day:                   day,
		DeletedPermanent:      ops[string(DisposeDeletedPermanent)],
		MarkedInvalid:         ops[string(DisposeMarkedInvalid)],
		QuarantineWriteFailed: ops[string(DisposeQuarantineWriteFail)],
		RefreshRecovered:      ops[string(DisposeRefreshRecovered)] + ops["refresh_recovered_permanent"],
		QuarantinedTemporary:  ops[string(DisposeQuarantinedTemporary)],
		CooledTemporary:       ops[string(DisposeCooledTemporary)],
		SoftFailUnknown:       ops[string(DisposeSoftFailUnknown)],
		AutoRestoredTemporary: ops[PoolOpAutoRestoredTemporary],
		ManualRestored:        ops[PoolOpManualRestored],
	}
	m.TotalActions = m.DeletedPermanent + m.MarkedInvalid + m.QuarantineWriteFailed +
		m.RefreshRecovered + m.QuarantinedTemporary + m.CooledTemporary + m.SoftFailUnknown +
		m.AutoRestoredTemporary + m.ManualRestored
	if m.TotalActions > 0 {
		m.DeleteShare = float64(m.DeletedPermanent) / float64(m.TotalActions)
	}
	permOutcomes := m.RefreshRecovered + m.DeletedPermanent + m.MarkedInvalid
	if permOutcomes > 0 {
		m.RecoverShare = float64(m.RefreshRecovered) / float64(permOutcomes)
	}
	hardDeleteAttempts := m.QuarantineWriteFailed + m.DeletedPermanent
	if hardDeleteAttempts > 0 {
		m.QuarantineFailShare = float64(m.QuarantineWriteFailed) / float64(hardDeleteAttempts)
	}
	return m
}

func (m AccountDisposeMetricsPublic) toMap() map[string]any {
	return map[string]any{
		"day":                     m.Day,
		"deleted_permanent":       m.DeletedPermanent,
		"marked_invalid":          m.MarkedInvalid,
		"quarantine_write_failed": m.QuarantineWriteFailed,
		"refresh_recovered":       m.RefreshRecovered,
		"quarantined_temporary":   m.QuarantinedTemporary,
		"cooled_temporary":        m.CooledTemporary,
		"soft_fail_unknown":       m.SoftFailUnknown,
		"auto_restored_temporary": m.AutoRestoredTemporary,
		"manual_restored":         m.ManualRestored,
		"total_actions":           m.TotalActions,
		"delete_share":            m.DeleteShare,
		"recover_share":           m.RecoverShare,
		"quarantine_fail_share":   m.QuarantineFailShare,
	}
}

func disposeMetricsFromMap(raw any) AccountDisposeMetricsPublic {
	item, ok := raw.(map[string]any)
	if !ok || item == nil {
		return AccountDisposeMetricsPublic{}
	}
	return AccountDisposeMetricsPublic{
		Day:                   util.Clean(item["day"]),
		DeletedPermanent:      util.ToInt(item["deleted_permanent"], 0),
		MarkedInvalid:         util.ToInt(item["marked_invalid"], 0),
		QuarantineWriteFailed: util.ToInt(item["quarantine_write_failed"], 0),
		RefreshRecovered:      util.ToInt(item["refresh_recovered"], 0),
		QuarantinedTemporary:  util.ToInt(item["quarantined_temporary"], 0),
		CooledTemporary:       util.ToInt(item["cooled_temporary"], 0),
		SoftFailUnknown:       util.ToInt(item["soft_fail_unknown"], 0),
		AutoRestoredTemporary: util.ToInt(item["auto_restored_temporary"], 0),
		ManualRestored:        util.ToInt(item["manual_restored"], 0),
		TotalActions:          util.ToInt(item["total_actions"], 0),
		DeleteShare:           toFloat64(item["delete_share"]),
		RecoverShare:          toFloat64(item["recover_share"]),
		QuarantineFailShare:   toFloat64(item["quarantine_fail_share"]),
	}
}

// AccountPoolHealthSnapshotPublicFromMap converts PoolHealthSnapshot() map.
func AccountPoolHealthSnapshotPublicFromMap(item map[string]any) AccountPoolHealthSnapshotPublic {
	if item == nil {
		return AccountPoolHealthSnapshotPublic{}
	}
	byStatus := map[string]int{}
	if raw, ok := item["by_status"].(map[string]int); ok {
		byStatus = raw
	} else if raw, ok := item["by_status"].(map[string]any); ok {
		for k, v := range raw {
			byStatus[k] = util.ToInt(v, 0)
		}
	}
	codes, _ := item["codes"].(map[string]any)
	return AccountPoolHealthSnapshotPublic{
		Total:                util.ToInt(item["total"], 0),
		Available:            util.ToInt(item["available"], 0),
		FreeSlots:            util.ToInt(item["free_slots"], 0),
		RateLimited:          util.ToInt(item["rate_limited"], 0),
		Invalid:              util.ToInt(item["invalid"], 0),
		Disabled:             util.ToInt(item["disabled"], 0),
		Paid:                 util.ToInt(item["paid"], 0),
		UnknownQuota:         util.ToInt(item["unknown_quota"], 0),
		NoQuotaOrUnavailable: util.ToInt(item["no_quota_or_unavailable"], 0),
		ByStatus:             byStatus,
		Codes:                codes,
	}
}

// QuarantineItemPublicFromMap converts a ListQuarantine row map.
func QuarantineItemPublicFromMap(item map[string]any) QuarantineItemPublic {
	if item == nil {
		return QuarantineItemPublic{}
	}
	return QuarantineItemPublic{
		Email:     util.Clean(item["email"]),
		TokenHash: util.Clean(item["token_hash"]),
		Reason:    util.Clean(item["reason"]),
		Source:    util.Clean(item["source"]),
		Grade:     util.Clean(item["grade"]),
		RemovedAt: util.Clean(item["removed_at"]),
		HasToken:  util.ToBool(item["has_token"]),
	}
}

// QuarantineItemPublicListFromMaps converts quarantine list maps.
func QuarantineItemPublicListFromMaps(items []map[string]any) []QuarantineItemPublic {
	out := make([]QuarantineItemPublic, 0, len(items))
	for _, item := range items {
		out = append(out, QuarantineItemPublicFromMap(item))
	}
	return out
}

// RestoreQuarantineResultPublicFromMap converts RestoreQuarantine() map.
func RestoreQuarantineResultPublicFromMap(item map[string]any) RestoreQuarantineResultPublic {
	if item == nil {
		return RestoreQuarantineResultPublic{Restored: false, Error: "not found"}
	}
	add, _ := item["add"].(map[string]any)
	return RestoreQuarantineResultPublic{
		Restored:  util.ToBool(item["restored"]),
		Error:     util.Clean(item["error"]),
		Email:     util.Clean(item["email"]),
		TokenHash: util.Clean(item["token_hash"]),
		Add:       add,
	}
}

// PoolHealthTyped returns typed pool health for admin task-queue.
func (s *AccountService) PoolHealthTyped() AccountPoolHealthPublic {
	return AccountPoolHealthPublicFromMap(s.PoolHealth())
}

// PoolHealthSnapshotTyped returns typed pool snapshot for /health.
func (s *AccountService) PoolHealthSnapshotTyped() AccountPoolHealthSnapshotPublic {
	return AccountPoolHealthSnapshotPublicFromMap(s.PoolHealthSnapshot())
}

// ListQuarantineTyped returns typed quarantine rows.
func (s *AccountService) ListQuarantineTyped() []QuarantineItemPublic {
	return QuarantineItemPublicListFromMaps(s.ListQuarantine())
}

// ListQuarantineListTyped returns items filtered by grade plus full-cabin counts.
// grade: "", "all", "temporary", "permanent" (case-insensitive). Empty/all = no filter.
func (s *AccountService) ListQuarantineListTyped(grade string) QuarantineListPublic {
	all := s.ListQuarantineTyped()
	temp, perm, other := 0, 0, 0
	for _, item := range all {
		switch item.Grade {
		case string(DisposalTemporary):
			temp++
		case string(DisposalPermanent):
			perm++
		default:
			other++
		}
	}
	filter := strings.ToLower(strings.TrimSpace(grade))
	if filter == "all" {
		filter = ""
	}
	items := all
	if filter != "" {
		items = make([]QuarantineItemPublic, 0, len(all))
		for _, item := range all {
			if item.Grade == filter {
				items = append(items, item)
			}
		}
	}
	if items == nil {
		items = []QuarantineItemPublic{}
	}
	return QuarantineListPublic{
		Items:          items,
		Total:          len(items),
		TemporaryCount: temp,
		PermanentCount: perm,
		OtherCount:     other,
		GradeFilter:    filter,
	}
}

// RestoreQuarantineTyped restores a quarantined account and returns typed result.
func (s *AccountService) RestoreQuarantineTyped(tokenHash string) RestoreQuarantineResultPublic {
	return RestoreQuarantineResultPublicFromMap(s.RestoreQuarantine(tokenHash))
}

// PurgeQuarantineTyped removes a cabin row without re-importing to the pool.
// permanentOnly: when true, only grade=permanent may be purged (admin permanent cabin).
func (s *AccountService) PurgeQuarantineTyped(tokenHash string, permanentOnly bool) PurgeQuarantineResultPublic {
	return PurgeQuarantineResultPublicFromMap(s.PurgeQuarantine(tokenHash, permanentOnly))
}

// PurgePermanentQuarantineAllTyped removes every permanent cabin row in one
// API operation. Failed active-pool removals are restored to the cabin so they
// remain visible and can be retried; temporary/unknown rows are untouched.
func (s *AccountService) PurgePermanentQuarantineAllTyped() PurgeQuarantineAllResultPublic {
	return PurgeQuarantineAllResultPublicFromMap(s.PurgePermanentQuarantineAll())
}

func PurgeQuarantineAllResultPublicFromMap(item map[string]any) PurgeQuarantineAllResultPublic {
	if item == nil {
		return PurgeQuarantineAllResultPublic{}
	}
	result := PurgeQuarantineAllResultPublic{
		Requested: util.ToInt(item["requested"], 0),
		Purged:    util.ToInt(item["purged"], 0),
		Failed:    util.ToInt(item["failed"], 0),
	}
	if raw, ok := item["errors"].([]any); ok {
		for _, value := range raw {
			if message := util.Clean(value); message != "" {
				result.Errors = append(result.Errors, message)
			}
		}
	}
	if raw, ok := item["errors"].([]string); ok {
		result.Errors = append(result.Errors, raw...)
	}
	return result
}

// PurgeQuarantineResultPublicFromMap converts purge map result.
func PurgeQuarantineResultPublicFromMap(item map[string]any) PurgeQuarantineResultPublic {
	if item == nil {
		return PurgeQuarantineResultPublic{Purged: false, Error: "not found"}
	}
	return PurgeQuarantineResultPublic{
		Purged:    util.ToBool(item["purged"]),
		Error:     util.Clean(item["error"]),
		Email:     util.Clean(item["email"]),
		TokenHash: util.Clean(item["token_hash"]),
		Grade:     util.Clean(item["grade"]),
	}
}
