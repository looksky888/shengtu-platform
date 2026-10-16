package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
)

const (
	defaultPaymentRecoveryInterval = time.Minute
	defaultPaymentRecoveryBatch    = 50
	paymentProviderTimeout         = 30 * time.Second
)

type PaymentRecoverySummary struct {
	Scanned   int
	Succeeded int
	Closed    int
	Pending   int
	Failed    int
}

type paymentRecoveryResult string

type paymentOrderLock struct {
	mu   sync.Mutex
	refs int
}

const (
	paymentRecoverySucceeded paymentRecoveryResult = "succeeded"
	paymentRecoveryClosed    paymentRecoveryResult = "closed"
	paymentRecoveryPending   paymentRecoveryResult = "pending"
)

var terminalUnpaidTradeStates = map[string]struct{}{
	"CLOSED": {}, "REVOKED": {}, "PAYERROR": {},
}

func (s *PaymentService) StartRecovery(ctx context.Context, interval time.Duration, batch int, observer func(PaymentRecoverySummary, error)) {
	if !s.Available() || s.credits == nil || ctx == nil {
		return
	}
	if interval <= 0 {
		interval = defaultPaymentRecoveryInterval
	}
	if batch <= 0 {
		batch = defaultPaymentRecoveryBatch
	}
	s.recoveryStartOnce.Do(func() {
		s.recoveryWG.Add(1)
		go func() {
			defer s.recoveryWG.Done()
			run := func() {
				summary, err := s.RecoverDueOrders(ctx, batch)
				if observer != nil && (err != nil || summary.Scanned > 0) {
					observer(summary, err)
				}
			}
			run()
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					run()
				}
			}
		}()
	})
}

func (s *PaymentService) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	done := make(chan struct{})
	go func() {
		s.recoveryWG.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("等待支付订单恢复任务停止: %w", ctx.Err())
	}
}

func (s *PaymentService) RecoverDueOrders(ctx context.Context, batch int) (PaymentRecoverySummary, error) {
	var summary PaymentRecoverySummary
	if !s.Available() || s.credits == nil {
		return summary, errors.New("支付到账服务尚未就绪")
	}
	items, err := s.backend.ListPaymentOrdersDue(s.now().UTC().Format(time.RFC3339Nano), batch)
	if err != nil {
		return summary, fmt.Errorf("读取到期支付订单: %w", err)
	}
	summary.Scanned = len(items)
	var failures []error
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return summary, errors.Join(append(failures, err)...)
		}
		result, err := s.reconcileOrder(ctx, item, true)
		if err != nil {
			summary.Failed++
			failures = append(failures, fmt.Errorf("订单 %s: %w", item.ID, err))
			continue
		}
		switch result {
		case paymentRecoverySucceeded:
			summary.Succeeded++
		case paymentRecoveryClosed:
			summary.Closed++
		default:
			summary.Pending++
		}
	}
	return summary, errors.Join(failures...)
}

// CancelOrder closes an unpaid order at the provider and persists the terminal
// state. It shares the reconciliation lock with callbacks and the recovery
// worker so a payment that wins the race is never overwritten by cancellation.
func (s *PaymentService) CancelOrder(ctx context.Context, userID, orderID string) (PaymentOrderPublic, error) {
	if !s.Available() {
		return PaymentOrderPublic{}, errors.New("支付服务尚未就绪")
	}
	userID, orderID = strings.TrimSpace(userID), strings.TrimSpace(orderID)
	if userID == "" || orderID == "" {
		return PaymentOrderPublic{}, errors.New("用户或订单无效")
	}
	unlock := s.lockPaymentOrder(orderID)
	defer unlock()
	order, err := s.backend.LoadPaymentOrderByID(orderID)
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	if order.UserID != userID {
		return PaymentOrderPublic{}, storage.ErrPaymentRecordNotFound
	}
	switch order.Status {
	case storage.PaymentOrderStatusSucceeded:
		return PaymentOrderPublic{}, ErrPaymentOrderAlreadyPaid
	case storage.PaymentOrderStatusClosed, storage.PaymentOrderStatusFailed:
		return publicPaymentOrder(order), nil
	case storage.PaymentOrderStatusClosing:
		return publicPaymentOrder(order), nil
	case storage.PaymentOrderStatusCreated, storage.PaymentOrderStatusPending:
		// Continue with the provider close below.
	default:
		return PaymentOrderPublic{}, fmt.Errorf("%w: %s", ErrPaymentOrderNotCancellable, order.Status)
	}
	_, credentials, err := s.loadRuntimeCredentials(order.ChannelVersionID)
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	providerCtx, cancelProvider := context.WithTimeout(ctx, paymentProviderTimeout)
	provider, err := s.provider(providerCtx, credentials)
	if err != nil {
		cancelProvider()
		return PaymentOrderPublic{}, err
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	if err := s.backend.MarkPaymentOrderClosing(order.ID, now, "", ""); err != nil {
		cancelProvider()
		return PaymentOrderPublic{}, err
	}
	closeErr := provider.Close(providerCtx, order.OutTradeNo, credentials.MerchantID)
	cancelProvider()
	closedAt := s.now().UTC().Format(time.RFC3339Nano)
	if closeErr != nil {
		persistErr := s.backend.MarkPaymentOrderClosing(order.ID, closedAt, "close_failed", closeErr.Error())
		return PaymentOrderPublic{}, errors.Join(fmt.Errorf("%s关单失败: %w", paymentProviderDisplayName(credentials.Provider), closeErr), persistErr)
	}
	if err := s.backend.MarkPaymentOrderClosed(order.ID, closedAt, "", ""); err != nil {
		return PaymentOrderPublic{}, err
	}
	updated, err := s.backend.LoadPaymentOrderByID(order.ID)
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	return publicPaymentOrder(updated), nil
}

func (s *PaymentService) reconcileOrder(ctx context.Context, order storage.PaymentOrderRecord, closeExpired bool) (paymentRecoveryResult, error) {
	unlock := s.lockPaymentOrder(order.ID)
	defer unlock()
	current, err := s.backend.LoadPaymentOrderByID(order.ID)
	if err != nil {
		return paymentRecoveryPending, err
	}
	switch current.Status {
	case storage.PaymentOrderStatusSucceeded:
		return paymentRecoverySucceeded, nil
	case storage.PaymentOrderStatusClosed, storage.PaymentOrderStatusFailed:
		return paymentRecoveryClosed, nil
	}
	order = current
	retryClose := current.Status == storage.PaymentOrderStatusClosing
	version, credentials, err := s.loadRuntimeCredentials(order.ChannelVersionID)
	if err != nil {
		return paymentRecoveryPending, err
	}
	queryCtx, queryCancel := context.WithTimeout(ctx, paymentProviderTimeout)
	provider, err := s.provider(queryCtx, credentials)
	if err != nil {
		queryCancel()
		return paymentRecoveryPending, err
	}
	result, queryErr := provider.Query(queryCtx, order.OutTradeNo, credentials.MerchantID)
	queryCancel()
	now := s.now().UTC().Format(time.RFC3339Nano)
	if queryErr != nil {
		persistErr := s.backend.RecordPaymentOrderQuery(storage.PaymentOrderQueryUpdate{
			OrderID: order.ID, LastQueryAt: now, LastErrorCode: "query_failed", LastErrorMessage: queryErr.Error(),
		})
		return paymentRecoveryPending, errors.Join(fmt.Errorf("%s查单失败: %w", paymentProviderDisplayName(credentials.Provider), queryErr), persistErr)
	}
	if result.NotFound {
		if err := s.backend.RecordPaymentOrderQuery(storage.PaymentOrderQueryUpdate{
			OrderID: order.ID, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc,
			LastQueryAt: now,
		}); err != nil {
			return paymentRecoveryPending, err
		}
	} else if err := validatePaymentQueryResult(result, order, version); err != nil {
		persistErr := s.backend.RecordPaymentOrderQuery(storage.PaymentOrderQueryUpdate{
			OrderID: order.ID, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc,
			LastQueryAt: now, LastErrorCode: "query_result_invalid", LastErrorMessage: err.Error(),
		})
		return paymentRecoveryPending, errors.Join(err, persistErr)
	}
	if !result.NotFound {
		if err := s.backend.RecordPaymentOrderQuery(storage.PaymentOrderQueryUpdate{
			OrderID: order.ID, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc,
			LastQueryAt: now,
		}); err != nil {
			return paymentRecoveryPending, err
		}
	}
	tradeState := strings.ToUpper(strings.TrimSpace(result.TradeState))
	if tradeState == "SUCCESS" {
		if _, err := s.completePaymentResult(order, result, version); err != nil {
			return paymentRecoveryPending, err
		}
		return paymentRecoverySucceeded, nil
	}
	if _, terminal := terminalUnpaidTradeStates[tradeState]; terminal {
		if err := s.backend.MarkPaymentOrderClosed(order.ID, now, "provider_"+strings.ToLower(tradeState), result.TradeStateDesc); err != nil {
			return paymentRecoveryPending, err
		}
		return paymentRecoveryClosed, nil
	}
	if (!closeExpired && !retryClose) || tradeState != "NOTPAY" {
		return paymentRecoveryPending, nil
	}
	if err := s.backend.MarkPaymentOrderClosing(order.ID, now, "", ""); err != nil {
		return paymentRecoveryPending, err
	}
	closeCtx, closeCancel := context.WithTimeout(ctx, paymentProviderTimeout)
	closeErr := provider.Close(closeCtx, order.OutTradeNo, credentials.MerchantID)
	closeCancel()
	closedAt := s.now().UTC().Format(time.RFC3339Nano)
	if closeErr != nil {
		persistErr := s.backend.MarkPaymentOrderClosing(order.ID, closedAt, "close_failed", closeErr.Error())
		return paymentRecoveryPending, errors.Join(fmt.Errorf("%s关单失败: %w", paymentProviderDisplayName(credentials.Provider), closeErr), persistErr)
	}
	if err := s.backend.MarkPaymentOrderClosed(order.ID, closedAt, "", ""); err != nil {
		return paymentRecoveryPending, err
	}
	return paymentRecoveryClosed, nil
}

func paymentProviderDisplayName(provider string) string {
	if strings.EqualFold(strings.TrimSpace(provider), storage.PaymentProviderAlipay) {
		return "支付宝"
	}
	return "微信支付"
}

func (s *PaymentService) lockPaymentOrder(orderID string) func() {
	orderID = strings.TrimSpace(orderID)
	s.reconcileLocksMu.Lock()
	if s.reconcileLocks == nil {
		s.reconcileLocks = make(map[string]*paymentOrderLock)
	}
	lock := s.reconcileLocks[orderID]
	if lock == nil {
		lock = &paymentOrderLock{}
		s.reconcileLocks[orderID] = lock
	}
	lock.refs++
	s.reconcileLocksMu.Unlock()
	lock.mu.Lock()
	return func() {
		lock.mu.Unlock()
		s.reconcileLocksMu.Lock()
		lock.refs--
		if lock.refs == 0 {
			delete(s.reconcileLocks, orderID)
		}
		s.reconcileLocksMu.Unlock()
	}
}

func paymentOrderExpired(order storage.PaymentOrderRecord, now time.Time) (bool, error) {
	expiresAt, err := time.Parse(time.RFC3339, strings.TrimSpace(order.ExpiresAt))
	if err != nil {
		return false, fmt.Errorf("支付订单过期时间无效: %w", err)
	}
	return !expiresAt.After(now), nil
}
