package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrPaymentStateConflict       = errors.New("payment state conflict")
	ErrPaymentTransactionConflict = errors.New("payment transaction conflict")
)

// CompletePaymentCredit atomically marks one order paid and persists the
// receipt, credit ledger row, and legacy credit core document.
func (b *DatabaseBackend) CompletePaymentCredit(input PaymentCreditCompletion) (PaymentOrderRecord, bool, error) {
	input = normalizePaymentCreditCompletion(input)
	if err := validatePaymentCreditCompletion(input); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	coreJSON, err := json.Marshal(input.CreditCoreDocument)
	if err != nil {
		return PaymentOrderRecord{}, false, fmt.Errorf("encode credit core document: %w", err)
	}
	tx, err := b.db.Begin()
	if err != nil {
		return PaymentOrderRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()

	order, err := b.loadPaymentOrderTx(tx, input.OrderID)
	if err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if order.Status == PaymentOrderStatusSucceeded {
		if order.TransactionID != input.TransactionID {
			return PaymentOrderRecord{}, false, ErrPaymentTransactionConflict
		}
		if err := tx.Commit(); err != nil {
			return PaymentOrderRecord{}, false, err
		}
		return order, false, nil
	}
	if order.Status == PaymentOrderStatusClosed || order.Status == PaymentOrderStatusFailed {
		return PaymentOrderRecord{}, false, ErrPaymentStateConflict
	}
	if input.LedgerEntry.UserID != order.UserID || input.LedgerEntry.RefID != order.ID || input.LedgerEntry.Delta != order.CreditsSnapshot {
		return PaymentOrderRecord{}, false, errors.New("payment credit snapshot mismatch")
	}
	if err := b.insertPaymentReceiptTx(tx, input); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if err := b.insertCreditLedgerTx(tx, input.LedgerEntry); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if err := b.saveCreditCoreTx(tx, string(coreJSON), input.CreditedAt); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if err := b.markPaymentOrderSucceededTx(tx, input); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentOrderRecord{}, false, err
	}
	order.Status = PaymentOrderStatusSucceeded
	order.ProviderTradeState = input.TradeState
	order.ProviderTradeDesc = input.TradeStateDesc
	order.TransactionID = input.TransactionID
	order.PaidAt = input.PaidAt
	order.CreditedAt = input.CreditedAt
	order.CodeURL = ""
	order.LastErrorCode = ""
	order.LastErrorMessage = ""
	order.UpdatedAt = input.CreditedAt
	return order, true, nil
}

func (b *DatabaseBackend) loadPaymentOrderTx(tx *sql.Tx, id string) (PaymentOrderRecord, error) {
	query := paymentOrderSelect + `id = ` + b.placeholder(1)
	if b.driver == "postgres" || b.driver == "mysql" {
		query += ` FOR UPDATE`
	}
	item, err := scanPaymentOrder(tx.QueryRow(query, id))
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentOrderRecord{}, ErrPaymentRecordNotFound
	}
	return item, err
}

func (b *DatabaseBackend) insertPaymentReceiptTx(tx *sql.Tx, input PaymentCreditCompletion) error {
	_, err := tx.Exec(`INSERT INTO payment_credit_receipts (
		payment_order_id, provider, merchant_id, transaction_id, ledger_entry_id, credited_at
	) VALUES (`+b.paymentPlaceholders(6)+`)`, input.OrderID, input.Provider,
		input.MerchantID, input.TransactionID, input.LedgerEntry.ID, input.CreditedAt)
	if err != nil && b.isUniqueConflict(err) {
		return ErrPaymentTransactionConflict
	}
	return err
}

func (b *DatabaseBackend) insertCreditLedgerTx(tx *sql.Tx, entry CreditLedgerRow) error {
	_, err := tx.Exec(`INSERT INTO credit_ledger (
		id, user_id, delta, balance_after, reason, ref_id, created_at
	) VALUES (`+b.paymentPlaceholders(7)+`)`, entry.ID, entry.UserID, entry.Delta,
		entry.BalanceAfter, entry.Reason, entry.RefID, entry.CreatedAt)
	return err
}

func (b *DatabaseBackend) saveCreditCoreTx(tx *sql.Tx, data, updatedAt string) error {
	const name = "credits/state.json"
	var stmt string
	switch b.driver {
	case "postgres":
		stmt = `INSERT INTO json_documents (name, data, updated_at) VALUES ($1, $2, $3)
			ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`
	case "mysql":
		stmt = `REPLACE INTO json_documents (name, data, updated_at) VALUES (?, ?, ?)`
	default:
		stmt = `INSERT INTO json_documents (name, data, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
	}
	_, err := tx.Exec(stmt, name, data, updatedAt)
	return err
}

func (b *DatabaseBackend) markPaymentOrderSucceededTx(tx *sql.Tx, input PaymentCreditCompletion) error {
	result, err := tx.Exec(`UPDATE payment_orders SET status = `+b.placeholder(1)+`,
		provider_trade_state = `+b.placeholder(2)+`, provider_trade_desc = `+b.placeholder(3)+`,
		transaction_id = `+b.placeholder(4)+`, paid_at = `+b.placeholder(5)+`,
		credited_at = `+b.placeholder(6)+`, code_url = '', last_error_code = '',
		last_error_message = '', updated_at = `+b.placeholder(7)+`
		WHERE id = `+b.placeholder(8)+` AND status <> `+b.placeholder(9),
		PaymentOrderStatusSucceeded, input.TradeState, input.TradeStateDesc,
		input.TransactionID, input.PaidAt, input.CreditedAt, input.CreditedAt,
		input.OrderID, PaymentOrderStatusSucceeded)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err == nil && affected != 1 {
		return ErrPaymentStateConflict
	}
	return err
}

func normalizePaymentCreditCompletion(input PaymentCreditCompletion) PaymentCreditCompletion {
	input.OrderID = strings.TrimSpace(input.OrderID)
	input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
	if input.Provider == "" {
		input.Provider = PaymentProviderWechatPay
	}
	input.TransactionID = strings.TrimSpace(input.TransactionID)
	input.MerchantID = strings.TrimSpace(input.MerchantID)
	input.PaidAt = strings.TrimSpace(input.PaidAt)
	input.CreditedAt = strings.TrimSpace(input.CreditedAt)
	input.TradeState = strings.TrimSpace(input.TradeState)
	input.TradeStateDesc = strings.TrimSpace(input.TradeStateDesc)
	input.LedgerEntry = normalizeCreditLedgerRow(input.LedgerEntry)
	return input
}

func validatePaymentCreditCompletion(input PaymentCreditCompletion) error {
	if input.OrderID == "" || input.Provider == "" || input.TransactionID == "" || input.MerchantID == "" || input.PaidAt == "" || input.CreditedAt == "" {
		return errors.New("payment credit completion 缺少必要字段")
	}
	entry := input.LedgerEntry
	if entry.ID == "" || entry.UserID == "" || entry.Delta <= 0 || entry.RefID != input.OrderID || entry.CreatedAt == "" {
		return errors.New("payment credit ledger 无效")
	}
	if input.CreditCoreDocument == nil {
		return errors.New("payment credit core document 为空")
	}
	return nil
}
