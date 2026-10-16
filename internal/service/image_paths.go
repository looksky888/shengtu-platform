package service

import (
	"errors"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func imageDay(rel string, modTime time.Time) string {
	parts := strings.Split(rel, "/")
	if len(parts) >= 4 {
		return strings.Join(parts[:3], "-")
	}
	return modTime.Format("2006-01-02")
}

func thumbnailMetadataDocumentName(rel string) string {
	return "image_thumbnails/" + filepath.ToSlash(rel) + thumbnailExtension + ".json"
}

func sourceImageRelativePathFromThumbnail(value string) (string, error) {
	thumbnailRel, err := cleanImageRelativePath(value)
	if err != nil {
		return "", err
	}
	if !strings.HasSuffix(thumbnailRel, thumbnailExtension) {
		return "", errors.New("缩略图路径无效")
	}
	return cleanImageRelativePath(strings.TrimSuffix(thumbnailRel, thumbnailExtension))
}

func thumbnailRelativePath(root, thumbPath string) string {
	rel, err := filepath.Rel(root, thumbPath)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

func publicAssetURL(baseURL, prefix, rel string) string {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.Trim(prefix, "/") + "/" + strings.Join(parts, "/")
}

func thumbnailURL(baseURL, thumbRel string, sourceModTime time.Time) string {
	return publicAssetURL(baseURL, "image-thumbnails", thumbRel) +
		"?v=" + strconv.Itoa(thumbnailCacheVersion) + "-" + strconv.FormatInt(sourceModTime.UnixNano(), 10)
}

func cleanImageRelativePath(value string) (string, error) {
	rel := filepath.ToSlash(strings.TrimSpace(value))
	if rel == "" || strings.ContainsRune(rel, 0) || strings.HasPrefix(rel, "/") || filepath.IsAbs(filepath.FromSlash(rel)) {
		return "", errors.New("图片路径无效")
	}
	if path.Clean(rel) != rel {
		return "", errors.New("图片路径无效")
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." || strings.Contains(part, ":") {
			return "", errors.New("图片路径无效")
		}
	}
	return rel, nil
}

func imageRelativePathFromValue(value string) (string, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", errors.New("图片路径无效")
	}
	if parsed, err := url.Parse(text); err == nil {
		pathValue := parsed.EscapedPath()
		if pathValue == "" {
			pathValue = parsed.Path
		}
		if parsed.Scheme != "" || strings.HasPrefix(pathValue, "/") {
			const imagePrefix = "/images/"
			index := strings.Index(pathValue, imagePrefix)
			if index < 0 {
				return "", errors.New("图片路径无效")
			}
			rel, err := url.PathUnescape(pathValue[index+len(imagePrefix):])
			if err != nil {
				return "", errors.New("图片路径无效")
			}
			return cleanImageRelativePath(rel)
		}
	}
	return cleanImageRelativePath(text)
}

func removeImageThumbnail(root, rel string) error {
	thumbPath := filepath.Join(root, filepath.FromSlash(rel)+thumbnailExtension)
	if !pathInsideRoot(root, thumbPath) {
		return errors.New("图片路径无效")
	}
	removeErr := os.Remove(thumbPath)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return removeErr
	}
	metaErr := os.Remove(thumbPath + ".json")
	if metaErr != nil && !errors.Is(metaErr, os.ErrNotExist) {
		return metaErr
	}
	removeEmptyParentDirs(root, filepath.Dir(thumbPath))
	return nil
}

func pathInsideRoot(root, target string) bool {
	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(root, targetAbs)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func removeEmptyParentDirs(root, start string) {
	current, err := filepath.Abs(start)
	if err != nil {
		return
	}
	for pathInsideRoot(root, current) {
		err := os.Remove(current)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return
		}
		current = filepath.Dir(current)
	}
}
