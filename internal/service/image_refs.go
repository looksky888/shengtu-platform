package service

import (
	"errors"
	"os"
	"path/filepath"
)

func (s *ImageService) imageFileRefs(values []string) []imageFileRef {
	if len(values) == 0 {
		return nil
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	refs := make([]imageFileRef, 0, len(values))
	for _, value := range values {
		rel, err := imageRelativePathFromValue(value)
		if err != nil {
			continue
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}
		ref, err := s.imageFileRef(imageRoot, rel)
		if err != nil {
			continue
		}
		refs = append(refs, ref)
	}
	return refs
}

func (s *ImageService) imageFileRef(imageRoot, rel string) (imageFileRef, error) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return imageFileRef{}, err
	}
	imagePath := filepath.Join(imageRoot, filepath.FromSlash(rel))
	if !pathInsideRoot(imageRoot, imagePath) {
		return imageFileRef{}, errors.New("图片路径无效")
	}
	info, err := os.Stat(imagePath)
	if err != nil {
		return imageFileRef{}, err
	}
	if info.IsDir() {
		return imageFileRef{}, errors.New("图片路径不是文件")
	}
	return imageFileRef{rel: rel, path: imagePath, info: info}, nil
}

func (s *ImageService) thumbnailPath(rel string) string {
	return filepath.Join(s.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+thumbnailExtension)
}
