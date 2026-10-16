package service

import "chatgpt2api/internal/util"

// AccountLimitProgress is one row from ChatGPT conversation/init limits_progress.
type AccountLimitProgress struct {
	FeatureName string `json:"feature_name,omitempty"`
	Remaining   int    `json:"remaining"`
	ResetAfter  string `json:"reset_after,omitempty"`
}

// AccountPublic is a typed view of public account fields for API responses.
// JSON tags match the existing publicAccounts wire format (mixed snake/camel).
type AccountPublic struct {
	ID                string                 `json:"id,omitempty"`
	Email             string                 `json:"email,omitempty"`
	UserID            string                 `json:"user_id,omitempty"`
	Type              string                 `json:"type,omitempty"`
	Status            string                 `json:"status,omitempty"`
	Quota             int                    `json:"quota"`
	ImageQuotaUnknown bool                   `json:"imageQuotaUnknown"`
	TokenPreview      string                 `json:"token_preview,omitempty"`
	AccessToken       string                 `json:"access_token,omitempty"`
	Success           int                    `json:"success"`
	Fail              int                    `json:"fail"`
	DefaultModelSlug  string                 `json:"default_model_slug,omitempty"`
	RestoreAt         string                 `json:"restoreAt,omitempty"`
	LastUsedAt        string                 `json:"lastUsedAt,omitempty"`
	LimitsProgress    []AccountLimitProgress `json:"limits_progress,omitempty"`
}

// AccountPublicFromRecord converts a stored Account for API responses.
func AccountPublicFromRecord(account Account) AccountPublic {
	token := util.Clean(account.AccessToken)
	if token == "" {
		return AccountPublic{}
	}
	return AccountPublic{
		ID:                accountIDFromToken(token),
		Email:             account.Email,
		UserID:            account.UserID,
		Type:              firstNonEmpty(account.Type, "Free"),
		Status:            firstNonEmpty(account.Status, "正常"),
		Quota:             account.Quota,
		ImageQuotaUnknown: account.ImageQuotaUnknown,
		TokenPreview:      util.AnonymizeToken(token),
		AccessToken:       token,
		Success:           account.Success,
		Fail:              account.Fail,
		DefaultModelSlug:  account.DefaultModelSlug,
		RestoreAt:         account.RestoreAt,
		LastUsedAt:        account.LastUsedAt,
		LimitsProgress:    accountLimitsPublic(account.LimitsProgress),
	}
}

// AccountPublicFromMap converts a publicAccounts-style or storage-style map into a typed struct.
func AccountPublicFromMap(item map[string]any) AccountPublic {
	if item == nil {
		return AccountPublic{}
	}
	// Prefer storage-shaped maps (access_token) when present.
	if acc, ok := accountFromMap(item); ok {
		out := AccountPublicFromRecord(acc)
		if id := util.Clean(item["id"]); id != "" {
			out.ID = id
		}
		if preview := util.Clean(item["token_preview"]); preview != "" {
			out.TokenPreview = preview
		}
		if _, ok := item["imageQuotaUnknown"]; ok {
			out.ImageQuotaUnknown = util.ToBool(item["imageQuotaUnknown"])
		}
		if v := stringFromAny(item["restoreAt"]); v != "" {
			out.RestoreAt = v
		}
		if v := stringFromAny(item["lastUsedAt"]); v != "" {
			out.LastUsedAt = v
		}
		if raw, ok := item["limits_progress"]; ok {
			out.LimitsProgress = accountLimitsPublic(anyList(raw))
		}
		return out
	}
	// Support both snake_case storage keys and camelCase public map keys.
	quotaUnknown := util.ToBool(item["image_quota_unknown"])
	if _, ok := item["imageQuotaUnknown"]; ok {
		quotaUnknown = util.ToBool(item["imageQuotaUnknown"])
	}
	limits := accountLimitsPublic(anyList(item["limits_progress"]))
	return AccountPublic{
		ID:                util.Clean(item["id"]),
		Email:             util.Clean(item["email"]),
		UserID:            util.Clean(item["user_id"]),
		Type:              util.Clean(util.ValueOr(item["type"], "Free")),
		Status:            util.Clean(util.ValueOr(item["status"], "正常")),
		Quota:             util.ToInt(util.ValueOr(item["quota"], 0), 0),
		ImageQuotaUnknown: quotaUnknown,
		TokenPreview:      util.Clean(item["token_preview"]),
		AccessToken:       util.Clean(item["access_token"]),
		Success:           util.ToInt(item["success"], 0),
		Fail:              util.ToInt(item["fail"], 0),
		DefaultModelSlug:  util.Clean(item["default_model_slug"]),
		RestoreAt:         firstNonEmpty(stringFromAny(item["restoreAt"]), util.Clean(item["restore_at"])),
		LastUsedAt:        firstNonEmpty(stringFromAny(item["lastUsedAt"]), util.Clean(item["last_used_at"])),
		LimitsProgress:    limits,
	}
}

// AccountPublicListFromMaps converts a slice of public account maps.
func AccountPublicListFromMaps(items []map[string]any) []AccountPublic {
	out := make([]AccountPublic, 0, len(items))
	for _, item := range items {
		out = append(out, AccountPublicFromMap(item))
	}
	return out
}

// ListAccountsTyped returns typed public accounts from internal records (no map round-trip).
func (s *AccountService) ListAccountsTyped() []AccountPublic {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]AccountPublic, 0, len(s.items))
	for _, item := range s.items {
		if pub := AccountPublicFromRecord(item); pub.AccessToken != "" || pub.ID != "" {
			out = append(out, pub)
		}
	}
	return out
}

func stringFromAny(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return util.Clean(t)
	default:
		return util.Clean(t)
	}
}

func accountLimitsPublic(raw []any) []AccountLimitProgress {
	if len(raw) == 0 {
		return []AccountLimitProgress{}
	}
	out := make([]AccountLimitProgress, 0, len(raw))
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, AccountLimitProgress{
			FeatureName: util.Clean(m["feature_name"]),
			Remaining:   util.ToInt(m["remaining"], 0),
			ResetAfter:  util.Clean(m["reset_after"]),
		})
	}
	return out
}
