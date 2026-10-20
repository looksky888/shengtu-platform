package service

import (
	"fmt"

	"chatgpt2api/internal/util"
)

func (s *AccountService) AddAccounts(tokens []string) map[string]any {
	cleaned := cleanTokens(tokens)
	if len(cleaned) == 0 {
		return map[string]any{"added": 0, "skipped": 0, "items": s.ListAccounts()}
	}
	s.mu.Lock()
	previous := append([]Account(nil), s.items...)
	indexed := map[string]Account{}
	order := make([]string, 0, len(s.items)+len(cleaned))
	for _, item := range s.items {
		token := util.Clean(item.AccessToken)
		if token == "" {
			continue
		}
		indexed[token] = item
		order = append(order, token)
	}
	added, skipped := 0, 0
	for _, token := range cleaned {
		current, ok := indexed[token]
		if ok {
			skipped++
		} else {
			added++
			current = Account{}
			order = append(order, token)
		}
		merged := mergeMaps(current.toMap(), map[string]any{"access_token": token, "type": firstNonEmpty(current.Type, "Free")})
		if acc, ok := accountFromMap(merged); ok {
			indexed[token] = acc
		}
	}
	next := make([]Account, 0, len(order))
	seen := map[string]struct{}{}
	for _, token := range order {
		if _, ok := seen[token]; ok {
			continue
		}
		seen[token] = struct{}{}
		next = append(next, indexed[token])
	}
	s.items = next
	// Row upsert avoids rewriting the whole pool when only adding/updating listed tokens.
	saveErr := s.saveAccountsUpsertLocked(cleaned)
	if saveErr != nil {
		s.items = previous
		items := publicAccounts(s.items)
		s.mu.Unlock()
		return map[string]any{"added": 0, "skipped": skipped, "items": items, "error": saveErr.Error()}
	}
	items := publicAccounts(s.items)
	s.mu.Unlock()
	s.logs.Add(fmt.Sprintf("新增 %d 个账号，跳过 %d 个", added, skipped), map[string]any{
		"module":         "accounts",
		"operation_type": "新增",
		"added":          added,
		"skipped":        skipped,
	})
	return map[string]any{"added": added, "skipped": skipped, "items": items}
}

func (s *AccountService) DeleteAccounts(tokens []string) map[string]any {
	targets := map[string]struct{}{}
	for _, token := range cleanTokens(tokens) {
		targets[token] = struct{}{}
	}
	if len(targets) == 0 {
		return map[string]any{"removed": 0, "items": s.ListAccounts()}
	}
	s.mu.Lock()
	prevItems := append([]Account(nil), s.items...)
	prevIndex := s.index
	prevReservations := cloneStringIntMap(s.imageReservations)
	prevCooldown := cloneStringTimeMap(s.imageCooldownUntil)
	prevProbes := cloneStringTimeMap(s.imageProbeAt)
	next := make([]Account, 0, len(s.items))
	removed := 0
	for _, item := range s.items {
		token := util.Clean(item.AccessToken)
		if _, ok := targets[token]; ok {
			removed++
			delete(s.imageReservations, token)
			delete(s.imageCooldownUntil, token)
			delete(s.imageProbeAt, token)
			continue
		}
		next = append(next, item)
	}
	s.items = next
	if len(s.items) > 0 {
		s.index %= len(s.items)
	} else {
		s.index = 0
	}
	var saveErr error
	if removed > 0 {
		// Prefer per-row deletes so remaining accounts are not rewritten.
		toDelete := make([]string, 0, len(targets))
		for token := range targets {
			toDelete = append(toDelete, token)
		}
		saveErr = s.deleteAccountsRowLocked(toDelete)
		if saveErr != nil {
			s.items = prevItems
			s.index = prevIndex
			s.imageReservations = prevReservations
			s.imageCooldownUntil = prevCooldown
			s.imageProbeAt = prevProbes
			items := publicAccounts(s.items)
			s.mu.Unlock()
			return map[string]any{"removed": 0, "items": items, "error": saveErr.Error()}
		}
	}
	items := publicAccounts(s.items)
	s.mu.Unlock()
	if removed > 0 {
		s.logs.Add(fmt.Sprintf("删除 %d 个账号", removed), map[string]any{
			"module":         "accounts",
			"operation_type": "删除",
			"removed":        removed,
		})
	}
	return map[string]any{"removed": removed, "items": items}
}

func (s *AccountService) RemoveToken(token string) bool {
	return util.ToInt(s.DeleteAccounts([]string{token})["removed"], 0) > 0
}

func (s *AccountService) UpdateAccount(accessToken string, updates map[string]any) (map[string]any, error) {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return nil, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := s.findIndexLocked(accessToken)
	if idx < 0 {
		return nil, nil
	}
	account, ok := accountFromMap(mergeMaps(s.items[idx].toMap(), updates, map[string]any{"access_token": accessToken}))
	if !ok {
		return nil, nil
	}
	if account.Status == "限流" && s.autoRemoveRateLimitedAccounts() {
		prevItems := append([]Account(nil), s.items...)
		prevReservations := cloneStringIntMap(s.imageReservations)
		prevCooldown := cloneStringTimeMap(s.imageCooldownUntil)
		prevProbes := cloneStringTimeMap(s.imageProbeAt)
		delete(s.imageReservations, accessToken)
		delete(s.imageCooldownUntil, accessToken)
		delete(s.imageProbeAt, accessToken)
		s.items = append(s.items[:idx], s.items[idx+1:]...)
		if err := s.deleteAccountsRowLocked([]string{accessToken}); err != nil {
			s.items = prevItems
			s.imageReservations = prevReservations
			s.imageCooldownUntil = prevCooldown
			s.imageProbeAt = prevProbes
			return nil, fmt.Errorf("保存账号失败: %w", err)
		}
		s.logs.Add("自动移除限流账号", map[string]any{
			"module":         "accounts",
			"operation_type": "自动移除",
			"token":          util.AnonymizeToken(accessToken),
		})
		return nil, nil
	}
	prev := s.items[idx]
	s.items[idx] = account
	delete(s.imageProbeAt, accessToken)
	if err := s.saveAccountLocked(accessToken); err != nil {
		s.items[idx] = prev
		return nil, fmt.Errorf("保存账号失败: %w", err)
	}
	s.logs.Add("更新账号", map[string]any{
		"module":         "accounts",
		"operation_type": "更新",
		"token":          util.AnonymizeToken(accessToken),
		"status":         account.Status,
	})
	return account.toMap(), nil
}

func (s *AccountService) GetAccount(accessToken string) map[string]any {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := s.findIndexLocked(accessToken)
	if idx < 0 {
		return nil
	}
	return s.items[idx].toMap()
}
