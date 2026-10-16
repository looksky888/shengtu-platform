package storage

// MediaAssetRecord is the durable metadata for one stored media object.
// Path is the stable application-facing identifier; ObjectKey is private and
// must never be exposed as an authorization decision.
type MediaAssetRecord struct {
	ID               string
	Path             string
	OwnerID          string
	OwnerName        string
	MediaType        string
	ObjectKey        string
	ThumbnailKey     string
	ContentType      string
	SizeBytes        int64
	SHA256           string
	Width            int
	Height           int
	Visibility       string
	Status           string
	ResolutionPreset string
	RequestedSize    string
	OutputFormat     string
	CreatedAt        string
	PublishedAt      string
	UpdatedAt        string
	DeletedAt        string
	RetryAt          string
	LastError        string
}

type MediaAssetListQuery struct {
	OwnerID       string
	All           bool
	Public        bool
	StartDate     string
	EndDate       string
	UpdatedAfter  string
	BeforeSortKey string
	BeforePath    string
	Limit         int
}

type MediaAssetListPage struct {
	Items   []MediaAssetRecord
	Total   int
	HasMore bool
}
