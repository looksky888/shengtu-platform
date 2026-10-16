package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"strings"
	"time"
)

func (s *CreditService) CheckIn(userID string, day time.Time) (CreditAccount, CreditLedgerEntry, bool, error) {
	// Must use China calendar day — matches HasLedgerEntry(checked_in_today) / util.ChinaDate().
	// UTC day would shift ref_id near 中国时间午夜前后，导致「今日是否已签到」判断错位。
	date := day.In(util.ChinaLocation()).Format("2006-01-02")
	return s.AddOnce(userID, DefaultDailyCheckinCreditAmount, CreditReasonCheckin, date)
}

func (s *CreditService) InviteCode(userID string) (string, error) {
	userID = util.Clean(userID)
	if userID == "" {
		return "", fmt.Errorf("请提供 user_id")
	}
	code := strings.ToLower(util.SHA1Short("invite:"+userID, 12))

	s.mu.Lock()
	defer s.mu.Unlock()

	nextState := cloneCreditState(s.state)
	nextState.Invites[code] = userID
	if err := s.saveLocked(nextState); err != nil {
		return "", err
	}
	s.state = nextState
	return code, nil
}

func (s *CreditService) ResolveInviteCode(code string) string {
	code = strings.ToLower(util.Clean(code))
	if code == "" {
		return ""
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.Invites[code]
}

func (s *CreditService) RewardInvite(inviterID, invitedUserID string) (CreditAccount, CreditLedgerEntry, bool, error) {
	inviterID = util.Clean(inviterID)
	invitedUserID = util.Clean(invitedUserID)
	if inviterID == "" || invitedUserID == "" || inviterID == invitedUserID {
		return CreditAccount{}, CreditLedgerEntry{}, false, nil
	}
	return s.AddOnce(inviterID, DefaultInviteCreditAmount, CreditReasonInvite, invitedUserID)
}
