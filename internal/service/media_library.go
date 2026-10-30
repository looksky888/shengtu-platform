package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"

	"github.com/google/uuid"
)

const (
	mediaStatusPending = "pending"
	mediaStatusReady   = "ready"
	// mediaStatusDeleting is the tombstone between "the user asked for removal"
	// and "remote objects are gone". Listings, capacity/retention queries and
	// Delivery only accept ready/pending, so a record can never keep handing out
	// presigned URLs for an object that has already been deleted.
	mediaStatusDeleting = "deleting"
)

// MediaLibrary owns persistence order, retry state, object verification, and
// stable application paths. Its callers do not know R2 details.
type MediaLibrary struct {
	config     MediaStorageConfig
	repo       storage.MediaAssetBackend
	objects    mediaObjectStore
	spoolDir   string
	prefix     string
	logger     *Logger
	rootCtx    context.Context
	migrate    mediaMigrationRuntime
	cleanup    mediaLocalCleanupRuntime
	assetLocks mediaAssetLockSet
	capacity   storage.StorageCapacityBackend
	documents  storage.JSONDocumentBackend
	// Keep expensive media work from consuming every image task worker when a
	// burst produces many outputs. These limits are local process safeguards;
	// R2 retries still go through the same upload gate.
	uploadSem    chan struct{}
	transformSem chan struct{}
	uploadQueue  chan storage.MediaAssetRecord
	startOnce    sync.Once
}

const (
	defaultMediaUploadConcurrency    = 4
	defaultMediaTransformConcurrency = 2
	defaultMediaUploadQueueCapacity  = defaultMediaUploadConcurrency * 4
)

func NewMediaLibrary(ctx context.Context, cfg MediaStorageConfig, backend storage.Backend, logger *Logger) (*MediaLibrary, error) {
	if cfg == nil || cfg.MediaStorageProvider() != "r2" {
		return nil, nil
	}
	return NewR2MediaLibrary(ctx, cfg, backend, logger)
}

// NewR2MediaLibrary builds the R2 administration/migration module even while
// local storage is still active. This lets operators migrate first and switch
// providers only after verification.
func NewR2MediaLibrary(ctx context.Context, cfg MediaStorageConfig, backend storage.Backend, logger *Logger) (*MediaLibrary, error) {
	if cfg == nil {
		return nil, errors.New("媒体存储配置为空")
	}
	repo, ok := backend.(storage.MediaAssetBackend)
	if !ok {
		return nil, errors.New("R2 媒体存储需要数据库存储后端")
	}
	objects, err := newR2ObjectStore(ctx, r2ObjectStoreConfig{
		AccountID:       cfg.MediaR2AccountID(),
		AccessKeyID:     cfg.MediaR2AccessKeyID(),
		SecretAccessKey: cfg.MediaR2SecretAccessKey(),
		Bucket:          cfg.MediaR2Bucket(),
	})
	if err != nil {
		return nil, err
	}
	spoolDir, err := filepath.Abs(cfg.MediaSpoolDir())
	if err != nil {
		return nil, fmt.Errorf("解析媒体缓冲目录: %w", err)
	}
	if err := os.MkdirAll(spoolDir, 0o700); err != nil {
		return nil, fmt.Errorf("创建媒体缓冲目录: %w", err)
	}
	if ctx == nil {
		ctx = context.Background()
	}
	library := &MediaLibrary{
		config: cfg, repo: repo, objects: objects, spoolDir: spoolDir,
		prefix: strings.Trim(cfg.MediaR2Prefix(), "/"), logger: logger, rootCtx: ctx,
		uploadSem:    make(chan struct{}, defaultMediaUploadConcurrency),
		transformSem: make(chan struct{}, defaultMediaTransformConcurrency),
		uploadQueue:  make(chan storage.MediaAssetRecord, defaultMediaUploadQueueCapacity),
	}
	library.capacity, _ = backend.(storage.StorageCapacityBackend)
	library.documents, _ = backend.(storage.JSONDocumentBackend)
	return library, nil
}

func (m *MediaLibrary) StoreImage(data []byte, baseURL, ownerID, ownerName, outputFormat string) (string, error) {
	if m == nil {
		return "", errors.New("媒体库未初始化")
	}
	if len(data) == 0 {
		return "", errors.New("图片数据为空")
	}
	reservationID, err := m.reserveStorageCapacity(ownerID, int64(len(data)))
	if err != nil {
		return "", err
	}
	if reservationID != "" {
		defer func() {
			if err := m.capacity.ReleaseStorageCapacity(reservationID); err != nil && m.logger != nil {
				m.logger.Warning("release media capacity reservation failed", "error", err.Error())
			}
		}()
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("验证图片数据: %w", err)
	}
	outputFormat = NormalizeImageOutputFormat(outputFormat)
	ext := mediaImageExtension(outputFormat, format)
	contentType := http.DetectContentType(data)
	id := uuid.NewString()
	year, month, day := util.ChinaDatePath()
	rel := filepath.ToSlash(filepath.Join(year, month, day, id+ext))
	ownerSegment := mediaOwnerSegment(ownerID)
	objectKey := m.objectKey("images", ownerSegment, year, month, id+ext)
	thumbnailKey := m.objectKey("thumbnails", ownerSegment, year, month, id+".jpg")
	sha := sha256.Sum256(data)
	shaText := hex.EncodeToString(sha[:])
	originalSpool := m.spoolPath(id, "original")
	if err := storage.AtomicWriteFile(originalSpool, data, 0o600); err != nil {
		return "", fmt.Errorf("写入媒体缓冲: %w", err)
	}
	thumbnailData, thumbnailErr := m.transformThumbnail(data)
	if thumbnailErr != nil {
		thumbnailKey = ""
	} else if err := storage.AtomicWriteFile(m.spoolPath(id, "thumbnail"), thumbnailData, 0o600); err != nil {
		_ = os.Remove(originalSpool)
		return "", fmt.Errorf("写入缩略图缓冲: %w", err)
	}
	now := util.NowISO()
	asset := storage.MediaAssetRecord{
		ID: id, Path: rel, OwnerID: strings.TrimSpace(ownerID), OwnerName: strings.TrimSpace(ownerName), MediaType: "image",
		ObjectKey: objectKey, ThumbnailKey: thumbnailKey, ContentType: contentType, SizeBytes: int64(len(data)), SHA256: shaText,
		Width: config.Width, Height: config.Height, Visibility: ImageVisibilityPrivate, Status: mediaStatusPending,
		OutputFormat: outputFormat, CreatedAt: now, UpdatedAt: now, RetryAt: now,
	}
	if err := m.repo.SaveMediaAsset(asset); err != nil {
		_ = os.Remove(originalSpool)
		_ = os.Remove(m.spoolPath(id, "thumbnail"))
		return "", err
	}
	m.enqueueUpload(asset)
	if strings.TrimSpace(baseURL) == "" {
		baseURL = m.config.BaseURL()
	}
	return strings.TrimRight(baseURL, "/") + "/images/" + rel, nil
}

// checkStorageCapacity enforces the purchased R2 image capacity before a new
// asset enters the durable pending queue. Free-tier users intentionally have
// no entitlement and continue to use the configured retention policy.
func (m *MediaLibrary) reserveStorageCapacity(ownerID string, incomingBytes int64) (string, error) {
	if m == nil || m.capacity == nil || incomingBytes <= 0 || strings.TrimSpace(ownerID) == "" {
		return "", nil
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	reservationID, limited, allowed, used, total, err := m.capacity.ReserveStorageCapacity(strings.TrimSpace(ownerID), now, incomingBytes, 15*60)
	if err != nil {
		return "", fmt.Errorf("读取云存储容量: %w", err)
	}
	if limited && !allowed {
		return "", fmt.Errorf("云存储容量不足：已使用 %s / %s，请购买或升级云存储套餐", formatMediaBytes(used), formatMediaBytes(total))
	}
	return reservationID, nil
}

func formatMediaBytes(value int64) string {
	if value < 0 {
		value = 0
	}
	const unit = int64(1024)
	if value >= unit*unit*unit {
		return fmt.Sprintf("%.1f GB", float64(value)/float64(unit*unit*unit))
	}
	if value >= unit*unit {
		return fmt.Sprintf("%.1f MB", float64(value)/float64(unit*unit))
	}
	if value >= unit {
		return fmt.Sprintf("%.1f KB", float64(value)/float64(unit))
	}
	return fmt.Sprintf("%d B", value)
}

func (m *MediaLibrary) objectKey(parts ...string) string {
	clean := make([]string, 0, len(parts)+1)
	if m.prefix != "" {
		clean = append(clean, m.prefix)
	}
	clean = append(clean, parts...)
	return strings.Join(clean, "/")
}

func mediaOwnerSegment(ownerID string) string {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return "anonymous"
	}
	sum := sha256.Sum256([]byte(ownerID))
	return hex.EncodeToString(sum[:12])
}

func mediaImageExtension(outputFormat, decodedFormat string) string {
	switch NormalizeImageOutputFormat(outputFormat) {
	case "jpeg":
		return ".jpg"
	case "webp":
		return ".webp"
	case "png":
		return ".png"
	}
	switch strings.ToLower(decodedFormat) {
	case "jpeg":
		return ".jpg"
	case "webp":
		return ".webp"
	default:
		return ".png"
	}
}

func mediaThumbnailBytes(data []byte) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	thumb := resizeToFit(flattenImage(img), ThumbnailSize, ThumbnailSize)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, thumb, &jpeg.Options{Quality: thumbnailQuality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func (m *MediaLibrary) transformThumbnail(data []byte) ([]byte, error) {
	if m == nil || m.transformSem == nil {
		return mediaThumbnailBytes(data)
	}
	select {
	case m.transformSem <- struct{}{}:
		defer func() { <-m.transformSem }()
		return mediaThumbnailBytes(data)
	default:
		// Thumbnail encoding is CPU-bound. Wait briefly for a bounded slot;
		// context cancellation is handled by upload stages, while this local
		// transform remains deterministic and cannot be skipped silently.
		m.transformSem <- struct{}{}
		defer func() { <-m.transformSem }()
		return mediaThumbnailBytes(data)
	}
}

func (m *MediaLibrary) Load(path string) (storage.MediaAssetRecord, bool, error) {
	if m == nil {
		return storage.MediaAssetRecord{}, false, nil
	}
	return m.repo.LoadMediaAsset(filepath.ToSlash(strings.TrimSpace(path)))
}

func (m *MediaLibrary) Delivery(ctx context.Context, asset storage.MediaAssetRecord, options MediaDeliveryOptions) (MediaDelivery, error) {
	if asset.Status == mediaStatusPending {
		variant := "original"
		contentType := asset.ContentType
		if options.Thumbnail && asset.ThumbnailKey != "" {
			variant = "thumbnail"
			contentType = "image/jpeg"
		}
		path := m.spoolPath(asset.ID, variant)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return MediaDelivery{LocalPath: path, ContentType: contentType}, nil
		}
		return MediaDelivery{}, errors.New("媒体正在等待上传")
	}
	if asset.Status != mediaStatusReady {
		return MediaDelivery{}, errors.New("媒体暂不可用")
	}
	key := asset.ObjectKey
	if options.Thumbnail && asset.ThumbnailKey != "" {
		key = asset.ThumbnailKey
	}
	ttl := time.Duration(m.config.MediaR2PresignTTLSeconds()) * time.Second
	var url string
	var err error
	if options.Method == http.MethodHead {
		url, err = m.objects.PresignHead(ctx, key, ttl)
	} else if options.Download {
		url, err = m.objects.PresignDownload(ctx, key, ttl, MediaDownloadDisposition(asset.Path))
	} else {
		url, err = m.objects.PresignGet(ctx, key, ttl)
	}
	if err != nil {
		return MediaDelivery{}, err
	}
	return MediaDelivery{RedirectURL: url, ContentType: asset.ContentType}, nil
}

// Open returns a streaming reader for one media object. Callers can compose
// an archive without buffering a batch of images in memory.
func (m *MediaLibrary) Open(ctx context.Context, asset storage.MediaAssetRecord) (io.ReadCloser, string, error) {
	if m == nil {
		return nil, "", errors.New("媒体库未初始化")
	}
	if asset.Status == mediaStatusPending {
		file, err := os.Open(m.spoolPath(asset.ID, "original"))
		if err != nil {
			return nil, "", errors.New("媒体正在等待上传")
		}
		return file, asset.ContentType, nil
	}
	if asset.Status != mediaStatusReady {
		return nil, "", errors.New("媒体暂不可用")
	}
	reader, err := m.objects.Get(ctx, asset.ObjectKey)
	if err != nil {
		return nil, "", err
	}
	return reader, asset.ContentType, nil
}

func MediaDownloadDisposition(assetPath string) string {
	name := path.Base(filepath.ToSlash(strings.TrimSpace(assetPath)))
	if name == "" || name == "." || name == "/" {
		name = "image"
	}
	return mime.FormatMediaType("attachment", map[string]string{"filename": name})
}

func (m *MediaLibrary) Health(ctx context.Context) MediaStorageHealth {
	if m == nil {
		return MediaStorageHealth{Provider: "local", Status: "ok"}
	}
	if err := m.objects.Health(ctx); err != nil {
		return MediaStorageHealth{Provider: "r2", Status: "error", Error: err.Error()}
	}
	return MediaStorageHealth{Provider: "r2", Status: "ok"}
}

// Metrics reports local durable upload backlog without performing a remote
// object-store request. It is suitable for frequent health probes.
func (m *MediaLibrary) Metrics() MediaStorageMetrics {
	if m == nil {
		return MediaStorageMetrics{Status: "local"}
	}
	health := MediaStorageMetrics{Status: "ok"}
	counter, ok := m.repo.(storage.MediaAssetHealthBackend)
	if !ok {
		health.Status = "unavailable"
		return health
	}
	count, err := counter.CountPendingMediaAssets()
	if err != nil {
		health.Status = "error"
		health.Error = err.Error()
		return health
	}
	health.PendingUploads = count
	return health
}
