package service

import "strings"

func (s *ImageService) RecordImageOwners(values []string, ownerID string) error {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return nil
	}
	if s.media != nil {
		for _, value := range values {
			if err := s.media.UpdateGeneratedImage(value, ownerID, "", "", GeneratedImageMetadata{}); err != nil {
				return err
			}
		}
		return nil
	}
	for _, ref := range s.imageFileRefs(values) {
		if err := s.writeImageMetadataForRef(ref, ownerID, "", ""); err != nil {
			return err
		}
		if err := s.upsertGalleryIndexEntry(ref.rel, ref.info); err != nil {
			return err
		}
	}
	return nil
}

func (s *ImageService) RecordGeneratedImages(values []string, ownerID, ownerName, visibility string, metadataValues ...GeneratedImageMetadata) error {
	ownerID = strings.TrimSpace(ownerID)
	ownerName = strings.TrimSpace(ownerName)
	metadata := GeneratedImageMetadata{}
	if len(metadataValues) > 0 {
		metadata = metadataValues[0]
	}
	visibility, err := NormalizeImageVisibility(visibility)
	if err != nil {
		visibility = ImageVisibilityPrivate
	}
	if s.media != nil {
		for _, value := range values {
			if err := s.media.UpdateGeneratedImage(value, ownerID, ownerName, visibility, metadata); err != nil {
				return err
			}
		}
		return nil
	}
	for _, ref := range s.imageFileRefs(values) {
		s.ensureThumbnailForRef(ref)
		if ownerID != "" && ownerID != "anonymous" {
			if err := s.writeImageMetadataForRef(ref, ownerID, ownerName, visibility, metadata); err != nil {
				return err
			}
		}
		// Keep gallery index in sync without a full filesystem walk (F-09).
		if err := s.upsertGalleryIndexEntry(ref.rel, ref.info); err != nil {
			return err
		}
	}
	return nil
}
