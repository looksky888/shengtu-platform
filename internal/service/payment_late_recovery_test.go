package service

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func newLateRecoveryFixtureWithDBPath(t *testing.T) (paymentRecoveryFixture, string) {
	t.Helper()
	dataDir := t.TempDir()
	dbFile := filepath.Join(dataDir, "payment.db")
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbFile))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	key := []byte(strings.Repeat("k", 32))
	admin := NewPaymentAdminService(backend, key)
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	_, _, err = admin.CreateChannel(PaymentChannelInput{
		Code: "wechat", Name: "微信", Provider: "wechatpay", PaymentMethod: "native",
		Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 5,
	}, PaymentCredentialsInput{
		AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial",
		MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32),
		WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic,
	}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	product, err := admin.CreateProduct(RechargeProductInput{
		SKU: "credits100", Name: "100 积分", AmountFen: 100, Credits: 100, Enabled: true,
	}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 30, 1, 2, 3, 0, time.UTC)
	stub := &paymentProviderStub{}
	svc := &PaymentService{
		backend: backend, key: key, now: func() time.Time { return now },
		provider: func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil },
	}
	svc.BindCredits(NewCreditService(dataDir, backend))
	order, _, err := svc.CreateNativeOrder(context.Background(), "user-1", product.ID, "idem-late-recovery")
	if err != nil {
		t.Fatal(err)
	}
	stub.queryResult = PaymentResult{
		OutTradeNo: order.OutTradeNo, AppID: "wx-app", MerchantID: "mch-1",
		TradeState: "NOTPAY", TradeStateDesc: "未支付", Currency: "CNY", AmountFen: 100,
	}
	return paymentRecoveryFixture{service: svc, stub: stub, order: order, now: &now}, dbFile
}

func TestLateWebhookRecoversClosedAndExpiredOrdersIdempotently(t *testing.T) {
	for _, terminalStatus := range []string{storage.PaymentOrderStatusClosed, storage.PaymentOrderStatusExpired} {
		t.Run(terminalStatus, func(t *testing.T) {
			fixture, dbFile := newLateRecoveryFixtureWithDBPath(t)
			*fixture.now = fixture.now.Add(6 * time.Minute)
			if _, err := fixture.service.RecoverDueOrders(context.Background(), 10); err != nil {
				t.Fatalf("RecoverDueOrders: %v", err)
			}
			if terminalStatus == storage.PaymentOrderStatusExpired {
				rawDB, err := sql.Open("sqlite", filepath.ToSlash(dbFile))
				if err != nil {
					t.Fatal(err)
				}
				if _, err := rawDB.Exec(`UPDATE payment_orders SET status = ? WHERE id = ?`, storage.PaymentOrderStatusExpired, fixture.order.ID); err != nil {
					_ = rawDB.Close()
					t.Fatalf("set expired status: %v", err)
				}
				_ = rawDB.Close()
			}

			orderRow, err := fixture.service.backend.LoadPaymentOrderByID(fixture.order.ID)
			if err != nil {
				t.Fatal(err)
			}
			if orderRow.Status != terminalStatus {
				t.Fatalf("precondition status = %q, want %q", orderRow.Status, terminalStatus)
			}
			version, err := fixture.service.backend.LoadPaymentChannelVersion(orderRow.ChannelVersionID)
			if err != nil {
				t.Fatal(err)
			}

			paidTime := fixture.now.UTC().Format(time.RFC3339Nano)
			result := PaymentResult{
				Provider:       storage.PaymentProviderWechatPay,
				OutTradeNo:     orderRow.OutTradeNo,
				TransactionID:  "wx-late-tx-" + terminalStatus,
				AppID:          "wx-app",
				MerchantID:     "mch-1",
				TradeState:     "SUCCESS",
				TradeStateDesc: "支付成功",
				Currency:       "CNY",
				AmountFen:      orderRow.AmountFen,
				SuccessTime:    paidTime,
			}
			event1 := storage.PaymentEventRecord{
				ID:               "evt-1-" + terminalStatus,
				Provider:         storage.PaymentProviderWechatPay,
				ProviderEventID:  "evt-1-" + terminalStatus,
				ChannelVersionID: version.ID,
				EventType:        "TRANSACTION.SUCCESS",
				OrderID:          orderRow.ID,
				OutTradeNo:       orderRow.OutTradeNo,
				TransactionID:    result.TransactionID,
				AppID:            result.AppID,
				MerchantID:       result.MerchantID,
				TradeState:       "SUCCESS",
				TradeStateDesc:   "支付成功",
				AmountFen:        result.AmountFen,
				Currency:         "CNY",
				SuccessTime:      paidTime,
				ResourceDigest:   "digest-1",
				Status:           storage.PaymentEventStatusPending,
				ReceivedAt:       paidTime,
			}

			credited, err := fixture.service.processPaymentEvent(event1, result, orderRow, version)
			if err != nil {
				t.Fatalf("late payment webhook failed on %s order: %v", terminalStatus, err)
			}
			if !credited {
				t.Fatalf("expected first late webhook to credit user")
			}

			// Duplicate callback (even with a distinct provider event ID!) must NOT double-credit.
			event2 := event1
			event2.ID = "evt-2-" + terminalStatus
			event2.ProviderEventID = "evt-2-" + terminalStatus
			creditedAgain, err := fixture.service.processPaymentEvent(event2, result, orderRow, version)
			if err != nil {
				t.Fatalf("second late payment webhook returned error: %v", err)
			}
			if creditedAgain {
				t.Fatalf("duplicate callback credited user a second time!")
			}

			balance := fixture.service.credits.OverviewCreditBalanceTotal()
			if balance != 100 {
				t.Fatalf("user balance = %d, want 100 (credited once)", balance)
			}
			recoveredOrder, err := fixture.service.backend.LoadPaymentOrderByID(orderRow.ID)
			if err != nil {
				t.Fatal(err)
			}
			if recoveredOrder.Status != storage.PaymentOrderStatusSucceeded {
				t.Fatalf("recovered status = %q, want succeeded", recoveredOrder.Status)
			}
		})
	}
}

func TestQueryOrderAsAdminReconcilesClosedAndExpiredPaidOrdersOnce(t *testing.T) {
	for _, terminalStatus := range []string{storage.PaymentOrderStatusClosed, storage.PaymentOrderStatusExpired} {
		t.Run(terminalStatus, func(t *testing.T) {
			fixture, dbFile := newLateRecoveryFixtureWithDBPath(t)
			*fixture.now = fixture.now.Add(6 * time.Minute)
			if _, err := fixture.service.RecoverDueOrders(context.Background(), 10); err != nil {
				t.Fatal(err)
			}
			if terminalStatus == storage.PaymentOrderStatusExpired {
				rawDB, err := sql.Open("sqlite", filepath.ToSlash(dbFile))
				if err != nil {
					t.Fatal(err)
				}
				if _, err := rawDB.Exec(`UPDATE payment_orders SET status = ? WHERE id = ?`, storage.PaymentOrderStatusExpired, fixture.order.ID); err != nil {
					_ = rawDB.Close()
					t.Fatalf("set expired status: %v", err)
				}
				_ = rawDB.Close()
			}

			fixture.stub.queryResult = PaymentResult{
				Provider:       storage.PaymentProviderWechatPay,
				OutTradeNo:     fixture.order.OutTradeNo,
				TransactionID:  "wx-admin-reconcile-" + terminalStatus,
				AppID:          "wx-app",
				MerchantID:     "mch-1",
				TradeState:     "SUCCESS",
				TradeStateDesc: "支付成功",
				Currency:       "CNY",
				AmountFen:      100,
				SuccessTime:    fixture.now.UTC().Format(time.RFC3339Nano),
			}

			reconciled, err := fixture.service.QueryOrderAsAdmin(context.Background(), fixture.order.ID)
			if err != nil {
				t.Fatalf("QueryOrderAsAdmin on %s order: %v", terminalStatus, err)
			}
			if reconciled.Status != storage.PaymentOrderStatusSucceeded || reconciled.TransactionID != "wx-admin-reconcile-"+terminalStatus {
				t.Fatalf("reconciled order = %+v", reconciled)
			}
			reconciledAgain, err := fixture.service.QueryOrderAsAdmin(context.Background(), fixture.order.ID)
			if err != nil {
				t.Fatalf("second QueryOrderAsAdmin: %v", err)
			}
			if reconciledAgain.Status != storage.PaymentOrderStatusSucceeded {
				t.Fatalf("second reconciled status = %q", reconciledAgain.Status)
			}
			if got := fixture.service.credits.OverviewCreditBalanceTotal(); got != 100 {
				t.Fatalf("balance after repeated admin reconcile = %d, want 100", got)
			}
		})
	}
}
