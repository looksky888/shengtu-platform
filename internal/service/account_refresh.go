package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"chatgpt2api/internal/util"
)

func (s *AccountService) RefreshAccountState(ctx context.Context, accessToken string) map[string]any {
	remote, err := s.FetchRemoteInfo(ctx, accessToken)
	if err != nil {
		if _, handled := s.ApplyAccountError(accessToken, "refresh_account_state", err); handled {
			return s.GetAccount(accessToken)
		}
		return nil
	}
	item, err := s.UpdateAccount(accessToken, remote)
	if err != nil {
		return nil
	}
	return item
}

func (s *AccountService) RefreshAccounts(ctx context.Context, accessTokens []string) map[string]any {
	tokens := cleanTokens(accessTokens)
	if len(tokens) == 0 {
		return map[string]any{"refreshed": 0, "errors": []map[string]string{}, "items": s.ListAccounts()}
	}
	type result struct {
		token string
		info  map[string]any
		err   error
	}
	workers := len(tokens)
	if workers > 10 {
		workers = 10
	}
	jobs := make(chan string)
	results := make(chan result, len(tokens))
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for token := range jobs {
				info, err := s.FetchRemoteInfo(ctx, token)
				results <- result{token: token, info: info, err: err}
			}
		}()
	}
	go func() {
		for _, token := range tokens {
			jobs <- token
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()
	refreshed := 0
	errors := []map[string]string{}
	for res := range results {
		if res.err == nil {
			item, err := s.UpdateAccount(res.token, res.info)
			if err != nil {
				errors = append(errors, map[string]string{"access_token": res.token, "error": err.Error()})
				continue
			}
			if item == nil {
				errors = append(errors, map[string]string{"access_token": res.token, "error": "账号不存在或已移除"})
				continue
			}
			refreshed++
			continue
		}
		message := res.err.Error()
		if normalized, handled := s.ApplyAccountError(res.token, "refresh_accounts", res.err); handled {
			message = normalized
		}
		errors = append(errors, map[string]string{"access_token": res.token, "error": message})
	}
	return map[string]any{"refreshed": refreshed, "errors": errors, "items": s.ListAccounts()}
}

func (s *AccountService) MarkImageResult(accessToken string, success bool) map[string]any {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return nil
	}
	s.mu.Lock()
	if !success {
		delete(s.imageProbeAt, accessToken)
	}
	s.releaseImageReservationLocked(accessToken)
	idx := s.findIndexLocked(accessToken)
	if idx < 0 {
		s.mu.Unlock()
		return nil
	}
	next := s.items[idx]
	next.LastUsedAt = util.NowLocal()
	unknown := next.ImageQuotaUnknown
	quotaExhausted := false
	if success {
		s.clearImageCooldownLocked(accessToken)
		next.Success++
		if !unknown {
			quota := next.Quota - 1
			if quota < 0 {
				quota = 0
			}
			next.Quota = quota
			if quota == 0 {
				next.Status = "限流"
				quotaExhausted = true
			} else if next.Status == "限流" {
				next.Status = "正常"
			}
		}
	} else {
		next.Fail++
	}
	account, ok := accountFromMap(next.toMap())
	if !ok {
		s.mu.Unlock()
		return nil
	}
	// Legacy toggle: hard-delete rate-limited. Prefer quarantine path below for quota=0.
	if account.Status == "限流" && s.autoRemoveRateLimitedAccounts() && !quotaExhausted {
		prevItems := append([]Account(nil), s.items...)
		prevReservations := cloneStringIntMap(s.imageReservations)
		prevCooldown := cloneStringTimeMap(s.imageCooldownUntil)
		delete(s.imageReservations, accessToken)
		delete(s.imageCooldownUntil, accessToken)
		s.items = append(s.items[:idx], s.items[idx+1:]...)
		if err := s.deleteAccountsRowLocked([]string{accessToken}); err != nil {
			s.items = prevItems
			s.imageReservations = prevReservations
			s.imageCooldownUntil = prevCooldown
			s.mu.Unlock()
			return nil
		}
		s.mu.Unlock()
		s.logs.Add("自动移除限流账号", map[string]any{
			"module":         "accounts",
			"operation_type": "自动移除",
			"token":          util.AnonymizeToken(accessToken),
		})
		return nil
	}
	prevAccount := s.items[idx]
	s.items[idx] = account
	if err := s.saveAccountLocked(accessToken); err != nil {
		s.items[idx] = prevAccount
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	// Successful generation that exhausted image_gen quota → isolation cabin (not hard-delete).
	if quotaExhausted {
		s.quarantineTemporaryAccount(accessToken, "quota_exhausted", "image_gen quota exhausted after success")
		return nil
	}
	return account.toMap()
}

func (s *AccountService) RemoveInvalidToken(accessToken, event string) bool {
	if !s.autoRemoveInvalidAccounts() {
		return false
	}
	removed := s.RemoveToken(accessToken)
	if removed {
		s.logs.Add("自动移除异常账号", map[string]any{
			"module":         "accounts",
			"operation_type": "自动移除",
			"source":         event,
			"token":          util.AnonymizeToken(accessToken),
		})
	}
	return removed
}

func (s *AccountService) StartLimitedWatcher(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	go func() {
		timer := time.NewTimer(0)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				s.runLimitedWatcherCycle(ctx)
				timer.Reset(interval)
			}
		}
	}()
}

// runLimitedWatcherCycle is one refresh/restore/reconcile pass of the limited-account
// watcher. It is also the runtime half of the isolation-cabin reconciler: a pool
// removal that failed while quarantining is retried here instead of only at startup.
func (s *AccountService) runLimitedWatcherCycle(ctx context.Context) {
	tokens := s.ListLimitedTokens()
	if len(tokens) > 0 {
		s.RefreshAccounts(ctx, tokens)
		// Any remaining 限流/zero-quota in pool after refresh → isolation cabin.
		s.quarantineInPoolExhaustedAccounts()
	}
	// Temporary quarantine: probe and restore when quota/status recovers.
	s.tryRestoreTemporaryQuarantine(ctx)
	if _, err := s.ReconcileQuarantinePool(); err != nil && s.logs != nil {
		s.logs.Add("运行期隔离协调失败", map[string]any{
			"module":         "accounts",
			"operation_type": "隔离协调",
			"reason":         truncateReason(err.Error(), 300),
		})
	}
}

// quarantineInPoolExhaustedAccounts moves active-pool accounts that are 限流 or
// known zero quota into the isolation cabin (idempotent if already gone).
func (s *AccountService) quarantineInPoolExhaustedAccounts() {
	s.mu.Lock()
	var targets []string
	for _, item := range s.items {
		token := util.Clean(item.AccessToken)
		if token == "" {
			continue
		}
		if item.Status == "限流" || (!item.ImageQuotaUnknown && item.Quota <= 0 && item.Status != "禁用") {
			targets = append(targets, token)
		}
	}
	s.mu.Unlock()
	for _, token := range targets {
		s.quarantineTemporaryAccount(token, "pool_sweep", "status 限流 or image quota exhausted")
	}
}

// tryRestoreTemporaryQuarantine re-probes isolation-cabin tokens marked temporary
// and puts them back into the pool when remote quota/status looks available.
// Probes use FetchRemoteInfo (token need not be in the active pool).
// At most maxTemporaryRestoreProbesPerCycle newest temporary rows are probed per cycle
// so large cabins do not stall the refresh loop.
func (s *AccountService) tryRestoreTemporaryQuarantine(ctx context.Context) {
	list := s.temporaryQuarantineForProbe()
	for _, entry := range list {
		select {
		case <-ctx.Done():
			return
		default:
		}
		remote, err := s.FetchRemoteInfo(ctx, entry.AccessToken)
		if err != nil || remote == nil {
			continue
		}
		// Normalize probe map as a virtual account for availability check.
		merged := mergeMaps(map[string]any{"access_token": entry.AccessToken, "status": "正常"}, remote)
		if !IsImageAccountAvailable(merged) {
			continue
		}
		result := s.RestoreQuarantineAuto(entry.TokenHash)
		if util.ToBool(result["restored"]) {
			if err := s.finalizeTemporaryQuarantineRestore(entry, remote); err != nil {
				if s.logs != nil {
					s.logs.Add("隔离仓账号恢复失败", map[string]any{
						"module":         "accounts",
						"operation_type": "恢复失败",
						"email":          entry.Email,
						"token":          util.AnonymizeToken(entry.AccessToken),
						"reason":         truncateReason(err.Error(), 300),
					})
				}
				continue
			}
			if s.logs != nil {
				s.logs.Add("隔离仓账号已恢复可用", map[string]any{
					"module":         "accounts",
					"operation_type": "恢复",
					"email":          entry.Email,
					"token":          util.AnonymizeToken(entry.AccessToken),
				})
			}
		}
	}
}

func (s *AccountService) finalizeTemporaryQuarantineRestore(entry quarantineEntry, remote map[string]any) error {
	updated, err := s.UpdateAccount(entry.AccessToken, remote)
	if err == nil && updated != nil {
		return nil
	}
	if err == nil {
		err = fmt.Errorf("恢复后的账号不存在")
	}
	if rollbackErr := s.reQuarantineRestoredEntry(entry); rollbackErr != nil {
		return fmt.Errorf("更新恢复账号失败: %w；重新隔离失败: %v", err, rollbackErr)
	}
	return fmt.Errorf("更新恢复账号失败，已重新隔离: %w", err)
}
