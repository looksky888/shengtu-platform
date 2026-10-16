package service

import (
	"time"

	"chatgpt2api/internal/util"
)

// AccountScheduleStrategy selects how free accounts are ordered under concurrency.
type AccountScheduleStrategy string

const (
	ScheduleLeastLoaded AccountScheduleStrategy = "least_loaded"
	ScheduleLeastFail   AccountScheduleStrategy = "least_fail"
	ScheduleQuotaAware  AccountScheduleStrategy = "quota_aware"
)

const (
	// Floor so short-timeout installs still get a stable exclusive lock window.
	minImageLeaseTTL = 15 * time.Minute
	// Cap slightly above max task timeout (3600s) + buffer.
	maxImageLeaseTTL    = 70 * time.Minute
	imageLeaseTTLBuffer = 5 * time.Minute
)

// imageLeaseTTLConfig optionally supplies image task timeout for lease sizing.
type imageLeaseTTLConfig interface {
	ImageTaskTimeoutSeconds() int
}

// SetScheduleStrategy configures account selection policy.
func (s *AccountService) SetScheduleStrategy(strategy AccountScheduleStrategy) {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch strategy {
	case ScheduleLeastFail, ScheduleQuotaAware, ScheduleLeastLoaded:
		s.scheduleStrategy = strategy
	default:
		s.scheduleStrategy = ScheduleLeastLoaded
	}
}

// PoolHealth returns ops snapshot for task-queue side panel.
func (s *AccountService) PoolHealth() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageReservationsLocked()
	s.ensureImageCooldownsLocked()
	s.reclaimExpiredLeasesLocked(time.Now())

	total := len(s.items)
	available := 0
	freeSlots := 0
	locked := 0
	cooling := 0
	invalid := 0
	disabled := 0
	rateLimited := 0
	now := time.Now()
	for _, item := range s.items {
		token := util.Clean(item.AccessToken)
		status := util.Clean(item.Status)
		switch status {
		case "异常":
			invalid++
		case "禁用":
			disabled++
		case "限流":
			rateLimited++
		}
		if s.imageReservations[token] > 0 {
			locked++
		}
		if s.isImageCooldownActiveLocked(token, now) {
			cooling++
		}
		slots := s.availableImageSlotsLocked(item)
		if slots > 0 {
			available++
			freeSlots += slots
		}
	}
	ops := map[string]int{}
	for k, v := range s.poolOpCounts {
		ops[k] = v
	}
	opsDay := firstNonEmpty(s.poolOpDay, util.ChinaDate())
	dispose := buildDisposeMetrics(opsDay, ops)
	strategy := string(s.scheduleStrategy)
	if strategy == "" {
		strategy = string(ScheduleLeastLoaded)
	}
	ttl := s.imageLeaseTTLLocked()
	return map[string]any{
		"total":            total,
		"available":        available,
		"free_slots":       freeSlots,
		"locked":           locked,
		"cooling":          cooling,
		"invalid":          invalid,
		"disabled":         disabled,
		"rate_limited":     rateLimited,
		"schedule":         strategy,
		"lease_ttl_sec":    int(ttl.Seconds()),
		"ops_day":          opsDay,
		"ops":              ops,
		"dispose":          dispose.toMap(),
		"quarantine_count": s.quarantineCountUnlocked(),
		"quarantine_max":   s.quarantineMax(),
		"updated_at":       util.NowLocal(),
	}
}

func (s *AccountService) quarantineCountUnlocked() int {
	path := s.quarantinePath
	if path == "" {
		return 0
	}
	if !s.quarantineMu.TryLock() {
		return 0
	}
	list := s.loadQuarantineLocked(path)
	s.quarantineMu.Unlock()
	return len(list)
}

func (s *AccountService) accountLabelLocked(accessToken string) string {
	idx := s.findIndexLocked(accessToken)
	if idx < 0 {
		return shortTokenHash(accessToken)
	}
	email := util.Clean(s.items[idx].Email)
	if email != "" {
		return maskOutlookEmail(email)
	}
	return "账号" + itoa(idx+1)
}

func (s *AccountService) AccountLabel(accessToken string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.accountLabelLocked(accessToken)
}

// imageLeaseTTLLocked sizes exclusive lock lease to cover full image task timeout.
// TTL = max(15m, taskTimeout+5m), capped at 70m so long tasks never outlive the lease.
func (s *AccountService) imageLeaseTTLLocked() time.Duration {
	ttl := minImageLeaseTTL
	if cfg, ok := s.config.(imageLeaseTTLConfig); ok {
		seconds := cfg.ImageTaskTimeoutSeconds()
		if seconds > 0 {
			candidate := time.Duration(seconds)*time.Second + imageLeaseTTLBuffer
			if candidate > ttl {
				ttl = candidate
			}
		}
	}
	if ttl > maxImageLeaseTTL {
		ttl = maxImageLeaseTTL
	}
	return ttl
}

// setLeaseLocked sets/extends lease expiry to now+ttl (never shortens an existing later expiry).
func (s *AccountService) setLeaseLocked(accessToken string, ttl time.Duration) {
	if accessToken == "" {
		return
	}
	if s.imageLeases == nil {
		s.imageLeases = map[string]time.Time{}
	}
	if ttl <= 0 {
		ttl = s.imageLeaseTTLLocked()
	}
	until := time.Now().Add(ttl)
	if prev, ok := s.imageLeases[accessToken]; ok && prev.After(until) {
		return
	}
	s.imageLeases[accessToken] = until
}

// RenewImageLease extends lock window for an in-flight account (e.g. long generation).
func (s *AccountService) RenewImageLease(accessToken string) {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageReservationsLocked()
	if s.imageReservations[accessToken] <= 0 {
		return
	}
	s.setLeaseLocked(accessToken, s.imageLeaseTTLLocked())
}

func (s *AccountService) clearLeaseIfIdleLocked(accessToken string) {
	if s.imageReservations[accessToken] > 0 {
		return
	}
	if s.imageLeases != nil {
		delete(s.imageLeases, accessToken)
	}
}

// reclaimExpiredLeasesLocked drops only zombie locks whose lease fully expired.
// Active holders keep slots until MarkImageResult releases them; TTL must cover task timeout.
func (s *AccountService) reclaimExpiredLeasesLocked(now time.Time) int {
	if s.imageLeases == nil {
		return 0
	}
	s.ensureImageReservationsLocked()
	reclaimedSlots := 0
	for token, until := range s.imageLeases {
		if now.Before(until) {
			continue
		}
		// Lease expired: treat remaining reservations as zombies and free all slots for this token.
		if count := s.imageReservations[token]; count > 0 {
			reclaimedSlots += count
			delete(s.imageReservations, token)
		}
		delete(s.imageLeases, token)
	}
	if reclaimedSlots > 0 {
		if s.poolOpCounts == nil {
			s.poolOpCounts = map[string]int{}
		}
		s.poolOpCounts["lease_reclaimed"] += reclaimedSlots
	}
	return reclaimedSlots
}
