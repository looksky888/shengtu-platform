package service

const videoAssetsDocumentName = "video_assets.json"

const (
	VideoAssetVisibilityPrivate = "private"
	VideoAssetVisibilityPublic  = "public"
	VideoAssetScopeMine         = "mine"
	VideoAssetScopePublic       = "public"
	VideoAssetScopeAll          = "all"
)

type VideoAsset struct {
	ID             string `json:"id"`
	TaskID         string `json:"task_id"`
	OwnerID        string `json:"owner_id"`
	OwnerName      string `json:"owner_name"`
	Visibility     string `json:"visibility"`
	Prompt         string `json:"prompt,omitempty"`
	Model          string `json:"model"`
	Seconds        int    `json:"seconds"`
	Size           string `json:"size"`
	ResolutionName string `json:"resolution_name"`
	Preset         string `json:"preset,omitempty"`
	ContentType    string `json:"content_type"`
	SizeBytes      int64  `json:"size_bytes"`
	CreatedAt      string `json:"created_at"`
	URL            string `json:"url,omitempty"`
}

type VideoAssetScope struct {
	OwnerID string
	Kind    string
}

type VideoAssetPage struct {
	Items      []VideoAsset
	Total      int
	NextCursor string
	HasMore    bool
}
