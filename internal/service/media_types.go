package service

type MediaStorageConfig interface {
	MediaStorageProvider() string
	MediaR2AccountID() string
	MediaR2AccessKeyID() string
	MediaR2SecretAccessKey() string
	MediaR2Bucket() string
	MediaR2Prefix() string
	MediaR2PresignTTLSeconds() int
	MediaSpoolDir() string
	ImagesDir() string
	ImageThumbnailsDir() string
	ImageMetadataDir() string
	BaseURL() string
}

type MediaDelivery struct {
	RedirectURL string
	LocalPath   string
	ContentType string
}

type MediaDeliveryOptions struct {
	Thumbnail bool
	Method    string
	Download  bool
}

type MediaStorageHealth struct {
	Provider string `json:"provider"`
	Status   string `json:"status"`
	Error    string `json:"error,omitempty"`
}

type MediaStorageMetrics struct {
	PendingUploads int    `json:"pending_uploads"`
	Status         string `json:"status"`
	Error          string `json:"error,omitempty"`
}
