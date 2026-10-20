package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type videoCleanupCandidate struct {
	id        string
	item      VideoAsset
	path      string
	trashPath string
}

// CleanupOldVideos removes indexed, completed video assets after retention and
// reclaims orphan files under videos/ that no index row references (bytes that
// landed on disk while Record failed, rows rolled back by a failed index save,
// or legacy names that were never migrated).
// Active generation state lives outside this service and is never touched: the
// directory sweep only deletes files older than the retention cutoff.
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
	indexedPaths := make(map[string]struct{}, len(s.items))
	candidates := make([]videoCleanupCandidate, 0)
	for id, item := range s.items {
		path := s.ContentPath(item.OwnerID, item.TaskID)
		indexedPaths[path] = struct{}{}
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
	if len(candidates) > 0 {
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
	}
	orphans, orphanErr := s.removeOrphanVideoFilesLocked(indexedPaths, cutoff)
	return len(candidates) + orphans, orphanErr
}

// removeOrphanVideoFilesLocked deletes videos/ files that no index row claims.
// Only files whose modification time is already past the retention cutoff are
// touched, so an output still being written by a running task is never removed.
func (s *VideoAssetService) removeOrphanVideoFilesLocked(indexedPaths map[string]struct{}, cutoff time.Time) (int, error) {
	dir := filepath.Join(s.dataDir, "videos")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("scan video directory: %w", err)
	}
	removed := 0
	for _, entry := range entries {
		path := filepath.Join(dir, entry.Name())
		if _, ok := indexedPaths[path]; ok {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || !info.ModTime().Before(cutoff) {
			continue
		}
		if err := os.Remove(path); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return removed, fmt.Errorf("remove orphan video %s: %w", entry.Name(), err)
		}
		removed++
	}
	return removed, nil
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
