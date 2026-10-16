package service

import (
	"fmt"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/util"
)

func (s *AccountService) InitQuarantinePath(dataDir string) error {
	dataDir = strings.TrimSpace(dataDir)
	if dataDir == "" {
		return nil
	}
	s.mu.Lock()
	s.quarantinePath = filepath.Join(dataDir, quarantineFileName)
	s.quarantineMaxEntries = resolveQuarantineMaxEntries()
	s.mu.Unlock()
	s.quarantineMu.Lock()
	s.quarantineCache = nil
	s.quarantineCacheOK = false
	s.quarantineMu.Unlock()
	_, err := s.ReconcileQuarantinePool()
	return err
}

// ReconcileQuarantinePool removes pool tokens already present in the durable cabin.
func (s *AccountService) ReconcileQuarantinePool() (int, error) {
	if s == nil {
		return 0, nil
	}
	s.mu.Lock()
	path := s.quarantinePath
	ready := s.storeReady
	s.mu.Unlock()
	if path == "" || !ready {
		return 0, nil
	}
	s.quarantineMu.Lock()
	list, err := s.loadQuarantineLockedStrict(path)
	s.quarantineMu.Unlock()
	if err != nil {
		return 0, fmt.Errorf("读取账号隔离仓: %w", err)
	}
	removed := 0
	for _, entry := range list {
		token := util.Clean(entry.AccessToken)
		if token == "" || s.GetAccount(token) == nil {
			continue
		}
		if err := s.removePoolTokenForQuarantine(token); err != nil {
			return removed, fmt.Errorf("协调移除隔离账号 %s: %w", entry.TokenHash, err)
		}
		removed++
		s.recordPoolOp(PoolOpQuarantineReconcileRemoved, 1)
		if s.logs != nil {
			s.logs.Add("启动协调：号池移除已在隔离仓的账号", map[string]any{
				"module": "accounts", "operation_type": "隔离协调", "email": entry.Email,
				"token": util.AnonymizeToken(token), "grade": entry.Grade,
			})
		}
	}
	return removed, nil
}

func (s *AccountService) removePoolTokenForQuarantine(token string) error {
	if s.GetAccount(token) == nil {
		return nil
	}
	result := s.DeleteAccounts([]string{token})
	if message := strings.TrimSpace(util.Clean(result["error"])); message != "" {
		return fmt.Errorf("保存号池删除结果: %s", message)
	}
	if s.GetAccount(token) != nil {
		return fmt.Errorf("账号仍存在于活动号池")
	}
	return nil
}

func (s *AccountService) restoreQuarantineSnapshot(path string, list []quarantineEntry) error {
	s.quarantineMu.Lock()
	defer s.quarantineMu.Unlock()
	return s.saveQuarantineLocked(path, list)
}

func (s *AccountService) reQuarantineRestoredEntry(entry quarantineEntry) error {
	s.mu.Lock()
	path := s.quarantinePath
	s.mu.Unlock()
	if path == "" {
		return fmt.Errorf("账号隔离仓未配置")
	}
	s.quarantineMu.Lock()
	list, err := s.loadQuarantineLockedStrict(path)
	if err == nil {
		next := make([]quarantineEntry, 0, len(list)+1)
		for _, item := range list {
			if util.Clean(item.AccessToken) != util.Clean(entry.AccessToken) {
				next = append(next, item)
			}
		}
		next = append([]quarantineEntry{entry}, next...)
		err = s.saveQuarantineLocked(path, pruneQuarantineEntries(next, s.quarantineMax()))
	}
	s.quarantineMu.Unlock()
	if err != nil {
		return fmt.Errorf("恢复隔离仓记录: %w", err)
	}
	if err := s.removePoolTokenForQuarantine(entry.AccessToken); err != nil {
		return fmt.Errorf("隔离仓已恢复但号池移除失败: %w", err)
	}
	return nil
}
