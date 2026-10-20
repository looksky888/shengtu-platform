package service

import (
	"strings"
	"time"
)

const imageModelUnavailableCooldown = 10 * time.Minute

// CooldownImageModelUnavailable atomically cools the actual failed account and
// releases its slot. It does not persist or modify quota/status/failure counts.
// Use before the generic MarkImageResult/error-disposal paths.
func (s *AccountService) CooldownImageModelUnavailable(accessToken string) ImageAccountCooldownInfo {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return ImageAccountCooldownInfo{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.findIndexLocked(token) < 0 {
		return ImageAccountCooldownInfo{}
	}
	if s.imageModelCooldownUntil == nil {
		s.imageModelCooldownUntil = map[string]time.Time{}
	}
	now := time.Now()
	for key, expiry := range s.imageModelCooldownUntil {
		if !now.Before(expiry) {
			delete(s.imageModelCooldownUntil, key)
		}
	}
	until := now.Add(imageModelUnavailableCooldown)
	s.imageModelCooldownUntil[token] = until
	s.releaseImageReservationLocked(token)
	return ImageAccountCooldownInfo{Duration: imageModelUnavailableCooldown, Until: until}
}
