package app

import (
	"context"
	"hash/fnv"
	"io"
	"strings"
	"time"
)

func (s *Server) runMailWatcher(ctx context.Context) {
	defer func() {
		s.mailWatcherMu.Lock()
		s.mailWatcherCancel = nil
		s.mailWatcherMu.Unlock()
	}()

	idleWorkers := make(map[string]mailboxWatcherIdleWorker)
	stopIdleWorkers := func() {
		for key, worker := range idleWorkers {
			worker.cancel()
			delete(idleWorkers, key)
		}
	}
	defer stopIdleWorkers()
	s.ensureMailWatcherIdleWorkers(ctx, idleWorkers)
	s.syncMailWatcherRound(ctx, false)
	interval := s.mailWatcherInterval
	if interval <= 0 {
		interval = mailWatcherPollInterval
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.mailWatcherWake:
			s.ensureMailWatcherIdleWorkers(ctx, idleWorkers)
			s.syncMailWatcherRound(ctx, false)
		case <-ticker.C:
			s.ensureMailWatcherIdleWorkers(ctx, idleWorkers)
			s.syncMailWatcherRound(ctx, false)
		}
	}
}

func (s *Server) runAppleAccountKeepAlive(ctx context.Context) {
	defer func() {
		s.appleAccountKeepAliveMu.Lock()
		s.appleAccountKeepAliveCancel = nil
		s.appleAccountKeepAliveMu.Unlock()
	}()

	s.keepAliveAppleAccountRound(ctx)
	interval := s.appleAccountKeepAliveInterval
	if interval <= 0 {
		interval = appleAccountKeepAliveDefaultInterval
	}
	ticker := time.NewTicker(appleAccountKeepAliveScanInterval(interval))
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.keepAliveAppleAccountRound(ctx)
		}
	}
}

func appleAccountKeepAliveScanInterval(base time.Duration) time.Duration {
	if base <= 0 {
		base = appleAccountKeepAliveDefaultInterval
	}
	interval := base / 4
	if interval > 30*time.Second {
		return 30 * time.Second
	}
	if interval < 5*time.Second {
		return 5 * time.Second
	}
	return interval
}

func (s *Server) keepAliveAppleAccountRound(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	keepAliveFn := s.keepAliveAppleAccountState
	if keepAliveFn == nil {
		keepAliveFn = func(ctx context.Context, state LoginState) (LoginState, error) {
			return NewICloudClient().keepAliveAppleAccountManageStateUnlocked(ctx, state)
		}
	}
	baseInterval := s.appleAccountKeepAliveInterval
	if baseInterval <= 0 {
		baseInterval = appleAccountKeepAliveDefaultInterval
	}
	now := time.Now()
	for _, session := range s.appleAccountKeepAliveSessions() {
		if ctx.Err() != nil {
			return
		}
		state, ok := appleAccountLoginState(session)
		if !ok || strings.TrimSpace(state.APIKey) == "" {
			continue
		}
		interval := appleAccountKeepAliveIntervalForSession(session, baseInterval)
		if !appleAccountKeepAliveDue(state, now, interval) {
			continue
		}
		callCtx, cancel := context.WithTimeout(ctx, appleAccountKeepAliveTimeout)
		release, gateErr := acquireAppleAccountOperationGate(callCtx, appleAccountOperationKey(session, state))
		if gateErr != nil {
			cancel()
			if s.logger != nil {
				s.logger.Warn("apple account keepalive gate failed", "owner", s.ownerName(session.OwnerID), "account_id", session.AccountID, "apple_id", session.AppleID, "err", gateErr)
			}
			continue
		}
		next, err := keepAliveFn(callCtx, state)
		release()
		cancel()
		if err != nil {
			if isCodedError(err, "apple_account_auth_failed") {
				state.LastCheckedAt = time.Now()
				state.LastCheckOK = false
				state.LastStatusMessage = "新接口登录态异常：" + err.Error()
				session = withAppleAccountLoginState(session, state)
				if saveErr := s.store.SaveICloudSessionForOwner(session.OwnerID, session); saveErr != nil && s.logger != nil {
					s.logger.Warn("apple account keepalive save failed", "owner", s.ownerName(session.OwnerID), "account_id", session.AccountID, "err", saveErr)
				}
			}
			if s.logger != nil {
				s.logger.Warn("apple account keepalive failed", "owner", s.ownerName(session.OwnerID), "account_id", session.AccountID, "apple_id", session.AppleID, "err", err)
			}
			continue
		}
		session = withAppleAccountLoginState(session, next)
		if err := s.store.SaveICloudSessionForOwner(session.OwnerID, session); err != nil {
			if s.logger != nil {
				s.logger.Warn("apple account keepalive save failed", "owner", s.ownerName(session.OwnerID), "account_id", session.AccountID, "err", err)
			}
			continue
		}
		if s.logger != nil {
			s.logger.Info("apple account keepalive ok", "owner", s.ownerName(session.OwnerID), "account_id", session.AccountID, "apple_id", session.AppleID)
		}
	}
}

func (s *Server) appleAccountKeepAliveSessions() []ICloudSession {
	state := s.store.Snapshot()
	out := make([]ICloudSession, 0, len(state.ICloudSessions)+1)
	if state.ICloudSession != nil && appleAccountKeepAliveEligible(*state.ICloudSession) {
		out = append(out, cloneICloudSession(*state.ICloudSession))
	}
	for _, session := range state.ICloudSessions {
		if !appleAccountKeepAliveEligible(session) {
			continue
		}
		out = append(out, cloneICloudSession(session))
	}
	return out
}

func appleAccountKeepAliveEligible(session ICloudSession) bool {
	state, ok := appleAccountLoginState(session)
	if !ok || strings.TrimSpace(state.APIKey) == "" {
		return false
	}
	if !state.LastCheckedAt.IsZero() && !state.LastCheckOK {
		return false
	}
	return true
}

func appleAccountKeepAliveIntervalForSession(session ICloudSession, base time.Duration) time.Duration {
	if base <= 0 {
		base = appleAccountKeepAliveDefaultInterval
	}
	jitter := base / 5
	if jitter > time.Minute {
		jitter = time.Minute
	}
	if jitter < time.Second {
		return base
	}
	steps := int64(jitter / time.Second)
	if steps <= 0 {
		return base
	}
	h := fnv.New32a()
	_, _ = io.WriteString(h, strings.TrimSpace(session.OwnerID)+"|"+strings.TrimSpace(session.AccountID)+"|"+strings.ToLower(strings.TrimSpace(session.AppleID)))
	offsetSteps := int64(h.Sum32()%uint32(steps*2+1)) - steps
	next := base + time.Duration(offsetSteps)*time.Second
	if base >= time.Minute && next < 30*time.Second {
		return 30 * time.Second
	}
	return next
}
