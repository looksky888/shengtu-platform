package service

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/util"
)

func (s *ImageService) imageOwner(rel string) string {
	return s.imageMetadata(rel).OwnerID
}

func imageMetadataAllowsAccess(meta imageMetadata, scope ImageAccessScope) bool {
	if meta.Visibility == ImageVisibilityPublic {
		return true
	}
	if scope.All {
		return true
	}
	return scope.OwnerID != "" && meta.OwnerID == scope.OwnerID
}

func (s *ImageService) imageMetadata(rel string) imageMetadata {
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return imageMetadata{Visibility: ImageVisibilityPrivate}
	}
	var raw map[string]any
	if s.store != nil {
		value, err := s.store.LoadJSONDocument(imageOwnerDocumentName(rel))
		if err == nil {
			if meta, ok := value.(map[string]any); ok {
				raw = meta
			}
		}
	}
	if raw == nil {
		data, err := os.ReadFile(metaPath)
		if err != nil {
			return imageMetadata{Visibility: ImageVisibilityPrivate}
		}
		if json.Unmarshal(data, &raw) != nil {
			return imageMetadata{Visibility: ImageVisibilityPrivate}
		}
	}
	return normalizeImageMetadata(raw)
}

func normalizeImageMetadata(raw map[string]any) imageMetadata {
	visibility := strings.TrimSpace(toString(raw["visibility"]))
	if visibility != ImageVisibilityPublic {
		visibility = ImageVisibilityPrivate
	}
	return imageMetadata{
		OwnerID:          strings.TrimSpace(toString(raw["owner_id"])),
		OwnerName:        strings.TrimSpace(toString(raw["owner_name"])),
		Visibility:       visibility,
		PublishedAt:      strings.TrimSpace(toString(raw["published_at"])),
		ResolutionPreset: NormalizeImageResolutionPreset(toString(raw["resolution_preset"])),
		RequestedSize:    strings.TrimSpace(toString(raw["requested_size"])),
		OutputFormat:     NormalizeImageOutputFormat(strings.TrimSpace(toString(raw["output_format"]))),
	}
}

func (s *ImageService) writeImageMetadataForRef(ref imageFileRef, ownerID, ownerName, visibility string, metadataValues ...GeneratedImageMetadata) error {
	meta := s.imageMetadata(ref.rel)
	if ownerID = strings.TrimSpace(ownerID); ownerID != "" {
		meta.OwnerID = ownerID
	}
	if ownerName = strings.TrimSpace(ownerName); ownerName != "" {
		meta.OwnerName = ownerName
	}
	if visibility = strings.TrimSpace(visibility); visibility != "" {
		normalized, err := NormalizeImageVisibility(visibility)
		if err != nil {
			return err
		}
		if normalized == ImageVisibilityPublic {
			if meta.PublishedAt == "" || meta.Visibility != ImageVisibilityPublic {
				meta.PublishedAt = util.NowISO()
			}
		} else {
			meta.PublishedAt = ""
		}
		meta.Visibility = normalized
	}
	if len(metadataValues) > 0 {
		metadata := metadataValues[0]
		if preset := NormalizeImageResolutionPreset(metadata.ResolutionPreset); preset != "" {
			meta.ResolutionPreset = preset
		}
		if requestedSize := strings.TrimSpace(metadata.RequestedSize); requestedSize != "" {
			meta.RequestedSize = requestedSize
		}
		if outputFormat := NormalizeImageOutputFormat(metadata.OutputFormat); outputFormat != "" {
			meta.OutputFormat = outputFormat
		}
	}
	if meta.Visibility == "" {
		meta.Visibility = ImageVisibilityPrivate
	}
	return s.writeImageMetadata(ref.rel, meta)
}

func (s *ImageService) writeImageMetadata(rel string, meta imageMetadata) error {
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return err
	}
	value := map[string]any{
		"visibility": meta.Visibility,
		"updated_at": util.NowISO(),
	}
	if meta.OwnerID != "" {
		value["owner_id"] = meta.OwnerID
	}
	if meta.OwnerName != "" {
		value["owner_name"] = meta.OwnerName
	}
	if meta.PublishedAt != "" {
		value["published_at"] = meta.PublishedAt
	}
	if meta.ResolutionPreset != "" {
		value["resolution_preset"] = meta.ResolutionPreset
	}
	if meta.RequestedSize != "" {
		value["requested_size"] = meta.RequestedSize
	}
	if meta.OutputFormat != "" {
		value["output_format"] = meta.OutputFormat
	}
	if s.store != nil {
		return s.store.SaveJSONDocument(imageOwnerDocumentName(rel), value)
	}
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		return err
	}
	return writeJSONFile(metaPath, value)
}

func (s *ImageService) removeImageOwner(rel string) error {
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return err
	}
	if s.store != nil {
		return s.store.DeleteJSONDocument(imageOwnerDocumentName(rel))
	}
	removeErr := os.Remove(metaPath)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return removeErr
	}
	removeEmptyParentDirs(s.config.ImageMetadataDir(), filepath.Dir(metaPath))
	return nil
}

func (s *ImageService) imageOwnerMetadataPath(rel string) (string, error) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return "", err
	}
	root, err := filepath.Abs(s.config.ImageMetadataDir())
	if err != nil {
		return "", err
	}
	metaPath := filepath.Join(root, filepath.FromSlash(rel)+".json")
	if !pathInsideRoot(root, metaPath) {
		return "", errors.New("图片路径无效")
	}
	return metaPath, nil
}

func imageOwnerDocumentName(rel string) string {
	return "image_metadata/" + filepath.ToSlash(rel) + ".json"
}

func NormalizeImageVisibility(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", ImageVisibilityPrivate:
		return ImageVisibilityPrivate, nil
	case ImageVisibilityPublic:
		return ImageVisibilityPublic, nil
	default:
		return "", errors.New("可见性仅支持 private 或 public")
	}
}

func NormalizeImageResolutionPreset(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1k":
		return "1k"
	case "1080p":
		return "1080p"
	case "2k":
		return "2k"
	case "4k":
		return "4k"
	default:
		return ""
	}
}
