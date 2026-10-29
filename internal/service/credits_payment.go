package service

import (
	"errors"
	"fmt"
	"strings"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type PaymentRechargeCreditInput struct {
	OrderID        string
	Provider       string
	UserID         string
	Amount         int
	MerchantID     string
	TransactionID  string
	PaidAt         string
	TradeState     string
	TradeStateDesc string
}

// CompletePaymentRecharge keeps the legacy credit account, append-only ledger,
// payment receipt, and payment order in one database transaction.
func (s *CreditService) CompletePaymentRecharge(input PaymentRechargeCreditInput) (CreditAccount, CreditLedgerEntry, bool, error) {
	input = normalizePaymentRechargeCreditInput(input)
	if err := validatePaymentRechargeCreditInput(input); err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.storeReady {
		return CreditAccount{}, CreditLedgerEntry{}, false, errors.New("积分数据未成功加载，已拒绝支付到账")
	}
	if s.paymentStore == nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, errors.New("在线支付需要数据库存储后端")
	}
	prior, ok, err := s.findLedgerByRefLocked(input.UserID, CreditReasonPaymentRecharge, input.OrderID)
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	if ok {
		return s.state.Accounts[input.UserID], prior, false, nil
	}

	creditedAt := nextCreditLedgerTimestamp(util.NowISO(), s.state.Accounts[input.UserID].UpdatedAt)
	next := cloneCreditState(s.state)
	account := ensureCreditAccount(next, input.UserID, creditedAt)
	account.Balance += input.Amount
	account.UpdatedAt = creditedAt
	next.Accounts[input.UserID] = account
	entry := CreditLedgerEntry{
		ID: util.NewUUID(), UserID: input.UserID, Delta: input.Amount,
		BalanceAfter: account.Balance, Reason: CreditReasonPaymentRecharge,
		RefID: input.OrderID, CreatedAt: creditedAt,
	}
	next.Ledger = append(next.Ledger[:len(next.Ledger):len(next.Ledger)], entry)
	core := creditCoreState{Accounts: next.Accounts, Cards: next.Cards, Invites: next.Invites, LedgerMigrated: true}
	_, credited, err := s.paymentStore.CompletePaymentCredit(storage.PaymentCreditCompletion{
		OrderID: input.OrderID, Provider: input.Provider, TransactionID: input.TransactionID, MerchantID: input.MerchantID,
		PaidAt: input.PaidAt, CreditedAt: creditedAt, TradeState: input.TradeState,
		TradeStateDesc: input.TradeStateDesc, CreditCoreDocument: core,
		LedgerEntry: storage.CreditLedgerRow{ID: entry.ID, UserID: entry.UserID, Delta: entry.Delta,
			BalanceAfter: entry.BalanceAfter, Reason: entry.Reason, RefID: entry.RefID, CreatedAt: entry.CreatedAt},
	})
	if err != nil {
		return CreditAccount{}, CreditLedgerEntry{}, false, err
	}
	if !credited {
		return s.state.Accounts[input.UserID], CreditLedgerEntry{}, false, nil
	}
	s.state = next
	s.ledgerPersisted = len(next.Ledger)
	if s.ledgerRefIndex == nil {
		s.ledgerRefIndex = map[string]int{}
	}
	s.ledgerRefIndex[ledgerRefKey(entry.UserID, entry.Reason, entry.RefID)] = len(next.Ledger) - 1
	s.trimInMemoryLedgerLocked()
	return account, entry, true, nil
}

func normalizePaymentRechargeCreditInput(input PaymentRechargeCreditInput) PaymentRechargeCreditInput {
	input.OrderID = strings.TrimSpace(input.OrderID)
	input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
	if input.Provider == "" {
		input.Provider = storage.PaymentProviderWechatPay
	}
	input.UserID = strings.TrimSpace(input.UserID)
	input.MerchantID = strings.TrimSpace(input.MerchantID)
	input.TransactionID = strings.TrimSpace(input.TransactionID)
	input.PaidAt = strings.TrimSpace(input.PaidAt)
	input.TradeState = strings.TrimSpace(input.TradeState)
	input.TradeStateDesc = strings.TrimSpace(input.TradeStateDesc)
	return input
}

func validatePaymentRechargeCreditInput(input PaymentRechargeCreditInput) error {
	if input.OrderID == "" || input.Provider == "" || input.UserID == "" || input.MerchantID == "" || input.TransactionID == "" || input.PaidAt == "" {
		return fmt.Errorf("支付到账缺少必要字段")
	}
	if input.Amount <= 0 {
		return fmt.Errorf("支付到账积分必须为正数")
	}
	return nil
}
