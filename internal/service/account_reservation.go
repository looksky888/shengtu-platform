package service

import (
	"fmt"
	"time"

	"chatgpt2api/internal/util"
)

type imageTokenReservation struct {
	token string
	slot  int
}

// reserveNextCandidateToken claims an in-flight slot under lock.
// Selection prefers free accounts and applies schedule strategy (least_loaded / least_fail / quota_aware).
func (s *AccountService) reserveNextCandidateToken(excluded map[string]struct{}, allow func(map[string]any) bool) (imageTokenReservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageReservationsLocked()
	s.reclaimExpiredLeasesLocked(time.Now())

	totalAccounts := 0
	matchedAccounts := 0
	capacityBlocked := 0
	candidates := make([]accountCandidate, 0)
	for order, item := range s.items {
		token := util.Clean(item.AccessToken)
		if token == "" {
			continue
		}
		totalAccounts++
		if _, ok := excluded[token]; ok {
			continue
		}
		if allow != nil && !allow(item.toMap()) {
			continue
		}
		matchedAccounts++
		if s.availableImageSlotsLocked(item) <= 0 {
			capacityBlocked++
			continue
		}
		candidates = append(candidates, accountCandidate{
			token:    token,
			inFlight: s.imageReservations[token],
			fail:     item.Fail,
			quota:    item.Quota,
			order:    order,
		})
	}
	if len(candidates) == 0 {
		// Distinguish empty GPT pool / no usable capacity from true concurrent lock saturation.
		if totalAccounts == 0 {
			return imageTokenReservation{}, fmt.Errorf("GPT 号池为空：请先注册或导入 ChatGPT 账号，或改用 Grok 模型（grok-imagine-image）生图")
		}
		if matchedAccounts == 0 {
			return imageTokenReservation{}, fmt.Errorf("当前没有匹配筛选条件的 GPT 图片账号，请检查号池类型/状态，或改用 Grok 模型生图")
		}
		if capacityBlocked > 0 {
			// All matched accounts have capacity 0 (disabled/限流/额度耗尽/冷却) or are fully in-flight.
			// Prefer an empty/exhausted message when nothing is in-flight at all.
			inFlightTotal := 0
			for _, n := range s.imageReservations {
				inFlightTotal += n
			}
			if inFlightTotal == 0 {
				return imageTokenReservation{}, fmt.Errorf("GPT 号池暂无可用图片额度或账号均不可用（已匹配 %d 个）。请刷新额度、补充 ChatGPT 账号，或改用 Grok 模型生图", matchedAccounts)
			}
		}
		// Slot/concurrency exhaustion — accounts exist but locks are held.
		return imageTokenReservation{}, fmt.Errorf("号池暂无可用账号槽位")
	}

	strategy := s.scheduleStrategy
	if strategy == "" {
		strategy = ScheduleLeastLoaded
	}
	best := candidates[0]
	for _, item := range candidates[1:] {
		if betterAccountCandidate(strategy, item, best, s.index, len(s.items)) {
			best = item
		}
	}
	s.index++
	s.imageReservations[best.token]++
	// Lease covers full task timeout window so long generations never get reclaimed mid-flight.
	s.setLeaseLocked(best.token, s.imageLeaseTTLLocked())
	return imageTokenReservation{token: best.token, slot: s.imageReservations[best.token]}, nil
}

type accountCandidate struct {
	token    string
	inFlight int
	fail     int
	quota    int
	order    int
}

func betterAccountCandidate(strategy AccountScheduleStrategy, item, best accountCandidate, rotate, n int) bool {
	// Always prefer lower in-flight first (account lock spread).
	if item.inFlight != best.inFlight {
		return item.inFlight < best.inFlight
	}
	switch strategy {
	case ScheduleLeastFail:
		if item.fail != best.fail {
			return item.fail < best.fail
		}
	case ScheduleQuotaAware:
		if item.quota != best.quota {
			return item.quota > best.quota
		}
	}
	// Fair rotate among equals.
	if n <= 0 {
		return false
	}
	return (item.order+rotate)%n < (best.order+rotate)%n
}

func (s *AccountService) reservedImageSlotAvailable(reservation imageTokenReservation) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := s.findIndexLocked(reservation.token)
	if idx < 0 {
		return false
	}
	return reservation.slot > 0 && reservation.slot <= s.imageAccountCapacity(s.items[idx])
}

func (s *AccountService) availableImageSlotsLocked(account Account) int {
	capacity := s.imageAccountCapacity(account)
	if capacity <= 0 {
		return 0
	}
	token := util.Clean(account.AccessToken)
	if token == "" {
		return 0
	}
	if s.isImageCooldownActiveLocked(token, time.Now()) {
		return 0
	}
	inFlight := s.imageReservations[token]
	if inFlight >= capacity {
		return 0
	}
	return capacity - inFlight
}

func (s *AccountService) releaseImageReservation(accessToken string) {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.releaseImageReservationLocked(accessToken)
}

// ReleaseImageReservation releases an in-flight image slot without changing
// success/failure counters or quota. It is used when ChatGPT returns a valid
// text-only outcome instead of an account-level generation failure.
func (s *AccountService) ReleaseImageReservation(accessToken string) {
	s.releaseImageReservation(accessToken)
}

func (s *AccountService) releaseImageReservationLocked(accessToken string) {
	s.ensureImageReservationsLocked()
	count := s.imageReservations[accessToken]
	if count <= 1 {
		delete(s.imageReservations, accessToken)
		s.clearLeaseIfIdleLocked(accessToken)
		return
	}
	s.imageReservations[accessToken] = count - 1
}

func (s *AccountService) ensureImageReservationsLocked() {
	if s.imageReservations == nil {
		s.imageReservations = map[string]int{}
	}
}

// imageAccountCapacity is the max concurrent in-flight image jobs for one account (account lock budget).
func (s *AccountService) imageAccountCapacity(account Account) int {
	if !account.isImageAvailable() {
		return 0
	}
	limit := 1
	if cfg, ok := s.config.(imageAccountConcurrencyConfig); ok {
		limit = cfg.ImageAccountConcurrency()
	}
	if limit < 1 {
		limit = 1
	}
	if account.ImageQuotaUnknown {
		return 1
	}
	quota := account.Quota
	if quota < 1 {
		return 0
	}
	if quota < limit {
		return quota
	}
	return limit
}

// LockedAccountCount returns how many accounts currently hold an image reservation.
func (s *AccountService) LockedAccountCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageReservationsLocked()
	s.reclaimExpiredLeasesLocked(time.Now())
	return len(s.imageReservations)
}
