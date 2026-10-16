package service

import (
	"chatgpt2api/internal/storage"
	"context"
	"errors"
	"io"
	"mime"
	"os"
	"path/filepath"
	"sync"
)

const (
	ThumbnailSize         = 480
	thumbnailQuality      = 72
	thumbnailCacheVersion = 3
	thumbnailExtension    = ".jpg"

	ImageVisibilityPrivate = "private"
	ImageVisibilityPublic  = "public"
)

type ImageConfig interface {
	ImagesDir() string
	ImageThumbnailsDir() string
	ImageMetadataDir() string
	CleanupOldImages() int
}

type ImageAccessScope struct {
	OwnerID string
	All     bool
	Public  bool
}

type imageMetadata struct {
	OwnerID          string
	OwnerName        string
	Visibility       string
	PublishedAt      string
	ResolutionPreset string
	RequestedSize    string
	OutputFormat     string
}

type GeneratedImageMetadata struct {
	ResolutionPreset string
	RequestedSize    string
	OutputFormat     string
}

type ImageFileAccess struct {
	Rel        string
	Path       string
	Info       os.FileInfo
	Visibility string
	OwnerID    string
	Remote     bool
	Asset      storage.MediaAssetRecord
}

type ImageService struct {
	config        ImageConfig
	store         storage.JSONDocumentBackend
	thumbnailMu   sync.Mutex
	thumbnailJobs map[string]*thumbnailJob
	// galleryIndex caches filesystem listing for paginated /api/images (F-09).
	galleryIndexMu      sync.Mutex
	galleryIndex        *imageGalleryIndex
	galleryPrivateOrder []*imageIndexEntry
	galleryPublicOrder  []*imageIndexEntry
	media               *MediaLibrary
}

func (s *ImageService) BindMediaLibrary(media *MediaLibrary) {
	if s != nil {
		s.media = media
	}
}

func (s *ImageService) Delivery(ctx context.Context, access ImageFileAccess, options MediaDeliveryOptions) (MediaDelivery, error) {
	if s == nil || s.media == nil || !access.Remote {
		return MediaDelivery{}, errors.New("图片不是远程媒体")
	}
	return s.media.Delivery(ctx, access.Asset, options)
}

// OpenImage returns one already-authorized image as a streaming reader.
func (s *ImageService) OpenImage(ctx context.Context, access ImageFileAccess) (io.ReadCloser, string, error) {
	if access.Remote {
		if s == nil || s.media == nil {
			return nil, "", errors.New("远程媒体未初始化")
		}
		return s.media.Open(ctx, access.Asset)
	}
	if access.Path == "" {
		return nil, "", errors.New("图片路径为空")
	}
	file, err := os.Open(access.Path)
	if err != nil {
		return nil, "", err
	}
	return file, mime.TypeByExtension(filepath.Ext(access.Path)), nil
}

type imageFileRef struct {
	rel  string
	path string
	info os.FileInfo
}

type thumbnailJob struct {
	done   chan struct{}
	result map[string]any
}

func NewImageService(config ImageConfig, backend ...storage.Backend) *ImageService {
	return &ImageService{config: config, store: firstJSONDocumentStore(backend)}
}
