package service

import (
	"fmt"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (s *AccountService) StoreReady() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.storeReady
}

func (s *AccountService) ListTokens() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.items))
	for _, item := range s.items {
		if token := util.Clean(item.AccessToken); token != "" {
			out = append(out, token)
		}
	}
	return out
}

func (s *AccountService) ListTokensByIDs(ids []string) []string {
	targets := cleanAccountIDs(ids)
	if len(targets) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(targets))
	for _, item := range s.items {
		token := util.Clean(item.AccessToken)
		if token == "" {
			continue
		}
		if _, ok := targets[accountIDFromToken(token)]; ok {
			out = append(out, token)
		}
	}
	return out
}

func (s *AccountService) GetTokenByID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.items {
		token := util.Clean(item.AccessToken)
		if token != "" && accountIDFromToken(token) == id {
			return token
		}
	}
	return ""
}

func (s *AccountService) ListAccounts() []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return publicAccounts(s.items)
}

// PoolHealthSnapshot aggregates account-pool availability for dashboards/alerts.
// Codes align with image-proxy style observability (no_quota / rate_limited / invalid).
func (s *AccountService) PoolHealthSnapshot() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureImageReservationsLocked()
	s.reclaimExpiredLeasesLocked(time.Now())
	total := 0
	available := 0
	freeSlots := 0
	rateLimited := 0
	invalid := 0
	disabled := 0
	paid := 0
	unknownQuota := 0
	byStatus := map[string]int{}
	for _, item := range s.items {
		if util.Clean(item.AccessToken) == "" {
			continue
		}
		total++
		status := firstNonEmpty(util.Clean(item.Status), "正常")
		byStatus[status]++
		switch status {
		case "限流":
			rateLimited++
		case "异常":
			invalid++
		case "禁用":
			disabled++
		}
		if item.isPaidImage() {
			paid++
		}
		if item.ImageQuotaUnknown {
			unknownQuota++
		}
		freeSlots += s.availableImageSlotsLocked(item)
		if item.isImageAvailable() {
			available++
		}
	}
	noQuota := total - available - rateLimited - invalid - disabled
	if noQuota < 0 {
		noQuota = 0
	}
	return map[string]any{
		"total":                   total,
		"available":               available,
		"free_slots":              freeSlots,
		"rate_limited":            rateLimited,
		"invalid":                 invalid,
		"disabled":                disabled,
		"paid":                    paid,
		"unknown_quota":           unknownQuota,
		"no_quota_or_unavailable": noQuota,
		"by_status":               byStatus,
		"codes": map[string]any{
			"account_pool_no_quota":     noQuota > 0 && available == 0,
			"account_pool_rate_limited": rateLimited > 0,
			"account_pool_invalid":      invalid > 0,
			"account_pool_empty":        total == 0,
		},
	}
}

func (s *AccountService) ListLimitedTokens() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for _, item := range s.items {
		if item.Status == "限流" {
			if token := util.Clean(item.AccessToken); token != "" {
				out = append(out, token)
			}
		}
	}
	return out
}

func cloneStringIntMap(src map[string]int) map[string]int {
	if src == nil {
		return map[string]int{}
	}
	out := make(map[string]int, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func cloneStringTimeMap(src map[string]time.Time) map[string]time.Time {
	if src == nil {
		return map[string]time.Time{}
	}
	out := make(map[string]time.Time, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func (s *AccountService) findIndexLocked(accessToken string) int {
	for index, item := range s.items {
		if util.Clean(item.AccessToken) == accessToken {
			return index
		}
	}
	return -1
}

func (s *AccountService) loadAccounts() ([]Account, bool) {
	items, err := s.storage.LoadAccounts()
	if err != nil {
		return []Account{}, false
	}
	return accountsFromMaps(items), true
}

func (s *AccountService) saveLocked() error {
	// Full rewrite — used when membership changes without row API, or as fallback.
	return s.saveAllLocked()
}

func (s *AccountService) saveAllLocked() error {
	if !s.storeReady {
		return fmt.Errorf("号池数据未成功加载，已拒绝写入以防清空存储")
	}
	return s.storage.SaveAccounts(accountsToMaps(s.items))
}

// saveAccountLocked persists one account row (Upsert when supported; otherwise full table).
func (s *AccountService) saveAccountLocked(accessToken string) error {
	if !s.storeReady {
		return fmt.Errorf("号池数据未成功加载，已拒绝写入以防清空存储")
	}
	accessToken = util.Clean(accessToken)
	idx := s.findIndexLocked(accessToken)
	if idx < 0 {
		return fmt.Errorf("账号不存在")
	}
	if patcher, ok := s.storage.(storage.AccountUpsertBackend); ok {
		return patcher.UpsertAccount(accessToken, s.items[idx].toMap())
	}
	return s.saveAllLocked()
}

// saveAccountsUpsertLocked upserts each listed token without rewriting unrelated rows.
func (s *AccountService) saveAccountsUpsertLocked(tokens []string) error {
	if !s.storeReady {
		return fmt.Errorf("号池数据未成功加载，已拒绝写入以防清空存储")
	}
	mutations := make([]storage.AccountMutation, 0, len(tokens))
	for _, token := range tokens {
		token = util.Clean(token)
		if token == "" {
			continue
		}
		idx := s.findIndexLocked(token)
		if idx < 0 {
			continue
		}
		mutations = append(mutations, storage.AccountMutation{AccessToken: token, Data: s.items[idx].toMap()})
	}
	if batch, ok := s.storage.(storage.AccountBatchUpsertBackend); ok {
		return batch.UpsertAccountsBatch(mutations)
	}
	patcher, ok := s.storage.(storage.AccountUpsertBackend)
	if !ok || len(mutations) > 1 {
		return s.saveAllLocked()
	}
	for _, mutation := range mutations {
		if err := patcher.UpsertAccount(mutation.AccessToken, mutation.Data); err != nil {
			return err
		}
	}
	return nil
}

// deleteAccountsRowLocked deletes listed tokens via row API when available.
func (s *AccountService) deleteAccountsRowLocked(tokens []string) error {
	if !s.storeReady {
		return fmt.Errorf("号池数据未成功加载，已拒绝写入以防清空存储")
	}
	cleaned := make([]string, 0, len(tokens))
	for _, token := range tokens {
		token = util.Clean(token)
		if token == "" {
			continue
		}
		cleaned = append(cleaned, token)
	}
	if batch, ok := s.storage.(storage.AccountBatchDeleteBackend); ok {
		return batch.DeleteAccountsBatch(cleaned)
	}
	deleter, ok := s.storage.(storage.AccountDeleteBackend)
	if !ok || len(cleaned) > 1 {
		return s.saveAllLocked()
	}
	for _, token := range cleaned {
		if err := deleter.DeleteAccount(token); err != nil {
			return err
		}
	}
	return nil
}
