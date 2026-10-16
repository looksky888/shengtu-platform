package service

import (
	"context"
	"errors"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestPaymentCancellationRecoveryBeforeExpiry(t *testing.T) {
	for _, paid := range []bool{false, true} {
		name := "unpaid"
		if paid {
			name = "paid_during_close"
		}
		t.Run(name, func(t *testing.T) {
			fixture := newPaymentRecoveryFixture(t)
			fixture.stub.closeErr = errors.New("temporary close failure")
			if _, err := fixture.service.CancelOrder(context.Background(), "user-1", fixture.order.ID); err == nil {
				t.Fatal("expected failed close")
			}
			fixture.stub.closeErr = nil
			if paid {
				fixture.stub.queryResult.TradeState = "SUCCESS"
				fixture.stub.queryResult.TransactionID = "paid-during-close"
				fixture.stub.queryResult.SuccessTime = fixture.now.Format("2006-01-02T15:04:05Z07:00")
			}
			// The browser may already be closed; recovery must not wait for expiry.
			summary, err := fixture.service.RecoverDueOrders(context.Background(), 10)
			if err != nil || summary.Scanned != 1 {
				t.Fatalf("recovery=%+v err=%v", summary, err)
			}
			if paid {
				account, err := fixture.service.credits.Account("user-1")
				if err != nil || summary.Succeeded != 1 || account.Balance != 100 || fixture.stub.closeCalls != 1 {
					t.Fatalf("payment lost or reclosed: summary=%+v balance=%d err=%v", summary, account.Balance, err)
				}
			} else if summary.Closed != 1 || fixture.stub.closeCalls != 2 {
				t.Fatalf("close not recovered: %+v calls=%d", summary, fixture.stub.closeCalls)
			}
			repeat, err := fixture.service.RecoverDueOrders(context.Background(), 10)
			if err != nil || repeat.Scanned != 0 {
				t.Fatalf("terminal order rescheduled: %+v %v", repeat, err)
			}
		})
	}
}

func TestPaymentCancellationRejectsExceptionalOrder(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	order, err := fixture.service.backend.LoadPaymentOrderByID(fixture.order.ID)
	if err != nil {
		t.Fatal(err)
	}
	order.ID, order.OutTradeNo, order.IdempotencyKey = "exception-order", "exception-trade", "exception-key"
	order.Status = storage.PaymentOrderStatusException
	if _, _, err := fixture.service.backend.CreatePaymentOrder(order); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.CancelOrder(context.Background(), "user-1", order.ID); !errors.Is(err, ErrPaymentOrderNotCancellable) {
		t.Fatalf("exception reported as cancelled: %v", err)
	}
	if fixture.stub.closeCalls != 0 {
		t.Fatal("exceptional order sent to provider")
	}
}
