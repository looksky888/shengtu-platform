package service

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func newPaymentCancellationFixture(t *testing.T) (*PaymentService, *paymentProviderStub, *storage.DatabaseBackend, storage.PaymentOrderRecord) {
	t.Helper()
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment-cancel.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	key := []byte(strings.Repeat("k", 32))
	admin := NewPaymentAdminService(backend, key)
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	_, _, err = admin.CreateChannel(PaymentChannelInput{Code: "wechat", Name: "微信", Provider: storage.PaymentProviderWechatPay, PaymentMethod: storage.PaymentMethodNative, Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 15}, PaymentCredentialsInput{AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32), WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	product, err := admin.CreateProduct(RechargeProductInput{SKU: "credits100", Name: "100 积分", AmountFen: 100, Credits: 100, Enabled: true}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CustomCreditsEnabled: true, CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 1000}, "admin"); err != nil {
		t.Fatal(err)
	}
	service := &PaymentService{backend: backend, key: key, now: func() time.Time { return time.Date(2026, 9, 24, 1, 2, 3, 0, time.UTC) }}
	stub := &paymentProviderStub{}
	service.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil }
	order, _, err := service.CreateNativeOrder(context.Background(), "user-1", product.ID, "cancel-fixture")
	if err != nil {
		t.Fatal(err)
	}
	stored, err := backend.LoadPaymentOrderByID(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	return service, stub, backend, stored
}

func TestPaymentServiceCancelOrderClosesUnpaidOrder(t *testing.T) {
	service, stub, backend, order := newPaymentCancellationFixture(t)
	item, err := service.CancelOrder(context.Background(), "user-1", order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if item.Status != storage.PaymentOrderStatusClosed || stub.closeCalls != 1 {
		t.Fatalf("cancelled item=%#v closeCalls=%d", item, stub.closeCalls)
	}
	stored, err := backend.LoadPaymentOrderByID(order.ID)
	if err != nil || stored.Status != storage.PaymentOrderStatusClosed {
		t.Fatalf("stored order=%#v err=%v", stored, err)
	}
	// Repeating the request is idempotent and does not call the provider again.
	item, err = service.CancelOrder(context.Background(), "user-1", order.ID)
	if err != nil || item.Status != storage.PaymentOrderStatusClosed || stub.closeCalls != 1 {
		t.Fatalf("repeat cancel item=%#v err=%v closeCalls=%d", item, err, stub.closeCalls)
	}
}

func TestPaymentServiceCancelOrderProtectsOwnershipAndPaidOrders(t *testing.T) {
	service, _, backend, order := newPaymentCancellationFixture(t)
	if _, err := service.CancelOrder(context.Background(), "other-user", order.ID); !errors.Is(err, storage.ErrPaymentRecordNotFound) {
		t.Fatalf("cross-user cancel error=%v", err)
	}
	service.BindCredits(NewCreditService(t.TempDir(), backend))
	service.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) {
		return &paymentProviderStub{queryResult: PaymentResult{OutTradeNo: order.OutTradeNo, TransactionID: "tx-paid", AppID: "wx-app", MerchantID: "mch-1", TradeState: "SUCCESS", Currency: "CNY", SuccessTime: "2026-09-24T01:03:00Z", AmountFen: 100}}, nil
	}
	if _, err := service.QueryOrder(context.Background(), "user-1", order.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CancelOrder(context.Background(), "user-1", order.ID); !errors.Is(err, ErrPaymentOrderAlreadyPaid) {
		t.Fatalf("paid cancel error=%v", err)
	}
}

func TestPaymentServiceCancelOrderKeepsClosingStateWhenProviderFails(t *testing.T) {
	service, stub, backend, order := newPaymentCancellationFixture(t)
	stub.closeErr = errors.New("provider unavailable")
	if _, err := service.CancelOrder(context.Background(), "user-1", order.ID); err == nil || !strings.Contains(err.Error(), "关单失败") {
		t.Fatalf("close error=%v", err)
	}
	stored, err := backend.LoadPaymentOrderByID(order.ID)
	if err != nil || stored.Status != storage.PaymentOrderStatusClosing || stored.LastErrorCode != "close_failed" {
		t.Fatalf("closing order=%#v err=%v", stored, err)
	}
}
