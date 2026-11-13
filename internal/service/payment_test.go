package service

import (
	"context"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type paymentProviderStub struct {
	mu                  sync.Mutex
	calls               int
	queryCalls          int
	closeCalls          int
	queryResult         PaymentResult
	queryErr            error
	closeErr            error
	expectedAmount      int64
	expectedDescription string
}

func (p *paymentProviderStub) Prepay(_ context.Context, input PaymentPrepayProviderInput) (PaymentPrepayProviderResult, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls++
	expectedAmount := p.expectedAmount
	if expectedAmount == 0 {
		expectedAmount = 100
	}
	expectedDescription := p.expectedDescription
	if expectedDescription == "" {
		expectedDescription = "100 积分"
	}
	if input.AmountFen != expectedAmount || input.Description != expectedDescription || input.MerchantID != "mch-1" {
		return PaymentPrepayProviderResult{}, context.Canceled
	}
	return PaymentPrepayProviderResult{CodeURL: "weixin://code", RequestID: "req-1"}, nil
}

func TestPaymentServiceCustomCreditsUsesServerPrice(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "custom-payment.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	admin := NewPaymentAdminService(backend, []byte(strings.Repeat("k", 32)))
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	_, _, err = admin.CreateChannel(PaymentChannelInput{Code: "wechat", Name: "微信", Provider: "wechatpay", PaymentMethod: "native", Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 15}, PaymentCredentialsInput{AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32), WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	_, err = admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CustomCreditsEnabled: true, CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 1000}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	svc := &PaymentService{backend: backend, key: []byte(strings.Repeat("k", 32)), now: func() time.Time { return time.Date(2026, 8, 30, 1, 2, 3, 0, time.UTC) }}
	stub := &paymentProviderStub{expectedAmount: 2000, expectedDescription: "自定义充值 500 积分"}
	svc.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil }
	order, created, err := svc.CreateCustomCreditsOrder(context.Background(), "user-1", 500, "", "custom-idem")
	if err != nil {
		t.Fatal(err)
	}
	if !created || order.AmountFen != 2000 || order.Credits != 500 {
		t.Fatalf("order = %#v", order)
	}
	if _, _, err := svc.CreateCustomCreditsOrder(context.Background(), "user-1", 1001, "", "custom-over-limit"); err == nil {
		t.Fatal("over-limit custom credits accepted")
	}
	_, err = admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: false, CustomCreditsEnabled: true, CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 1000}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.CreateCustomCreditsOrder(context.Background(), "user-1", 20, "", "custom-disabled"); err == nil {
		t.Fatal("disabled recharge accepted")
	}
}

func (p *paymentProviderStub) Query(context.Context, string, string) (PaymentResult, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.queryCalls++
	return p.queryResult, p.queryErr
}

func (p *paymentProviderStub) Close(context.Context, string, string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.closeCalls++
	return p.closeErr
}

func TestPaymentServiceUsesServerProductSnapshotAndIdempotency(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	admin := NewPaymentAdminService(backend, []byte(strings.Repeat("k", 32)))
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	channel, _, err := admin.CreateChannel(PaymentChannelInput{Code: "wechat", Name: "微信", Provider: "wechatpay", PaymentMethod: "native", Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 15}, PaymentCredentialsInput{AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32), WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	product, err := admin.CreateProduct(RechargeProductInput{SKU: "credits100", Name: "100 积分", AmountFen: 100, Credits: 100, Enabled: true}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	svc := &PaymentService{backend: backend, key: []byte(strings.Repeat("k", 32)), now: func() time.Time { return time.Date(2026, 8, 30, 1, 2, 3, 0, time.UTC) }}
	stub := &paymentProviderStub{}
	svc.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil }
	svc.BindCredits(NewCreditService(dataDir, backend))
	order, created, err := svc.CreateNativeOrder(context.Background(), "user-1", product.ID, "idem-1")
	if err != nil {
		t.Fatal(err)
	}
	if !created || order.CodeURL != "weixin://code" || order.AmountFen != 100 || order.Credits != 100 || stub.calls != 1 {
		t.Fatalf("first order = %#v created=%v calls=%d", order, created, stub.calls)
	}
	retry, created, err := svc.CreateNativeOrder(context.Background(), "user-1", product.ID, "idem-1")
	if err != nil {
		t.Fatal(err)
	}
	if created || retry.ID != order.ID || stub.calls != 1 {
		t.Fatalf("retry = %#v created=%v calls=%d", retry, created, stub.calls)
	}
	if _, _, err := svc.CreateNativeOrder(context.Background(), "user-1", "missing", "idem-2"); err == nil {
		t.Fatal("missing product accepted")
	}
	if channel.ActiveVersionID == "" {
		t.Fatal("channel version not activated")
	}
	stub.queryResult = PaymentResult{OutTradeNo: order.OutTradeNo, TransactionID: "tx-1", AppID: "wx-app", MerchantID: "mch-1", TradeState: "SUCCESS", TradeStateDesc: "支付成功", Currency: "CNY", SuccessTime: "2026-08-30T01:03:00Z", AmountFen: 100}
	paid, err := svc.QueryOrder(context.Background(), "user-1", order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if paid.Status != storage.PaymentOrderStatusSucceeded {
		t.Fatalf("paid order = %#v", paid)
	}
	account, err := svc.credits.Account("user-1")
	if err != nil {
		t.Fatal(err)
	}
	if balance := account.Balance; balance != 100 {
		t.Fatalf("balance = %d, want 100", balance)
	}
	if _, err := svc.QueryOrder(context.Background(), "other-user", order.ID); err != storage.ErrPaymentRecordNotFound {
		t.Fatalf("cross-user query error = %v", err)
	}
}

func TestPaymentServiceCloudStorageOrderFulfillsEntitlementWithoutCredits(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "storage-payment.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	key := []byte(strings.Repeat("k", 32))
	admin := NewPaymentAdminService(backend, key)
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	_, _, err = admin.CreateChannel(PaymentChannelInput{Code: "wechat", Name: "微信", Provider: "wechatpay", PaymentMethod: "native", Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 15}, PaymentCredentialsInput{AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32), WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	product, err := admin.CreateProduct(RechargeProductInput{SKU: "storage-10g-30d", Name: "10GB 云存储", AmountFen: 500, ProductType: "cloud_storage", StorageDays: 30, StorageBytes: 10 << 30, Enabled: true}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	svc := &PaymentService{backend: backend, key: key, now: func() time.Time { return time.Date(2026, 9, 7, 1, 2, 3, 0, time.UTC) }}
	stub := &paymentProviderStub{expectedAmount: 500, expectedDescription: "10GB 云存储"}
	svc.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil }
	svc.BindCredits(NewCreditService(dataDir, backend))
	if _, _, err := svc.CreateOrder(context.Background(), "user-1", product.ID, "", "storage-disabled"); err == nil {
		t.Fatal("disabled cloud storage order accepted")
	}
	_, err = admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CloudStorageEnabled: true, CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	order, created, err := svc.CreateOrder(context.Background(), "user-1", product.ID, "", "storage-order")
	if err != nil || !created || order.ProductType != "cloud_storage" || order.Credits != 0 || order.StorageBytes != 10<<30 || order.StorageDays != 30 {
		t.Fatalf("order=%#v created=%v err=%v", order, created, err)
	}
	stub.queryResult = PaymentResult{OutTradeNo: order.OutTradeNo, TransactionID: "storage-tx", AppID: "wx-app", MerchantID: "mch-1", TradeState: "SUCCESS", TradeStateDesc: "支付成功", Currency: "CNY", SuccessTime: "2026-09-07T01:03:00Z", AmountFen: 500}
	paid, err := svc.QueryOrder(context.Background(), "user-1", order.ID)
	if err != nil || paid.Status != storage.PaymentOrderStatusSucceeded {
		t.Fatalf("paid=%#v err=%v", paid, err)
	}
	entitlement, err := svc.StorageEntitlement("user-1")
	if err != nil || entitlement.StorageBytes != 10<<30 || entitlement.ExpiresAt == "" {
		t.Fatalf("entitlement=%#v err=%v", entitlement, err)
	}
	account, err := svc.credits.Account("user-1")
	if err != nil || account.Balance != 0 {
		t.Fatalf("cloud storage changed credits: %#v err=%v", account, err)
	}
}

func TestPaymentSettingsRecordsCloudStoragePolicyStartOncePerEnabledPeriod(t *testing.T) {
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "policy-settings.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	admin := NewPaymentAdminService(backend, []byte(strings.Repeat("k", 32)))
	firstStart := time.Date(2026, 9, 7, 1, 0, 0, 0, time.UTC)
	admin.now = func() time.Time { return firstStart }
	if _, err := admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CloudStorageEnabled: true, CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000}, "admin"); err != nil {
		t.Fatal(err)
	}
	first, err := backend.LoadPaymentSettings()
	if err != nil || first.CloudStoragePolicyStartedAt != firstStart.Format(time.RFC3339Nano) {
		t.Fatalf("first settings = %#v, err = %v", first, err)
	}
	admin.now = func() time.Time { return firstStart.Add(time.Hour) }
	if _, err := admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CloudStorageEnabled: true, CreditUnitPriceFen: 5, MinCustomCredits: 10, MaxCustomCredits: 100000}, "admin"); err != nil {
		t.Fatal(err)
	}
	unchanged, _ := backend.LoadPaymentSettings()
	if unchanged.CloudStoragePolicyStartedAt != first.CloudStoragePolicyStartedAt {
		t.Fatalf("active policy start changed from %q to %q", first.CloudStoragePolicyStartedAt, unchanged.CloudStoragePolicyStartedAt)
	}
	if _, err := admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CloudStorageEnabled: false, CreditUnitPriceFen: 5, MinCustomCredits: 10, MaxCustomCredits: 100000}, "admin"); err != nil {
		t.Fatal(err)
	}
	reenabledAt := firstStart.Add(2 * time.Hour)
	admin.now = func() time.Time { return reenabledAt }
	if _, err := admin.UpdateSettings(PaymentSettingsInput{RechargeEnabled: true, CloudStorageEnabled: true, CreditUnitPriceFen: 5, MinCustomCredits: 10, MaxCustomCredits: 100000}, "admin"); err != nil {
		t.Fatal(err)
	}
	reenabled, _ := backend.LoadPaymentSettings()
	if reenabled.CloudStoragePolicyStartedAt != reenabledAt.Format(time.RFC3339Nano) {
		t.Fatalf("re-enabled policy start = %q", reenabled.CloudStoragePolicyStartedAt)
	}
}

func TestValidatePaymentResultRejectsTampering(t *testing.T) {
	order := storage.PaymentOrderRecord{OutTradeNo: "trade", ChannelVersionID: "v1", AmountFen: 100, Currency: "CNY"}
	version := storage.PaymentChannelVersionRecord{ID: "v1", AppID: "wx", MerchantID: "mch"}
	base := PaymentResult{OutTradeNo: "trade", TransactionID: "tx", AppID: "wx", MerchantID: "mch", TradeState: "SUCCESS", Currency: "CNY", SuccessTime: "2026-08-30T01:03:00Z", AmountFen: 100}
	if err := validatePaymentResult(base, order, version); err != nil {
		t.Fatalf("valid result rejected: %v", err)
	}
	tampered := base
	tampered.AmountFen = 1
	if err := validatePaymentResult(tampered, order, version); err == nil {
		t.Fatal("tampered amount accepted")
	}
	tampered = base
	tampered.AppID = "other"
	if err := validatePaymentResult(tampered, order, version); err == nil {
		t.Fatal("tampered app id accepted")
	}
}

func TestPaymentEventShouldProcessRetriesUnfinishedEvents(t *testing.T) {
	for _, status := range []string{storage.PaymentEventStatusPending, storage.PaymentEventStatusFailed} {
		process, err := paymentEventShouldProcess(status)
		if err != nil || !process {
			t.Fatalf("status %q process=%v err=%v, want retry", status, process, err)
		}
	}
	for _, status := range []string{storage.PaymentEventStatusProcessed, storage.PaymentEventStatusIgnored} {
		process, err := paymentEventShouldProcess(status)
		if err != nil || process {
			t.Fatalf("status %q process=%v err=%v, want skip", status, process, err)
		}
	}
	if _, err := paymentEventShouldProcess("unknown"); err == nil {
		t.Fatal("unknown payment event status accepted")
	}
}

func TestValidateWechatNotifyTimestampWindow(t *testing.T) {
	now := time.Date(2026, 8, 30, 1, 2, 3, 0, time.UTC)
	request := httptest.NewRequest("POST", "/notify", nil)
	request.Header.Set("Wechatpay-Timestamp", fmt.Sprint(now.Unix()))
	if err := validateWechatNotifyTimestamp(request, now); err != nil {
		t.Fatalf("current timestamp rejected: %v", err)
	}
	request.Header.Set("Wechatpay-Timestamp", fmt.Sprint(now.Add(-6*time.Minute).Unix()))
	if err := validateWechatNotifyTimestamp(request, now); err == nil {
		t.Fatal("stale timestamp accepted")
	}
}

func TestUnlimitedCloudStorageRenewalAndEntitlementTiers(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "unlimited-vip.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	key := []byte(strings.Repeat("k", 32))
	admin := NewPaymentAdminService(backend, key)
	merchantPrivate, platformPublic := paymentTestPEMs(t)
	if _, _, err := admin.CreateChannel(
		PaymentChannelInput{Code: "wechat", Name: "微信", Provider: "wechatpay", PaymentMethod: "native", Enabled: true, NotifyBaseURL: "https://pay.example.test", OrderExpireMinutes: 15},
		PaymentCredentialsInput{AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivate, APIv3Key: strings.Repeat("a", 32), WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublic},
		"admin",
	); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	svc := &PaymentService{backend: backend, key: key, now: func() time.Time { return now }}
	stub := &paymentProviderStub{expectedAmount: 990, expectedDescription: "30天畅存VIP"}
	svc.provider = func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil }
	svc.BindCredits(NewCreditService(dataDir, backend))
	admin.now = func() time.Time { return now }

	// Create unlimited VIP product (storage_bytes = 0)
	product, err := admin.CreateProduct(RechargeProductInput{
		SKU: "vip-unlimited-30d", Name: "30天畅存VIP", Description: "有效期内不限张数畅存所有生图",
		AmountFen: 990, Enabled: true, ProductType: "cloud_storage", StorageDays: 30, StorageBytes: 0,
	}, "admin")
	if err != nil {
		t.Fatalf("CreateProduct(storage_bytes=0) error = %v", err)
	}
	if product.StorageBytes != 0 || product.StorageDays != 30 {
		t.Fatalf("product = %#v", product)
	}

	// Seed 2 active media assets for user-vip
	for i := 0; i < 2; i++ {
		if err := backend.SaveMediaAsset(storage.MediaAssetRecord{
			ID: fmt.Sprintf("img-%d", i), Path: fmt.Sprintf("img-%d.png", i), OwnerID: "user-vip",
			MediaType: "image", ObjectKey: fmt.Sprintf("obj-%d", i), ContentType: "image/png",
			SizeBytes: 512, Status: "ready", CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano),
		}); err != nil {
			t.Fatal(err)
		}
	}

	// Master switch defaults to false -> tier == "disabled"
	ent, err := svc.StorageEntitlement("user-vip")
	if err != nil {
		t.Fatal(err)
	}
	if ent.CloudStorageEnabled || ent.Tier != storage.StorageTierDisabled || ent.FreeRetentionDays != 3 || ent.VIPGraceDays != 7 || ent.HistoricalGraceDays != 7 || ent.AssetCount != 2 {
		t.Fatalf("initial disabled entitlement = %#v", ent)
	}

	// Enable Cloud Storage master switch -> free user gets tier == "free"
	if _, err := admin.UpdateSettings(PaymentSettingsInput{
		RechargeEnabled: true, CloudStorageEnabled: true, CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000,
	}, "admin"); err != nil {
		t.Fatal(err)
	}
	ent, err = svc.StorageEntitlement("user-vip")
	if err != nil || !ent.CloudStorageEnabled || ent.Tier != storage.StorageTierFree || ent.Unlimited {
		t.Fatalf("free entitlement = %#v err=%v", ent, err)
	}

	payOrder := func(idem, txID string) {
		order, created, createErr := svc.CreateOrder(context.Background(), "user-vip", product.ID, "", idem)
		if createErr != nil || !created {
			t.Fatalf("CreateOrder(%s) created=%v err=%v", idem, created, createErr)
		}
		stub.queryResult = PaymentResult{
			OutTradeNo: order.OutTradeNo, TransactionID: txID, AppID: "wx-app", MerchantID: "mch-1",
			TradeState: "SUCCESS", TradeStateDesc: "支付成功", Currency: "CNY",
			SuccessTime: now.Format(time.RFC3339), AmountFen: 990,
		}
		if _, queryErr := svc.QueryOrder(context.Background(), "user-vip", order.ID); queryErr != nil {
			t.Fatalf("QueryOrder(%s) err=%v", idem, queryErr)
		}
	}

	// 1) Initial 30-day purchase at T0 -> expires T0 + 30d
	payOrder("idem-1", "tx-1")
	wantExp1 := now.AddDate(0, 0, 30).UTC().Format(time.RFC3339Nano)
	wantGrace1 := now.AddDate(0, 0, 37).UTC().Format(time.RFC3339Nano)
	ent, err = svc.StorageEntitlement("user-vip")
	if err != nil || ent.Tier != storage.StorageTierActive || !ent.Unlimited || ent.ExpiresAt != wantExp1 || ent.GraceExpiresAt != wantGrace1 {
		t.Fatalf("active entitlement after order 1 = %#v (want exp %s, grace %s) err=%v", ent, wantExp1, wantGrace1, err)
	}

	// 2) Renewal while active at T0 + 10d -> extends from currentExpiry (T0 + 30d) + 30d = T0 + 60d!
	t0 := now
	now = t0.AddDate(0, 0, 10)
	payOrder("idem-2", "tx-2")
	wantExp2 := t0.AddDate(0, 0, 60).UTC().Format(time.RFC3339Nano)
	ent, err = svc.StorageEntitlement("user-vip")
	if err != nil || ent.Tier != storage.StorageTierActive || !ent.Unlimited || ent.ExpiresAt != wantExp2 {
		t.Fatalf("active renewal entitlement = %#v, want expires_at %s", ent, wantExp2)
	}

	// 3) Advance to T0 + 63d (3 days after expiry, inside 7-day grace!) -> tier == "grace"
	now = t0.AddDate(0, 0, 63)
	ent, err = svc.StorageEntitlement("user-vip")
	if err != nil || ent.Tier != storage.StorageTierGrace || !ent.Unlimited {
		t.Fatalf("grace entitlement = %#v err=%v", ent, err)
	}

	// 4) Renew during grace at T0 + 63d -> extends from max(T0+60d, T0+63d) + 30d = T0 + 93d!
	payOrder("idem-3", "tx-3")
	wantExp3 := t0.AddDate(0, 0, 93).UTC().Format(time.RFC3339Nano)
	ent, err = svc.StorageEntitlement("user-vip")
	if err != nil || ent.Tier != storage.StorageTierActive || !ent.Unlimited || ent.ExpiresAt != wantExp3 {
		t.Fatalf("grace renewal entitlement = %#v, want expires_at %s", ent, wantExp3)
	}

	// 5) Advance past grace (T0 + 105d > T0 + 93d + 7d = T0 + 100d) -> tier == "free"
	now = t0.AddDate(0, 0, 105)
	ent, err = svc.StorageEntitlement("user-vip")
	if err != nil || ent.Tier != storage.StorageTierFree || ent.Unlimited || ent.ExpiresAt != "" {
		t.Fatalf("expired past grace entitlement = %#v err=%v", ent, err)
	}
}
