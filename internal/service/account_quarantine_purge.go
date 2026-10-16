package service

import (
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

// PurgeQuarantine removes a cabin row by token_hash without re-importing to the pool.
// permanentOnly restricts purge to grade=permanent (admin permanent cabin delete).
// If the token still exists in the active pool (dual presence), it is removed from the pool.
func (s *AccountService) PurgeQuarantine(tokenHash string, permanentOnly bool) map[string]any {
	tokenHash = strings.TrimSpace(tokenHash)
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" || tokenHash == "" {
		return map[string]any{"purged": false, "error": "not found"}
	}
	s.quarantineMu.Lock()
	list, loadErr := s.loadQuarantineLockedStrict(path)
	if loadErr != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"purged": false, "error": loadErr.Error()}
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
	if found == nil {
		s.quarantineMu.Unlock()
		return map[string]any{"purged": false, "error": "not found"}
	}
	grade := strings.TrimSpace(found.Grade)
	if permanentOnly && grade != string(DisposalPermanent) {
		s.quarantineMu.Unlock()
		return map[string]any{
			"purged":     false,
			"error":      "仅永久隔离账号可从此处删除",
			"grade":      grade,
			"token_hash": found.TokenHash,
			"email":      found.Email,
		}
	}
	if err := s.saveQuarantineLocked(path, remain); err != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"purged": false, "error": err.Error()}
	}
	s.quarantineMu.Unlock()

	// Dual presence: drop from active pool if still present.
	if tok := util.Clean(found.AccessToken); tok != "" && s.GetAccount(tok) != nil {
		if err := s.removePoolTokenForQuarantine(tok); err != nil {
			rollbackErr := s.restoreQuarantineSnapshot(path, list)
			message := err.Error()
			if rollbackErr != nil {
				message += "；回滚隔离仓失败: " + rollbackErr.Error()
			}
			return map[string]any{"purged": false, "error": message, "token_hash": found.TokenHash, "grade": grade}
		}
	}
	if grade == string(DisposalPermanent) {
		s.recordPoolOp(PoolOpQuarantinePurgedPermanent, 1)
	}
	if s.logs != nil {
		s.logs.Add("隔离仓账号已删除", map[string]any{
			"module":         "accounts",
			"operation_type": "隔离删除",
			"email":          found.Email,
			"grade":          grade,
			"token":          util.AnonymizeToken(found.AccessToken),
			"token_hash":     found.TokenHash,
		})
	}
	return map[string]any{
		"purged":     true,
		"email":      found.Email,
		"token_hash": found.TokenHash,
		"grade":      grade,
	}
}

// PurgePermanentQuarantineAll removes all permanent cabin rows without
// re-importing them. The cabin is updated once before active-pool cleanup;
// failures are restored to the cabin so they remain visible and retryable.
func (s *AccountService) PurgePermanentQuarantineAll() map[string]any {
	if s == nil {
		return map[string]any{"requested": 0, "purged": 0, "failed": 0}
	}
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" {
		return map[string]any{"requested": 0, "purged": 0, "failed": 0, "errors": []string{"账号隔离仓未配置"}}
	}
	s.quarantineMu.Lock()
	list, loadErr := s.loadQuarantineLockedStrict(path)
	if loadErr != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"requested": 0, "purged": 0, "failed": 0, "errors": []string{loadErr.Error()}}
	}
	requested := 0
	permanent := make([]quarantineEntry, 0)
	remain := make([]quarantineEntry, 0, len(list))
	for _, entry := range list {
		if strings.TrimSpace(entry.Grade) == string(DisposalPermanent) {
			permanent = append(permanent, entry)
			requested++
		} else {
			remain = append(remain, entry)
		}
	}
	if requested == 0 {
		s.quarantineMu.Unlock()
		return map[string]any{"requested": 0, "purged": 0, "failed": 0}
	}
	if err := s.saveQuarantineLocked(path, remain); err != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"requested": requested, "purged": 0, "failed": requested, "errors": []string{err.Error()}}
	}
	s.quarantineMu.Unlock()

	activeTokens := make([]string, 0, len(permanent))
	for _, entry := range permanent {
		token := util.Clean(entry.AccessToken)
		if token != "" && s.GetAccount(token) != nil {
			activeTokens = append(activeTokens, token)
		}
	}
	errors := make([]string, 0)
	if len(activeTokens) > 0 {
		deleteResult := s.DeleteAccounts(activeTokens)
		if message := strings.TrimSpace(util.Clean(deleteResult["error"])); message != "" {
			errors = append(errors, truncateReason(message, 300))
		}
		if removed := util.ToInt(deleteResult["removed"], 0); removed != len(activeTokens) {
			errors = append(errors, fmt.Sprintf("号池批量删除数量不一致：已删除 %d/%d", removed, len(activeTokens)))
		}
	}
	purged := requested
	if len(errors) > 0 {
		purged = 0
	}
	failedEntries := permanent
	if purged > 0 {
		failedEntries = nil
	}
	failedByKey := make(map[string]quarantineEntry, len(failedEntries))
	for _, entry := range failedEntries {
		failedByKey[quarantineEntryKey(entry)] = entry
	}
	targetKeys := make(map[string]struct{}, len(permanent))
	for _, entry := range permanent {
		targetKeys[quarantineEntryKey(entry)] = struct{}{}
	}
	s.quarantineMu.Lock()
	current, currentErr := s.loadQuarantineLockedStrict(path)
	if currentErr != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"requested": requested, "purged": 0, "failed": requested, "errors": []string{currentErr.Error()}}
	}
	remain = make([]quarantineEntry, 0, len(current)+len(failedEntries))
	for _, entry := range current {
		key := quarantineEntryKey(entry)
		if strings.TrimSpace(entry.Grade) != string(DisposalPermanent) {
			remain = append(remain, entry)
			continue
		}
		if _, targeted := targetKeys[key]; !targeted {
			remain = append(remain, entry)
			continue
		}
		if failed, ok := failedByKey[key]; ok {
			remain = append(remain, failed)
			delete(failedByKey, key)
		}
	}
	for _, entry := range failedByKey {
		remain = append(remain, entry)
	}
	if err := s.saveQuarantineLocked(path, remain); err != nil {
		s.quarantineMu.Unlock()
		return map[string]any{"requested": requested, "purged": 0, "failed": requested, "errors": []string{err.Error()}}
	}
	s.quarantineMu.Unlock()
	failed := requested - purged
	if purged > 0 {
		s.recordPoolOp(PoolOpQuarantinePurgedPermanent, purged)
		if s.logs != nil {
			s.logs.Add("批量删除永久隔离账号", map[string]any{"module": "accounts", "operation_type": "隔离批量删除", "purged": purged, "failed": failed})
		}
	}
	result := map[string]any{"requested": requested, "purged": purged, "failed": failed}
	if len(errors) > 0 {
		result["errors"] = errors
	}
	return result
}

func quarantineEntryKey(entry quarantineEntry) string {
	if hash := strings.TrimSpace(entry.TokenHash); hash != "" {
		return hash
	}
	return shortTokenHash(entry.AccessToken)
}
