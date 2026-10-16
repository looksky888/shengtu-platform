package service

import (
	"chatgpt2api/internal/util"
	"errors"
	"strings"
)

func (s *AuthService) UpdateProfileName(identity Identity, name string) (*Identity, error) {
	ownerID := util.Clean(identity.OwnerID)
	if ownerID == "" {
		return nil, errAuthOwnerRequired()
	}
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	previousItems := append([]AuthKey(nil), s.items...)

	displayName := ""
	accountFound := false
	for index, account := range s.accounts {
		if account.ID != ownerID {
			continue
		}
		account.Name = normalizeAccountDisplayName(name, account.Username)
		account.UpdatedAt = now
		s.accounts[index] = account
		displayName = account.DisplayName()
		accountFound = true
		break
	}
	if displayName == "" {
		displayName = normalizeAccountDisplayName(name, ownerID)
	}

	changedItems := false
	for i := range s.items {
		if util.Clean(s.items[i].OwnerID) != ownerID {
			continue
		}
		s.items[i].OwnerName = displayName
		s.items[i].UpdatedAt = now
		changedItems = true
	}
	if accountFound {
		s.syncPasswordAccountsToItems()
		for i := range s.items {
			if util.Clean(s.items[i].OwnerID) == ownerID {
				s.items[i].UpdatedAt = now
			}
		}
		if err := s.savePasswordAccountsLocked(); err != nil {
			s.accounts = previousAccounts
			s.items = previousItems
			s.rebuildKeyIndexLocked()
			return nil, authRollbackError(err, s.savePasswordAccountsLocked())
		}
	}
	if changedItems {
		if err := s.saveLocked(); err != nil {
			s.accounts = previousAccounts
			s.items = previousItems
			s.rebuildKeyIndexLocked()
			rollbackErr := s.saveLocked()
			if accountFound {
				rollbackErr = errors.Join(s.savePasswordAccountsLocked(), rollbackErr)
			}
			return nil, authRollbackError(err, rollbackErr)
		}
	}

	nextIdentity := identity
	nextIdentity.Name = displayName
	for _, item := range s.items {
		if util.Clean(item.ID) == identity.CredentialID {
			if updated := identityForAuthItem(item); updated != nil {
				return updated, nil
			}
		}
	}
	return &nextIdentity, nil
}

func (s *AuthService) ChangeProfilePassword(identity Identity, currentPassword, nextPassword string) error {
	ownerID := util.Clean(identity.OwnerID)
	if ownerID == "" {
		return errAuthOwnerRequired()
	}
	if strings.TrimSpace(currentPassword) == "" {
		return authError("请输入当前密码")
	}
	if err := validateAccountPassword(nextPassword); err != nil {
		return err
	}
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	for index, account := range s.accounts {
		if account.ID != ownerID {
			continue
		}
		if !verifyAccountPassword(currentPassword, account.PasswordHash) {
			return authError("当前密码错误")
		}
		hash, err := hashAccountPassword(nextPassword)
		if err != nil {
			return err
		}
		account.PasswordHash = hash
		account.UpdatedAt = now
		previous := s.accounts[index]
		s.accounts[index] = account
		if err := s.savePasswordAccountsLocked(); err != nil {
			s.accounts[index] = previous
			return authRollbackError(err, s.savePasswordAccountsLocked())
		}
		return nil
	}
	return authError("用户账号不存在")
}
