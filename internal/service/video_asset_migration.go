package service

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

func (s *VideoAssetService) migrateLegacyContent(asset VideoAsset) (bool, error) {
	next := s.ContentPath(asset.OwnerID, asset.TaskID)
	if _, err := os.Stat(next); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
		return false, err
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(asset.TaskID)))
	legacy := filepath.Join(s.dataDir, "videos", hex.EncodeToString(sum[:])+".mp4")
	if _, err := os.Stat(legacy); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if err := os.MkdirAll(filepath.Dir(next), 0o755); err != nil {
		return false, err
	}
	if err := os.Rename(legacy, next); err != nil {
		return false, err
	}
	return true, nil
}
