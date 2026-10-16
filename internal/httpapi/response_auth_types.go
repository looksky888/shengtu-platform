package httpapi

import "chatgpt2api/internal/service"

type userResetKeyResponse struct {
	Item   service.ManagedUserPublic `json:"item"`
	APIKey service.AuthKeyPublic     `json:"api_key"`
	Key    string                    `json:"key"`
}

type userUsageResponse struct {
	Ready bool                                `json:"ready"`
	Days  int                                 `json:"days"`
	Items map[string]service.UserUsageSummary `json:"items"`
}

type loginResponse struct {
	OK             bool                     `json:"ok"`
	Version        string                   `json:"version"`
	Token          string                   `json:"token,omitempty"`
	Role           string                   `json:"role"`
	RoleID         string                   `json:"role_id"`
	RoleName       string                   `json:"role_name"`
	SubjectID      string                   `json:"subject_id"`
	Name           string                   `json:"name"`
	Provider       string                   `json:"provider"`
	CredentialID   string                   `json:"credential_id"`
	CredentialName string                   `json:"credential_name"`
	MenuPaths      []string                 `json:"menu_paths"`
	APIPermissions []string                 `json:"api_permissions"`
	Menus          []service.MenuPermission `json:"menus"`
}
