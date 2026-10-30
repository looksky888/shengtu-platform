package service

import (
	"context"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// DisposalGrade classifies how an unusable account should be handled.
type DisposalGrade string

const (
	DisposalPermanent DisposalGrade = "permanent" // delete from pool
	DisposalTemporary DisposalGrade = "temporary" // cooldown / rate-limit, keep
	DisposalUnknown   DisposalGrade = "unknown"   // soft fail; cooldown only
	DisposalNone      DisposalGrade = "none"
)

// DisposeAction is the outcome of disposeAccount (metrics, UI, task events).
type DisposeAction string

const (
	DisposeNone                 DisposeAction = ""
	DisposeDeletedPermanent     DisposeAction = "deleted_permanent"
	DisposeMarkedInvalid        DisposeAction = "marked_invalid"
	DisposeQuarantineWriteFail  DisposeAction = "quarantine_write_failed"
	DisposeRefreshRecovered     DisposeAction = "refresh_recovered"
	DisposeQuarantinedTemporary DisposeAction = "quarantined_temporary"
	DisposeCooledTemporary      DisposeAction = "cooled_temporary"
	DisposeSoftFailUnknown      DisposeAction = "soft_fail_unknown"
	// DisposePersistFailed marks a dispose whose status write failed: the row kept its
	// old status (the pool save was rolled back) and is still schedulable, so the
	// outcome must not be reported as 已冷却 / 已标记异常.
	DisposePersistFailed DisposeAction = "persist_failed"
)

const defaultUnknownCooldown = 2 * time.Minute

// ClassifyAccountFailure grades an error for disposal policy.
//
// Kind priority (after empty/bootstrap → none):
//  1. dead_token / acquire-class permanent 401  → permanent
//  2. rate_limit / cloudflare                 → temporary
//  3. timeout / gateway / network_flaky       → unknown
//  4. residual 401 (non-stream)               → permanent; image_stream 401 → none
//  5. default                                 → unknown
//
// Phrase tables live in upstream_signals.go (upstreamSignalRules).
func ClassifyAccountFailure(event, message string) DisposalGrade {
	message = strings.TrimSpace(message)
	if message == "" || isBootstrapErrorMessage(message) || IsSentinelSolverSignal(message) {
		return DisposalNone
	}
	if IsDeadTokenSignal(message) {
		return DisposalPermanent
	}
	// Acquire/refresh 401 → permanent grade (hard-delete still gated by AutoRemoveInvalidAccounts).
	// Image stream non-explicit 401 is often transient session noise → ignore.
	if event == "image_acquire" || event == "refresh_account_state" || event == "refresh_accounts" {
		if shouldForceRemoveOnAcquire(message) {
			return DisposalPermanent
		}
	} else if isPermanentAccountInvalidForEvent(event, message) {
		return DisposalPermanent
	}
	// Transport failures take precedence when a wrapped error also contains
	// generic quota wording; they must not be reported as a rate limit.
	if IsUpstreamRateLimitSignal(message) || IsCloudflareSignal(message) {
		return DisposalTemporary
	}
	if IsNetworkFlakySignal(message) {
		return DisposalUnknown
	}
	if IsUpstreamAccountQuotaSignal(message) {
		return DisposalTemporary
	}
	if hasAccountHTTPStatus(message, 401) || hasHTTPStatus(message, 401) {
		if event == "image_stream" {
			return DisposalNone
		}
		return DisposalPermanent
	}
	return DisposalUnknown
}

// disposeAccount applies graded policy. Returns action for events / user messaging.
//
// Permanent delete policy:
//   - explicit dead token (expired/invalidated/revoked): probe once via FetchRemoteInfo;
//     if still dead → always hard-delete + quarantine (regardless of auto-remove toggle)
//   - other permanent grades → delete only when AutoRemoveInvalidAccounts is on;
//     otherwise mark 异常 so the account leaves the image pool without hard delete
//
// Unknown (timeout / network): cooldown only — never quarantine. Isolation cabin
// auto-restore may still re-probe existing temporary entries.
func (s *AccountService) disposeAccount(accessToken, event, reason string, grade DisposalGrade) DisposeAction {
	accessToken = util.Clean(accessToken)
	if accessToken == "" || grade == DisposalNone {
		return DisposeNone
	}
	switch grade {
	case DisposalPermanent:
		return s.disposePermanent(accessToken, event, reason)
	case DisposalTemporary:
		// Rate-limit / quota exhaustion: leave active pool into isolation cabin so they
		// are not scheduled again until auto-restore (or manual restore) succeeds.
		if s.quarantineTemporaryAccount(accessToken, event, reason) {
			return DisposeQuarantinedTemporary
		}
		// Fallback if the cabin / pool removal failed: mark 限流 so isImageAvailable skips
		// them, plus an in-memory cooldown for this process. Only claim 已冷却 when the
		// status write is durable.
		s.setImageCooldown(accessToken, defaultUnknownCooldown)
		if err := s.markAccountLimited(accessToken); err != nil {
			s.recordPoolOp(string(DisposePersistFailed), 1)
			s.logDisposePersistFailure(accessToken, event, err)
			return DisposePersistFailed
		}
		s.recordPoolOp(string(DisposeCooledTemporary), 1)
		return DisposeCooledTemporary
	case DisposalUnknown:
		// Network / timeout / flaky upstream: cool down only. Do not quarantine.
		s.setImageCooldown(accessToken, defaultUnknownCooldown)
		s.recordPoolOp(string(DisposeSoftFailUnknown), 1)
		return DisposeSoftFailUnknown
	default:
		return DisposeNone
	}
}

func (s *AccountService) disposePermanent(accessToken, event, reason string) DisposeAction {
	// Explicit dead session: refresh-once confirm, then cleanup.
	if IsDeadTokenSignal(reason) {
		if s.tryRecoverDeadTokenByRefresh(accessToken) {
			s.recordPoolOp(string(DisposeRefreshRecovered), 1)
			return DisposeRefreshRecovered
		}
		return s.hardDeleteOrMarkInvalid(accessToken, event, reason, true)
	}
	return s.hardDeleteOrMarkInvalid(accessToken, event, reason, s.shouldHardDeletePermanent())
}

// hardDeleteOrMarkInvalid is the single permanent executor: quarantine-then-remove or mark 异常.
func (s *AccountService) hardDeleteOrMarkInvalid(accessToken, event, reason string, forceDelete bool) DisposeAction {
	if forceDelete {
		if err := s.quarantineThenRemove(accessToken, event, reason, DisposalPermanent); err != nil {
			// Cabin write failed: keep token in pool, mark 异常 so it leaves image scheduling.
			if markErr := s.markAccountInvalid(accessToken); markErr != nil {
				s.recordPoolOp(string(DisposePersistFailed), 1)
				s.logDisposePersistFailure(accessToken, event, markErr)
				return DisposePersistFailed
			}
			s.recordPoolOp(string(DisposeQuarantineWriteFail), 1)
			return DisposeQuarantineWriteFail
		}
		s.recordPoolOp(string(DisposeDeletedPermanent), 1)
		return DisposeDeletedPermanent
	}
	if err := s.markAccountInvalid(accessToken); err != nil {
		s.recordPoolOp(string(DisposePersistFailed), 1)
		s.logDisposePersistFailure(accessToken, event, err)
		return DisposePersistFailed
	}
	s.recordPoolOp(string(DisposeMarkedInvalid), 1)
	return DisposeMarkedInvalid
}

// markAccountLimited takes the account out of image scheduling by status (persisted).
func (s *AccountService) markAccountLimited(accessToken string) error {
	_, err := s.UpdateAccount(accessToken, map[string]any{"status": "限流", "quota": 0, "image_quota_unknown": false})
	return err
}

// markAccountInvalid takes the account out of image scheduling by status (persisted).
func (s *AccountService) markAccountInvalid(accessToken string) error {
	_, err := s.UpdateAccount(accessToken, map[string]any{"status": "异常", "quota": 0, "image_quota_unknown": false})
	return err
}

// logDisposePersistFailure records a dispose that could not persist its status change.
func (s *AccountService) logDisposePersistFailure(accessToken, event string, err error) {
	if s.logs == nil || err == nil {
		return
	}
	s.logs.Add("账号状态保存失败，处置未生效", map[string]any{
		"module":         "accounts",
		"operation_type": "处置失败",
		"source":         event,
		"reason":         truncateReason(err.Error(), 200),
		"token":          util.AnonymizeToken(accessToken),
	})
}

func (s *AccountService) setImageCooldown(accessToken string, d time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageCooldownsLocked()
	s.imageCooldownUntil[accessToken] = time.Now().Add(d)
}

// tryRecoverDeadTokenByRefresh probes ChatGPT once without re-entering dispose
// (uses FetchRemoteInfo only — never ApplyAccountError). Returns true if the
// token looks usable again and the pool row was updated.
func (s *AccountService) tryRecoverDeadTokenByRefresh(accessToken string) bool {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	remote, err := s.FetchRemoteInfo(ctx, accessToken)
	if err != nil || remote == nil {
		return false
	}
	// Reject if remote still signals dead session in body strings.
	blob := util.Clean(remote["error"]) + " " + util.Clean(remote["message"])
	if IsDeadTokenSignal(blob) {
		return false
	}
	item, err := s.UpdateAccount(accessToken, remote)
	if err != nil || item == nil {
		return false
	}
	// Prefer keeping usable status for image pool.
	if util.Clean(item["status"]) == "异常" || util.Clean(item["status"]) == "禁用" {
		_, _ = s.UpdateAccount(accessToken, map[string]any{"status": "正常"})
	}
	s.mu.Lock()
	if s.imageCooldownUntil != nil {
		delete(s.imageCooldownUntil, accessToken)
	}
	s.mu.Unlock()
	if s.logs != nil {
		s.logs.Add("疑似死号刷新后恢复", map[string]any{
			"module":         "accounts",
			"operation_type": "刷新恢复",
			"token":          util.AnonymizeToken(accessToken),
		})
	}
	return true
}

func (s *AccountService) shouldHardDeletePermanent() bool {
	// Unified with settings toggle "自动移除异常账号".
	// When off: mark 异常 only (account leaves image pool via IsImageAccountAvailable).
	// When on: delete + quarantine so ops can restore from isolation cabin.
	// Note: explicit dead tokens (token_expired etc.) bypass this via disposePermanent.
	return s.autoRemoveInvalidAccounts()
}

func (s *AccountService) recordPoolOp(kind string, delta int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recordPoolOpLocked(kind, delta)
}

func (s *AccountService) recordPoolOpLocked(kind string, delta int) {
	day := util.ChinaDate()
	if s.poolOpDay != day {
		s.poolOpDay = day
		s.poolOpCounts = map[string]int{}
	}
	if s.poolOpCounts == nil {
		s.poolOpCounts = map[string]int{}
	}
	if kind == "" || delta == 0 {
		return
	}
	// Normalize legacy alias used briefly for permanent recover path.
	if kind == "refresh_recovered_permanent" {
		kind = string(DisposeRefreshRecovered)
	}
	s.poolOpCounts[kind] += delta
}

// PoolOpCount names for restore / consistency paths (not DisposeAction outcomes).
const (
	PoolOpAutoRestoredTemporary      = "auto_restored_temporary"
	PoolOpManualRestored             = "manual_restored"
	PoolOpQuarantineRemovePending    = "quarantine_remove_pending"
	PoolOpQuarantineReconcileRemoved = "quarantine_reconcile_removed"
	PoolOpQuarantinePurgedPermanent  = "quarantine_purged_permanent"
)

// quarantineTemporaryAccount writes isolation cabin first, then leaves the active pool.
func (s *AccountService) quarantineTemporaryAccount(accessToken, event, reason string) bool {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return false
	}
	if err := s.quarantineThenRemove(accessToken, event, reason, DisposalTemporary); err != nil {
		return false
	}
	s.recordPoolOp(string(DisposeQuarantinedTemporary), 1)
	if s.logs != nil {
		s.logs.Add("账号进入隔离仓（额度/限流）", map[string]any{
			"module":         "accounts",
			"operation_type": "隔离",
			"source":         event,
			"reason":         truncateReason(reason, 200),
			"token":          util.AnonymizeToken(accessToken),
		})
	}
	return true
}
