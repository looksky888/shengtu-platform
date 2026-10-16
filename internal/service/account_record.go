package service

import (
	"chatgpt2api/internal/util"
)

// Account is the persisted pool account record (memory + storage.LoadAccounts).
type Account struct {
	AccessToken       string         `json:"access_token"`
	Type              string         `json:"type"`
	Status            string         `json:"status"`
	Quota             int            `json:"quota"`
	ImageQuotaUnknown bool           `json:"image_quota_unknown"`
	Email             string         `json:"email,omitempty"`
	UserID            string         `json:"user_id,omitempty"`
	LimitsProgress    []any          `json:"limits_progress,omitempty"`
	DefaultModelSlug  string         `json:"default_model_slug,omitempty"`
	RestoreAt         string         `json:"restore_at,omitempty"`
	Success           int            `json:"success"`
	Fail              int            `json:"fail"`
	LastUsedAt        string         `json:"last_used_at,omitempty"`
	FP                map[string]any `json:"fp,omitempty"`
	Impersonate       string         `json:"impersonate,omitempty"`
}

func accountFromMap(item map[string]any) (Account, bool) {
	if item == nil {
		return Account{}, false
	}
	accessToken := util.Clean(item["access_token"])
	if accessToken == "" {
		return Account{}, false
	}
	quota := util.ToInt(item["quota"], 0)
	if quota < 0 {
		quota = 0
	}
	acc := Account{
		AccessToken:       accessToken,
		Type:              firstNonEmpty(util.Clean(item["type"]), "Free"),
		Status:            firstNonEmpty(util.Clean(item["status"]), "正常"),
		Quota:             quota,
		ImageQuotaUnknown: util.ToBool(item["image_quota_unknown"]),
		Email:             util.Clean(item["email"]),
		UserID:            util.Clean(item["user_id"]),
		LimitsProgress:    anyList(item["limits_progress"]),
		DefaultModelSlug:  util.Clean(item["default_model_slug"]),
		RestoreAt:         util.Clean(item["restore_at"]),
		Success:           util.ToInt(item["success"], 0),
		Fail:              util.ToInt(item["fail"], 0),
		LastUsedAt:        util.Clean(item["last_used_at"]),
		Impersonate:       util.Clean(item["impersonate"]),
	}
	if raw, ok := item["fp"].(map[string]any); ok && len(raw) > 0 {
		acc.FP = util.CopyMap(raw)
	}
	return acc, true
}

func (a Account) toMap() map[string]any {
	out := map[string]any{
		"access_token":        a.AccessToken,
		"type":                a.Type,
		"status":              a.Status,
		"quota":               a.Quota,
		"image_quota_unknown": a.ImageQuotaUnknown,
		"success":             a.Success,
		"fail":                a.Fail,
		"limits_progress":     a.LimitsProgress,
	}
	if out["limits_progress"] == nil {
		out["limits_progress"] = []any{}
	}
	// Match legacy normalizeAccount: empty optional strings stored as nil.
	if a.Email != "" {
		out["email"] = a.Email
	} else {
		out["email"] = nil
	}
	if a.UserID != "" {
		out["user_id"] = a.UserID
	} else {
		out["user_id"] = nil
	}
	if a.DefaultModelSlug != "" {
		out["default_model_slug"] = a.DefaultModelSlug
	} else {
		out["default_model_slug"] = nil
	}
	if a.RestoreAt != "" {
		out["restore_at"] = a.RestoreAt
	} else {
		out["restore_at"] = nil
	}
	if a.LastUsedAt != "" {
		out["last_used_at"] = a.LastUsedAt
	}
	if len(a.FP) > 0 {
		out["fp"] = util.CopyMap(a.FP)
	}
	if a.Impersonate != "" {
		out["impersonate"] = a.Impersonate
	}
	return out
}

func (a Account) isImageAvailable() bool {
	if a.Status == "禁用" || a.Status == "限流" || a.Status == "异常" {
		return false
	}
	if a.ImageQuotaUnknown {
		return true
	}
	return a.Quota > 0
}

func (a Account) isPaidImage() bool {
	switch a.Type {
	case "Plus", "ProLite", "Pro", "Team":
		return true
	default:
		return false
	}
}

func accountsFromMaps(items []map[string]any) []Account {
	out := make([]Account, 0, len(items))
	for _, item := range items {
		if acc, ok := accountFromMap(item); ok {
			out = append(out, acc)
		}
	}
	return out
}

func accountsToMaps(items []Account) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, item.toMap())
	}
	return out
}
