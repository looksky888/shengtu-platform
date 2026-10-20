package service

import (
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	// Default when CHATGPT2API_IMAGE_CHALLENGE_COOLDOWN_SECONDS is unset.
	// 15m avoids burning the whole pool for an hour after a CF wave (was hard-coded 60m).
	defaultImageChallengeCooldown = 15 * time.Minute
)

type ImageAccountCooldownInfo struct {
	Duration time.Duration
	Until    time.Time
}

// imageChallengeCooldownDuration reads optional env CHATGPT2API_IMAGE_CHALLENGE_COOLDOWN_SECONDS (60–7200).
func imageChallengeCooldownDuration() time.Duration {
	raw := strings.TrimSpace(os.Getenv("CHATGPT2API_IMAGE_CHALLENGE_COOLDOWN_SECONDS"))
	if raw == "" {
		return defaultImageChallengeCooldown
	}
	sec, err := strconv.Atoi(raw)
	if err != nil {
		return defaultImageChallengeCooldown
	}
	if sec < 60 {
		sec = 60
	}
	if sec > 7200 {
		sec = 7200
	}
	return time.Duration(sec) * time.Second
}

func (s *AccountService) MarkImageChallenge(accessToken string) ImageAccountCooldownInfo {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return ImageAccountCooldownInfo{}
	}
	cooldown := imageChallengeCooldownDuration()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageCooldownsLocked()
	until := time.Now().Add(cooldown)
	s.imageCooldownUntil[accessToken] = until
	return ImageAccountCooldownInfo{Duration: cooldown, Until: until}
}

func (s *AccountService) ensureImageCooldownsLocked() {
	if s.imageCooldownUntil == nil {
		s.imageCooldownUntil = map[string]time.Time{}
	}
}

func (s *AccountService) isImageCooldownActiveLocked(accessToken string, now time.Time) bool {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return false
	}
	if expiry, ok := s.imageModelCooldownUntil[accessToken]; ok {
		if now.Before(expiry) {
			return true
		}
		delete(s.imageModelCooldownUntil, accessToken)
	}
	s.ensureImageCooldownsLocked()
	until, ok := s.imageCooldownUntil[accessToken]
	if !ok {
		return false
	}
	if now.Before(until) {
		return true
	}
	delete(s.imageCooldownUntil, accessToken)
	return false
}

func (s *AccountService) clearImageCooldownLocked(accessToken string) {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return
	}
	s.ensureImageCooldownsLocked()
	delete(s.imageCooldownUntil, accessToken)
}
