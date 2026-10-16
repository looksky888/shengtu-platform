package service

// Typed mutation payloads for admin user / role / API-key updates.
// Pointer fields mean "field present in request" (partial update).

// ManagedUserUpdate is POST /api/admin/users/{id} body (partial).
type ManagedUserUpdate struct {
	Name    *string `json:"name,omitempty"`
	Enabled *bool   `json:"enabled,omitempty"`
	RoleID  *string `json:"role_id,omitempty"`
}

// HasFields reports whether any updatable field is set.
func (u ManagedUserUpdate) HasFields() bool {
	return u.Name != nil || u.Enabled != nil || u.RoleID != nil
}

// ManagedRoleCreate is POST /api/admin/roles body.
type ManagedRoleCreate struct {
	Name           string   `json:"name"`
	Description    string   `json:"description,omitempty"`
	MenuPaths      []string `json:"menu_paths,omitempty"`
	APIPermissions []string `json:"api_permissions,omitempty"`
}

// ManagedRoleUpdate is POST /api/admin/roles/{id} body (partial).
type ManagedRoleUpdate struct {
	Name           *string   `json:"name,omitempty"`
	Description    *string   `json:"description,omitempty"`
	MenuPaths      *[]string `json:"menu_paths,omitempty"`
	APIPermissions *[]string `json:"api_permissions,omitempty"`
}

// HasFields reports whether any updatable field is set.
func (u ManagedRoleUpdate) HasFields() bool {
	return u.Name != nil || u.Description != nil || u.MenuPaths != nil || u.APIPermissions != nil
}

// AuthKeyUpdate is POST key update body (admin user keys / profile API key).
type AuthKeyUpdate struct {
	Name    *string `json:"name,omitempty"`
	Enabled *bool   `json:"enabled,omitempty"`
}

// HasFields reports whether any updatable field is set.
func (u AuthKeyUpdate) HasFields() bool {
	return u.Name != nil || u.Enabled != nil
}

// CreatePasswordUserInput is admin create-user fields (not necessarily JSON-tagged for HTTP).
type CreatePasswordUserInput struct {
	Username string
	Password string
	Name     string
	RoleID   string
	Enabled  bool
}

// CPAPoolCreate is POST /api/cpa/pools body.
type CPAPoolCreate struct {
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	SecretKey string `json:"secret_key"`
}

// CPAPoolUpdate is POST /api/cpa/pools/{id} body (partial).
type CPAPoolUpdate struct {
	Name      *string `json:"name,omitempty"`
	BaseURL   *string `json:"base_url,omitempty"`
	SecretKey *string `json:"secret_key,omitempty"`
}

// HasFields reports whether any updatable pool field is set.
func (u CPAPoolUpdate) HasFields() bool {
	return u.Name != nil || u.BaseURL != nil || u.SecretKey != nil
}

// CreditCardsGenerateInput is POST /api/admin/credits/cards/generate body.
type CreditCardsGenerateInput struct {
	Count  int `json:"count"`
	Amount int `json:"amount"`
}

// CreditAdjustInput is POST /api/admin/credits/users/{id}/adjust body.
type CreditAdjustInput struct {
	Delta  int    `json:"delta"`
	Reason string `json:"reason"`
	RefID  string `json:"ref_id,omitempty"`
}

// LogCleanupInput is POST /api/logs/governance body.
type LogCleanupInput struct {
	RetentionDays int `json:"retention_days"`
}

// Ptr helpers for tests and call sites that need partial updates.
func StringPtr(v string) *string { return &v }
func BoolPtr(v bool) *bool       { return &v }
