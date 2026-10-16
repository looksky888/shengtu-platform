package service

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type videoCleanupCandidate struct {
	id        string
	item      VideoAsset
	path      string
	trashPath string
}

// CleanupOldVideos removes indexed, completed video assets after retention.
// Active generation state lives outside this service and is never touched.
func (s *VideoAssetService) CleanupOldVideos(retentionDays int) (int, error) {
	if retentionDays < 1 {
		retentionDays = 1
	}
	cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.storeReady {
		return 0, fmt.Errorf("video index is not ready")
	}
	candidates := make([]videoCleanupCandidate, 0)
	for id, item := range s.items {
		path := s.ContentPath(item.OwnerID, item.TaskID)
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		created := parseVideoAssetTime(item.CreatedAt)
		if created.IsZero() {
			created = info.ModTime()
		}
		if !created.Before(cutoff) {
			continue
		}
		trashPath := path + ".retention-deleting"
		if err := os.Rename(path, trashPath); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			s.restoreVideoCleanupFiles(candidates)
			return 0, fmt.Errorf("stage archived video %s for cleanup: %w", id, err)
		}
		candidates = append(candidates, videoCleanupCandidate{id: id, item: item, path: path, trashPath: trashPath})
		delete(s.items, id)
	}
	if len(candidates) == 0 {
		return 0, nil
	}
	if err := s.saveLocked(); err != nil {
		for _, candidate := range candidates {
			s.items[candidate.id] = candidate.item
		}
		s.restoreVideoCleanupFiles(candidates)
		return 0, fmt.Errorf("save video index after cleanup: %w", err)
	}
	for _, candidate := range candidates {
		_ = os.Remove(candidate.trashPath)
	}
	return len(candidates), nil
}

func (s *VideoAssetService) restoreVideoCleanupFiles(candidates []videoCleanupCandidate) {
	for _, candidate := range candidates {
		_ = os.Rename(candidate.trashPath, candidate.path)
	}
}

func parseVideoAssetTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}
