package service

import (
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
//  2. Cabin write OK, pool delete fails → dual presence; return nil but record
//     quarantine_remove_pending; ReconcileQuarantinePool on startup removes pool copy
//     (cabin is authority once durable). Token is never lost.
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
	// Cabin durable (or not configured): leave active pool.
	if s.forceRemoveUnavailableAccount(accessToken, event, reason) {
		return nil
	}
	if path == "" {
		return nil
	}
	// RemoveToken false: already absent, or pool save rolled back (still present).
	if s.GetAccount(accessToken) == nil {
		return nil
	}
	// One retry for transient save errors.
	if s.forceRemoveUnavailableAccount(accessToken, event, reason) {
		return nil
	}
	if s.GetAccount(accessToken) == nil {
		return nil
	}
	// Dual presence: cabin has the token; pool still schedules it until reconcile.
	s.recordPoolOp(PoolOpQuarantineRemovePending, 1)
	if s.logs != nil {
		s.logs.Add("隔离仓已写入，号池移除待协调", map[string]any{
			"module":         "accounts",
			"operation_type": "隔离协调",
			"source":         event,
			"reason":         truncateReason(reason, 200),
			"token":          util.AnonymizeToken(accessToken),
		})
	}
	return nil
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
	s.quarantineMu.Lock()
	list, loadErr := s.loadQuarantineLockedStrict(path)
	if loadErr != nil {
		s.quarantineMu.Unlock()
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
		s.quarantineMu.Unlock()
		return map[string]any{"restored": false, "error": "not found"}
	}
	// Keep cabin row until pool re-import succeeds (avoid cabin-drop-without-pool).
	cabinOK := append([]quarantineEntry(nil), list...)
	if err := s.saveQuarantineLocked(path, remain); err != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"restored": false, "error": err.Error()}
	}
	s.quarantineMu.Unlock()

	result := s.AddAccounts([]string{found.AccessToken})
	// Prefer durable re-import: on pool save failure put cabin row back (cabin was authority).
	if errText, _ := result["error"].(string); strings.TrimSpace(errText) != "" {
		rollbackErr := s.restoreQuarantineSnapshot(path, cabinOK)
		if rollbackErr != nil {
			errText += "；回滚隔离仓失败: " + rollbackErr.Error()
		}
		return map[string]any{"restored": false, "error": errText, "add": result}
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
