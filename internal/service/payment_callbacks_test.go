package service

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestPaymentServiceClaimPaymentEventUsesSameReplaySemanticsForProviders(t *testing.T) {
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "callbacks.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	service := &PaymentService{backend: backend}

	for _, provider := range []string{storage.PaymentProviderWechatPay, storage.PaymentProviderAlipay} {
		event := storage.PaymentEventRecord{
			ID: provider + "-event", Provider: provider, ProviderEventID: provider + "-event",
			ChannelVersionID: provider + "-version", EventType: "payment.success", OrderID: provider + "-order",
			OutTradeNo: provider + "-trade", TransactionID: provider + "-transaction", ResourceDigest: provider + "-digest",
			Status: storage.PaymentEventStatusPending, ReceivedAt: "2026-08-31T12:00:00Z",
		}
		claimed, err := service.claimPaymentEvent(event)
		if err != nil || !claimed {
			t.Fatalf("%s first claim = %v, %v", provider, claimed, err)
		}
		if err := backend.UpdatePaymentEventStatus(event.ProviderEventID, storage.PaymentEventStatusProcessed, "", "2026-08-31T12:00:01Z"); err != nil {
			t.Fatalf("%s mark processed: %v", provider, err)
		}
		claimed, err = service.claimPaymentEvent(event)
		if err != nil || claimed {
			t.Fatalf("%s processed replay = %v, %v", provider, claimed, err)
		}
	}
}

func TestPaymentServiceConcurrentRepeatedEventCreditsOnce(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "callback-concurrent.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	key := []byte(strings.Repeat("k", 32))
	admin := NewPaymentAdminService(backend, key)
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	channel, versionPublic, err := admin.CreateChannel(
		PaymentChannelInput{Code: "wechat", Name: "微信", Provider: storage.PaymentProviderWechatPay, PaymentMethod: storage.PaymentMethodNative, Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 15},
		PaymentCredentialsInput{AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32), WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic},
		"admin",
	)
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	version, err := backend.LoadPaymentChannelVersion(versionPublic.ID)
	if err != nil {
		t.Fatalf("LoadPaymentChannelVersion() error = %v", err)
	}
	product, err := admin.CreateProduct(RechargeProductInput{SKU: "credits100", Name: "100 积分", AmountFen: 100, Credits: 100, Enabled: true}, "admin")
	if err != nil {
		t.Fatalf("CreateProduct() error = %v", err)
	}
	service := &PaymentService{backend: backend, key: key, now: func() time.Time { return time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC) }}
	service.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) {
		return &paymentProviderStub{}, nil
	}
	service.BindCredits(NewCreditService(dataDir, backend))
	orderPublic, _, err := service.CreateNativeOrder(context.Background(), "user-1", product.ID, "callback-idempotency")
	if err != nil {
		t.Fatalf("CreateNativeOrder() error = %v", err)
	}
	order, err := backend.LoadPaymentOrderByID(orderPublic.ID)
	if err != nil {
		t.Fatalf("LoadPaymentOrderByID() error = %v", err)
	}
	result := PaymentResult{Provider: storage.PaymentProviderWechatPay, OutTradeNo: order.OutTradeNo, TransactionID: "tx-1", AppID: "wx-app", MerchantID: "mch-1", TradeState: "SUCCESS", TradeStateDesc: "支付成功", AmountFen: 100, Currency: "CNY", SuccessTime: "2026-08-31T12:00:00Z"}
	event := storage.PaymentEventRecord{ID: "event-1", Provider: result.Provider, ProviderEventID: "event-1", ChannelVersionID: version.ID, EventType: "TRANSACTION.SUCCESS", OrderID: order.ID, OutTradeNo: order.OutTradeNo, TransactionID: result.TransactionID, AppID: result.AppID, MerchantID: result.MerchantID, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc, AmountFen: result.AmountFen, Currency: result.Currency, SuccessTime: result.SuccessTime, ResourceDigest: "digest", Status: storage.PaymentEventStatusPending, ReceivedAt: "2026-08-31T12:00:00Z"}

	type callbackResult struct {
		credited bool
		err      error
	}
	results := make(chan callbackResult, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	start := make(chan struct{})
	for range 2 {
		go func() {
			ready.Done()
			<-start
			credited, processErr := service.processPaymentEvent(event, result, order, version)
			results <- callbackResult{credited: credited, err: processErr}
		}()
	}
	ready.Wait()
	close(start)
	creditedCount := 0
	for range 2 {
		result := <-results
		if result.err != nil {
			t.Fatalf("processPaymentEvent() error = %v", result.err)
		}
		if result.credited {
			creditedCount++
		}
	}
	if creditedCount != 1 {
		t.Fatalf("credited callbacks = %d, want 1", creditedCount)
	}
	account, err := service.credits.Account("user-1")
	if err != nil || account.Balance != 100 {
		t.Fatalf("credit account = %#v, %v", account, err)
	}
	stored, err := backend.LoadPaymentEventByProviderEventID(event.ProviderEventID)
	if err != nil || stored.Status != storage.PaymentEventStatusProcessed || stored.Attempts != 1 {
		t.Fatalf("stored event = %#v, %v", stored, err)
	}
	if channel.ActiveVersionID != version.ID {
		t.Fatal("payment channel version was not active")
	}
}

func TestPaymentServiceClaimPaymentEventRetriesFailedAndRejectsPayloadMismatch(t *testing.T) {
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "callback-retry.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	service := &PaymentService{backend: backend}
	event := storage.PaymentEventRecord{
		ID: "event-1", Provider: storage.PaymentProviderWechatPay, ProviderEventID: "event-1", ChannelVersionID: "version-1",
		EventType: "payment.success", OrderID: "order-1", OutTradeNo: "trade-1", TransactionID: "transaction-1",
		ResourceDigest: "digest-1", Status: storage.PaymentEventStatusPending, ReceivedAt: "2026-08-31T12:00:00Z",
	}
	if claimed, err := service.claimPaymentEvent(event); err != nil || !claimed {
		t.Fatalf("first claim = %v, %v", claimed, err)
	}
	if err := backend.UpdatePaymentEventStatus(event.ProviderEventID, storage.PaymentEventStatusFailed, "temporary", "2026-08-31T12:00:01Z"); err != nil {
		t.Fatalf("mark failed: %v", err)
	}
	if claimed, err := service.claimPaymentEvent(event); err != nil || !claimed {
		t.Fatalf("failed replay = %v, %v", claimed, err)
	}

	tampered := event
	tampered.ResourceDigest = "different-digest"
	if _, err := service.claimPaymentEvent(tampered); err == nil {
		t.Fatal("reused event id with different payload was accepted")
	}
}
