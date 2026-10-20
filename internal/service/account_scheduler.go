package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// GetTextAccessToken returns the next text-usable token in pool rotation order.
//
// Text traffic (/v1/chat/completions, /v1/messages, /v1/responses) shares the pool
// with image jobs, so selection rotates from the scheduler cursor and honours the
// same status and cooldown gates: previously every text request reused the first
// non-disabled row, pinning all text load (and any upstream rate limit) on one
// account while the rest stayed idle.
func (s *AccountService) GetTextAccessToken() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if token := s.nextTextAccessTokenLocked(now, false); token != "" {
		return token
	}
	// Nothing unrestricted left: 限流 marks image_gen quota exhaustion and cooldown
	// only gates the image path, so a throttled account may still serve text. Rotate
	// over them instead of failing every text request.
	return s.nextTextAccessTokenLocked(now, true)
}

// nextTextAccessTokenLocked scans the pool from the scheduler cursor and advances it
// past the selected row. allowThrottled additionally accepts 限流 / cooling accounts.
func (s *AccountService) nextTextAccessTokenLocked(now time.Time, allowThrottled bool) string {
	total := len(s.items)
	if total == 0 {
		return ""
	}
	start := s.index % total
	for offset := 0; offset < total; offset++ {
		idx := (start + offset) % total
		item := s.items[idx]
		token := util.Clean(item.AccessToken)
		if token == "" {
			continue
		}
		switch util.Clean(item.Status) {
		case "禁用", "异常":
			continue
		case "限流":
			if !allowThrottled {
				continue
			}
		}
		if !allowThrottled && s.isImageCooldownActiveLocked(token, now) {
			continue
		}
		s.index = (idx + 1) % total
		return token
	}
	return ""
}

func (s *AccountService) GetAvailableAccessToken(ctx context.Context) (string, error) {
	return s.GetAvailableAccessTokenFor(ctx, nil)
}

// maxImageAcquireProbes caps remote probes per acquire attempt to bound tail latency
// when many tokens are unhealthy. Raised from 6 so mixed Free/Paid pools with a few
// dead tokens at the front of the schedule are less likely to fail immediately.
const maxImageAcquireProbes = 12

const imageAccountPreflightTTL = 60 * time.Second

// GetAvailableAccessTokenFor reserves an account lock, probes remote availability, and
// either returns the token or disposes unusable accounts (graded) and tries the next one.
func (s *AccountService) GetAvailableAccessTokenFor(ctx context.Context, allow func(map[string]any) bool) (string, error) {
	return s.GetAvailableAccessTokenForExcluding(ctx, allow, nil)
}

// GetAvailableAccessTokenForExcluding reserves a token that was not already
// attempted by the current image job. The caller-owned set is copied so the
// preflight loop can add its own rejected candidates without mutating it.
func (s *AccountService) GetAvailableAccessTokenForExcluding(ctx context.Context, allow func(map[string]any) bool, excluded map[string]struct{}) (string, error) {
	attempted := make(map[string]struct{}, len(excluded))
	for token := range excluded {
		if token = strings.TrimSpace(token); token != "" {
			attempted[token] = struct{}{}
		}
	}
	switchCount := 0
	var lastProbeErr error
	reportTaskProgress(ctx, 30, "正在分配账号", "申请号池账户锁")
	for {
		if switchCount >= maxImageAcquireProbes {
			return "", fmt.Errorf("号池探测次数过多（已尝试 %d 个账号），请稍后重试", switchCount)
		}
		reservation, err := s.reserveNextCandidateToken(attempted, allow)
		if err != nil {
			if _, hasDeadline := ctx.Deadline(); len(attempted) == 0 && hasDeadline && s.hasReadyImageAccountFor(allow) {
				select {
				case <-ctx.Done():
					return "", ctx.Err()
				case <-time.After(time.Second):
					continue
				}
			}
			if len(attempted) > 0 {
				if lastProbeErr != nil {
					return "", fmt.Errorf("号池候选账号预检均失败（已尝试 %d 个令牌）：%w", len(attempted), lastProbeErr)
				}
				return "", fmt.Errorf("号池暂无可用账号槽位（已尝试 %d 个令牌）", len(attempted))
			}
			return "", err
		}
		attempted[reservation.token] = struct{}{}
		label := s.AccountLabel(reservation.token)
		reportTaskEvent(ctx, "account_claim", "已锁定候选账号 "+label, map[string]any{
			"account_label": label,
			"token_hash":    shortTokenHash(reservation.token),
		})

		account, probeErr := s.probeImageAccountAvailability(ctx, reservation.token)
		if probeErr != nil {
			lastProbeErr = probeErr
			s.releaseImageReservation(reservation.token)
			grade := ClassifyAccountFailure("image_acquire", probeErr.Error())
			action := s.disposeAccount(reservation.token, "image_acquire", probeErr.Error(), grade)
			reportTaskEvent(ctx, "account_reject", "账号不可用，已"+string(action)+"，切换下一号", map[string]any{
				"account_label": label,
				"grade":         string(grade),
				"action":        string(action),
				"reason":        truncateReason(probeErr.Error(), 160),
			})
			switchCount++
			continue
		}
		if account == nil {
			s.releaseImageReservation(reservation.token)
			switchCount++
			continue
		}
		if allow != nil && !allow(account) {
			s.releaseImageReservation(reservation.token)
			reportTaskEvent(ctx, "account_skip", "账号类型不匹配，切换下一号", map[string]any{"account_label": label})
			switchCount++
			continue
		}
		if !IsImageAccountAvailable(account) {
			s.releaseImageReservation(reservation.token)
			status := util.Clean(account["status"])
			grade := DisposalTemporary
			if status == "异常" || status == "禁用" {
				grade = DisposalPermanent
			}
			action := s.disposeAccount(reservation.token, "image_acquire", "account status "+status, grade)
			reportTaskEvent(ctx, "account_reject", "状态="+status+"，已"+string(action), map[string]any{
				"account_label": label,
				"grade":         string(grade),
				"action":        string(action),
			})
			switchCount++
			continue
		}
		if !s.reservedImageSlotAvailable(reservation) {
			s.releaseImageReservation(reservation.token)
			switchCount++
			continue
		}
		finalLabel := s.AccountLabel(reservation.token)
		reportTaskAccount(ctx, finalLabel, shortTokenHash(reservation.token), switchCount)
		reportTaskProgress(ctx, 48, "正在启动生成", "已分配 "+finalLabel)
		reportTaskEvent(ctx, "account_ready", "账号可用: "+finalLabel, map[string]any{
			"account_label":        finalLabel,
			"account_switch_count": switchCount,
			"token_hash":           shortTokenHash(reservation.token),
		})
		return reservation.token, nil
	}
}

// probeImageAccountAvailability refreshes remote quota/status for the locked token.
// Does not apply disposal itself — caller grades the error.
func (s *AccountService) probeImageAccountAvailability(ctx context.Context, accessToken string) (map[string]any, error) {
	if account := s.cachedImageAccount(accessToken, time.Now()); account != nil {
		return account, nil
	}
	remote, err := s.FetchRemoteInfo(ctx, accessToken)
	if err != nil {
		s.clearImageProbe(accessToken)
		return nil, err
	}
	account, err := s.UpdateAccount(accessToken, remote)
	if err != nil || account == nil || !IsImageAccountAvailable(account) {
		s.clearImageProbe(accessToken)
		return account, err
	}
	s.markImageProbe(accessToken, time.Now())
	return account, nil
}

func (s *AccountService) cachedImageAccount(accessToken string, now time.Time) map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.imageProbeAt == nil || now.Sub(s.imageProbeAt[accessToken]) > imageAccountPreflightTTL {
		return nil
	}
	idx := s.findIndexLocked(accessToken)
	if idx < 0 || !s.items[idx].isImageAvailable() {
		return nil
	}
	return s.items[idx].toMap()
}

func (s *AccountService) markImageProbe(accessToken string, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.imageProbeAt == nil {
		s.imageProbeAt = make(map[string]time.Time)
	}
	s.imageProbeAt[accessToken] = now
}

func (s *AccountService) clearImageProbe(accessToken string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.imageProbeAt, accessToken)
}

func shouldForceRemoveOnAcquire(message string) bool {
	message = strings.TrimSpace(message)
	if message == "" {
		return false
	}
	if IsAccountInvalidErrorMessage(message) || isPermanentAccountInvalidForEvent("image_acquire", message) {
		return true
	}
	// Bootstrap 401 is excluded from permanent classification elsewhere, but for acquire
	// we still treat clearly unauthorized tokens as permanent.
	lower := strings.ToLower(message)
	return strings.Contains(lower, "http 401") ||
		strings.Contains(lower, "status=401") ||
		strings.Contains(lower, "unauthorized")
}

// forceRemoveUnavailableAccount removes a token from the active pool (after cabin write, or tests).
func (s *AccountService) forceRemoveUnavailableAccount(accessToken, event, reason string) bool {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return false
	}
	removed := s.RemoveToken(accessToken)
	if removed && s.logs != nil {
		s.logs.Add("自动移除不可用账号", map[string]any{
			"module":         "accounts",
			"operation_type": "自动移除",
			"source":         event,
			"reason":         truncateReason(reason, 200),
			"token":          util.AnonymizeToken(accessToken),
		})
	}
	return removed
}

func (s *AccountService) HasAvailableAccount() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.items {
		if s.availableImageSlotsLocked(item) > 0 {
			return true
		}
	}
	return false
}

func (s *AccountService) hasReadyImageAccountFor(allow func(map[string]any) bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.items {
		if allow != nil && !allow(item.toMap()) {
			continue
		}
		if s.isImageCooldownActiveLocked(util.Clean(item.AccessToken), time.Now()) {
			continue
		}
		if s.imageAccountCapacity(item) > 0 {
			return true
		}
	}
	return false
}
