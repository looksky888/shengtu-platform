package service

import (
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

// DeductRetryOnce reserves one retry after a fully refunded charge. A retry
// reference is durable and never reused, including after the retry is refunded.
func (s *CreditService) DeductRetryOnce(userID string, amount int, reason, refundReason, baseRef string) (CreditAccount, CreditLedgerEntry, bool, error) {
	userID, reason = util.Clean(userID), util.Clean(reason)
	refundReason, baseRef = util.Clean(refundReason), util.Clean(baseRef)
	if amount <= 0 || userID == "" || reason == "" || refundReason == "" || baseRef == "" {
		return CreditAccount{}, CreditLedgerEntry{}, false, fmt.Errorf("重试扣费参数无效，金额必须为正数")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	charge, charged, err := s.findLedgerByRefLocked(userID, reason, baseRef)
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	refund, refunded, err := s.findLedgerByRefLocked(userID, refundReason, baseRef)
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	if !charged || charge.Delta >= 0 || !refunded || refund.Delta != -charge.Delta {
		return CreditAccount{}, CreditLedgerEntry{}, false, nil
	}
	retryRef := baseRef + ":retry:1"
	_, exists, err := s.findLedgerByRefLocked(userID, reason, retryRef)
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	if exists {
		return CreditAccount{}, CreditLedgerEntry{}, false, nil
	}
	// Existing deployments used random retry suffixes; those are real charges
	// too. Check them under the same lock as the new charge, never outside it.
	prefix := ledgerRefKey(userID, reason, baseRef+":retry:")
	for key := range s.ledgerRefIndex {
		if strings.HasPrefix(key, prefix) {
			return CreditAccount{}, CreditLedgerEntry{}, false, nil
		}
	}
	if s.ledgerTableBacked && s.ledgerStore != nil {
		hasPrefix, err := s.ledgerStore.HasCreditLedgerRefPrefix(userID, reason, baseRef+":retry:")
		if err != nil {
			return CreditAccount{}, CreditLedgerEntry{}, false, err
		}
		if hasPrefix {
			return CreditAccount{}, CreditLedgerEntry{}, false, nil
		}
	}
	account, entry, err := s.changeBalanceLocked(userID, -amount, reason, retryRef)
	return account, entry, err == nil, err
}
