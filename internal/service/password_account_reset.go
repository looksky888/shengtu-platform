package service

import (
	"errors"

	"chatgpt2api/internal/util"
)

var ErrPasswordResetAccountUnavailable = errors.New("密码重置账号不可用")

// ResetPasswordByEmail changes a verified email account password and revokes
// all of its login sessions. User-created API keys remain active.
func (s *AuthService) ResetPasswordByEmail(rawEmail, nextPassword string) error {
	email, err := normalizeAccountEmail(rawEmail)
	if err != nil {
		return ErrPasswordResetAccountUnavailable
	}
	if err := validateAccountPassword(nextPassword); err != nil {
		return err
	}
	hash, err := hashAccountPassword(nextPassword)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	index, account, ok := passwordAccountIndexByEmailLocked(s.accounts, email)
	if !ok || account.EmailVerifiedAt == "" {
		return ErrPasswordResetAccountUnavailable
	}

	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	previousItems := append([]AuthKey(nil), s.items...)
	now := util.NowISO()
	account.PasswordHash = hash
	account.UpdatedAt = now
	s.accounts[index] = account
	var revokedSessions []AuthKey
	for itemIndex := range s.items {
		item := &s.items[itemIndex]
		if item.Kind != AuthKindSession || item.Provider != AuthProviderLocal || item.OwnerID != account.ID {
			continue
		}
		if !item.Enabled {
			continue
		}
		item.Enabled = false
		item.UpdatedAt = now
		revokedSessions = append(revokedSessions, *item)
	}

	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if len(revokedSessions) == 0 {
		return nil
	}
	if err := s.persistAuthKeysLocked(revokedSessions); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return authRollbackError(err, rollbackErr)
	}
	return nil
}
