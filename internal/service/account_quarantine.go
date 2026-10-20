package service

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"chatgpt2api/internal/util"
)

const (
	quarantineFileName = "account_quarantine.json"
	// defaultQuarantineMaxEntries caps cabin size so list/restore stay predictable.
	// Raised from 500 → 2000; override with CHATGPT2API_QUARANTINE_MAX_ENTRIES.
	defaultQuarantineMaxEntries = 2000
	minQuarantineMaxEntries     = 1
	maxQuarantineMaxEntries     = 10000
	// Cap auto-restore probes per refresh cycle (newest temporary first).
	maxTemporaryRestoreProbesPerCycle = 50
)

type quarantineEntry struct {
	AccessToken string         `json:"access_token"`
	Email       string         `json:"email"`
	TokenHash   string         `json:"token_hash"`
	Reason      string         `json:"reason"`
	Source      string         `json:"source"`
	Grade       string         `json:"grade"`
	RemovedAt   string         `json:"removed_at"`
	Snapshot    map[string]any `json:"snapshot,omitempty"`
}

func resolveQuarantineMaxEntries() int {
	raw := strings.TrimSpace(os.Getenv("CHATGPT2API_QUARANTINE_MAX_ENTRIES"))
	if raw == "" {
		return defaultQuarantineMaxEntries
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return defaultQuarantineMaxEntries
	}
	if n < minQuarantineMaxEntries {
		return minQuarantineMaxEntries
	}
	if n > maxQuarantineMaxEntries {
		return maxQuarantineMaxEntries
	}
	return n
}

func (s *AccountService) quarantineMax() int {
	if s != nil && s.quarantineMaxEntries > 0 {
		return s.quarantineMaxEntries
	}
	return resolveQuarantineMaxEntries()
}

// quarantineThenRemove writes the isolation cabin first, then removes the token from the pool.
//
// Consistency model (no cross-file DB transaction on JSON storage):
//  1. Cabin write fails → account stays in pool (return error). Safe.
//  2. Cabin write OK, pool delete fails → dual presence. The cabin (durable) is the
//     authority, so the token can never be lost, but it is still schedulable; return an
//     error so the caller stops reporting "quarantined" and degrades the row
//     (限流/异常) itself. ReconcileQuarantinePool (startup + watcher cycle) removes the
//     pool copy once storage recovers.
//  3. Both OK → clean. Cabin AtomicWriteFile is fsync'd before rename.
func (s *AccountService) quarantineThenRemove(accessToken, event, reason string, grade DisposalGrade) error {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return nil
	}
	s.mu.Lock()
	var snap map[string]any
	if idx := s.findIndexLocked(accessToken); idx >= 0 {
		snap = s.items[idx].toMap()
	}
	path := s.quarantinePath
	s.mu.Unlock()

	if path != "" {
		email := ""
		if snap != nil {
			email = util.Clean(snap["email"])
		}
		entry := quarantineEntry{
			AccessToken: accessToken,
			Email:       email,
			TokenHash:   shortTokenHash(accessToken),
			Reason:      truncateReason(reason, 300),
			Source:      event,
			Grade:       string(grade),
			RemovedAt:   util.NowLocal(),
			Snapshot:    redactAccountSnapshot(snap),
		}
		if err := s.appendQuarantine(path, entry); err != nil {
			if s.logs != nil {
				s.logs.Add("隔离舱写入失败，账号仍在号池", map[string]any{
					"module":         "accounts",
					"operation_type": "隔离失败",
					"source":         event,
					"reason":         truncateReason(err.Error(), 200),
					"token":          util.AnonymizeToken(accessToken),
				})
			}
			return err
		}
	}
	// Cabin durable (or not configured): drop the active pool copy so it is not scheduled.
	if s.forceRemoveUnavailableAccount(accessToken, event, reason) || s.GetAccount(accessToken) == nil {
		return nil
	}
	// One retry for transient save errors.
	if s.forceRemoveUnavailableAccount(accessToken, event, reason) || s.GetAccount(accessToken) == nil {
		return nil
	}
	// Dual presence: the token is still schedulable. Report the failure instead of
	// claiming a quarantine that did not happen; the caller degrades the row and the
	// runtime reconciler retries the pool removal.
	s.recordPoolOp(PoolOpQuarantineRemovePending, 1)
	detail := "号池移除失败，账号仍在号池中可被调度"
	if path == "" {
		detail = "隔离仓未配置且号池移除失败，账号仍可被调度"
	}
	if s.logs != nil {
		s.logs.Add("隔离仓已写入，号池移除待协调", map[string]any{
			"module":         "accounts",
			"operation_type": "隔离协调",
			"source":         event,
			"reason":         truncateReason(reason, 200),
			"token":          util.AnonymizeToken(accessToken),
		})
	}
	return fmt.Errorf("隔离 %s: %s: %s", shortTokenHash(accessToken), detail, truncateReason(reason, 120))
}

func redactAccountSnapshot(snap map[string]any) map[string]any {
	if snap == nil {
		return nil
	}
	out := util.CopyMap(snap)
	// Keep token in quarantine entry root for restore; strip from nested snapshot noise.
	delete(out, "access_token")
	return out
}

// ListQuarantine returns quarantined accounts (token redacted in view unless includeToken).
func (s *AccountService) ListQuarantine() []map[string]any {
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" {
		return []map[string]any{}
	}
	s.quarantineMu.Lock()
	list := s.loadQuarantineLocked(path)
	s.quarantineMu.Unlock()
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		out = append(out, map[string]any{
			"email":      item.Email,
			"token_hash": item.TokenHash,
			"reason":     item.Reason,
			"source":     item.Source,
			"grade":      item.Grade,
			"removed_at": item.RemovedAt,
			"has_token":  item.AccessToken != "",
		})
	}
	return out
}

// QuarantineStats returns cabin size vs configured cap (for pool health / ops).
func (s *AccountService) QuarantineStats() (count, max int) {
	max = s.quarantineMax()
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" {
		return 0, max
	}
	s.quarantineMu.Lock()
	list := s.loadQuarantineLocked(path)
	s.quarantineMu.Unlock()
	return len(list), max
}

// RestoreQuarantine puts a quarantined token back into the pool by token_hash.
// Counts as manual_restored (admin / API). Auto-restore uses RestoreQuarantineAuto.
func (s *AccountService) RestoreQuarantine(tokenHash string) map[string]any {
	return s.restoreQuarantine(tokenHash, PoolOpManualRestored)
}

// RestoreQuarantineAuto is the isolation-cabin auto-probe path (metrics only differ).
func (s *AccountService) RestoreQuarantineAuto(tokenHash string) map[string]any {
	return s.restoreQuarantine(tokenHash, PoolOpAutoRestoredTemporary)
}

func (s *AccountService) restoreQuarantine(tokenHash, metricOp string) map[string]any {
	tokenHash = strings.TrimSpace(tokenHash)
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" || tokenHash == "" {
		return map[string]any{"restored": false, "error": "not found"}
	}
	// Hold the cabin lock across re-import and row removal: the row is the only
	// remaining copy, and two concurrent restores of the same token must not both
	// re-import it or interleave cabin writes.
	s.quarantineMu.Lock()
	defer s.quarantineMu.Unlock()
	list, loadErr := s.loadQuarantineLockedStrict(path)
	if loadErr != nil {
		return map[string]any{"restored": false, "error": loadErr.Error()}
	}
	var found *quarantineEntry
	remain := make([]quarantineEntry, 0, len(list))
	for i := range list {
		if list[i].TokenHash == tokenHash || shortTokenHash(list[i].AccessToken) == tokenHash {
			cp := list[i]
			found = &cp
			continue
		}
		remain = append(remain, list[i])
	}
	if found == nil || found.AccessToken == "" {
		return map[string]any{"restored": false, "error": "not found"}
	}
	// Pool first: only drop the cabin row once the pool write is durable, otherwise a
	// crash in between leaves the token in neither store and it is lost for good.
	result := s.AddAccounts([]string{found.AccessToken})
	if errText, _ := result["error"].(string); strings.TrimSpace(errText) != "" {
		return map[string]any{"restored": false, "error": errText, "add": result}
	}
	if err := s.saveQuarantineLocked(path, remain); err != nil {
		// Cabin row stays; undo the pool import so the token is not in both stores.
		rollback := s.DeleteAccounts([]string{found.AccessToken})
		if message := strings.TrimSpace(util.Clean(rollback["error"])); message != "" || util.ToInt(rollback["removed"], 0) == 0 {
			return map[string]any{
				"restored": true, "add": result, "email": found.Email, "token_hash": found.TokenHash,
				"error": "隔离仓记录删除失败，账号已回号池并同时留在隔离仓，待运行期协调: " + err.Error(),
			}
		}
		return map[string]any{"restored": false, "error": "删除隔离仓记录失败，已回滚号池导入: " + err.Error(), "add": result}
	}
	if metricOp != "" {
		s.recordPoolOp(metricOp, 1)
	}
	return map[string]any{"restored": true, "add": result, "email": found.Email, "token_hash": found.TokenHash}
}

// temporaryQuarantineForProbe returns up to maxTemporaryRestoreProbesPerCycle temporary
// entries (newest first) for one auto-restore cycle — bounds remote probe cost.
func (s *AccountService) temporaryQuarantineForProbe() []quarantineEntry {
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" {
		return nil
	}
	s.quarantineMu.Lock()
	list := s.loadQuarantineLocked(path)
	s.quarantineMu.Unlock()
	out := make([]quarantineEntry, 0, maxTemporaryRestoreProbesPerCycle)
	for _, entry := range list {
		if entry.AccessToken == "" {
			continue
		}
		if entry.Grade != string(DisposalTemporary) {
			continue
		}
		out = append(out, entry)
		if len(out) >= maxTemporaryRestoreProbesPerCycle {
			break
		}
	}
	return out
}
