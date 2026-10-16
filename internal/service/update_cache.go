package service

import (
	"time"
)

func (s *UpdateService) cachedInfo() *UpdateInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached == nil || time.Since(s.cachedAt) > updateCacheTTL {
		return nil
	}
	out := cloneUpdateInfo(s.cached)
	out.Cached = true
	return out
}

func (s *UpdateService) saveInfo(info *UpdateInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cached = cloneUpdateInfo(info)
	s.cachedAt = time.Now()
}
