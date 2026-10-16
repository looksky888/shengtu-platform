package service

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type paymentRecoveryFixture struct {
	service *PaymentService
	stub    *paymentProviderStub
	order   PaymentOrderPublic
	now     *time.Time
}

func newPaymentRecoveryFixture(t *testing.T) paymentRecoveryFixture {
	t.Helper()
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment.db")))
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
	service := &PaymentService{
		backend: backend, key: key, now: func() time.Time { return now },
		provider: func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error) { return stub, nil },
	}
	service.BindCredits(NewCreditService(dataDir, backend))
	order, _, err := service.CreateNativeOrder(context.Background(), "user-1", product.ID, "idem-recovery")
	if err != nil {
		t.Fatal(err)
	}
	stub.queryResult = PaymentResult{
		OutTradeNo: order.OutTradeNo, AppID: "wx-app", MerchantID: "mch-1",
		TradeState: "NOTPAY", TradeStateDesc: "未支付", Currency: "CNY", AmountFen: 100,
	}
	return paymentRecoveryFixture{service: service, stub: stub, order: order, now: &now}
}

func TestPaymentQueryDoesNotCloseUnexpiredOrder(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	item, err := fixture.service.QueryOrder(context.Background(), "user-1", fixture.order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if item.Status != storage.PaymentOrderStatusPending || fixture.stub.closeCalls != 0 {
		t.Fatalf("order = %#v close calls = %d", item, fixture.stub.closeCalls)
	}
}

func TestPaymentRecoveryQueriesBeforeClosingExpiredOrder(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	summary, err := fixture.service.RecoverDueOrders(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 1 || summary.Closed != 1 || fixture.stub.queryCalls != 1 || fixture.stub.closeCalls != 1 {
		t.Fatalf("summary = %#v query=%d close=%d", summary, fixture.stub.queryCalls, fixture.stub.closeCalls)
	}
	stored, err := fixture.service.backend.LoadPaymentOrderByID(fixture.order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != storage.PaymentOrderStatusClosed || stored.CodeURL != "" || stored.QueryAttempts != 1 || stored.ClosedAt == "" {
		t.Fatalf("stored order = %#v", stored)
	}
}

func TestPaymentRecoveryClosesExpiredTradeThatProviderHasNotCreated(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	fixture.stub.queryResult = PaymentResult{
		Provider: storage.PaymentProviderAlipay, OutTradeNo: fixture.order.OutTradeNo,
		TradeState: "NOTPAY", TradeStateDesc: "交易尚未创建（ACQ.TRADE_NOT_EXIST）", NotFound: true,
	}
	summary, err := fixture.service.RecoverDueOrders(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Closed != 1 || fixture.stub.closeCalls != 1 {
		t.Fatalf("summary = %#v close calls = %d", summary, fixture.stub.closeCalls)
	}
	stored, err := fixture.service.backend.LoadPaymentOrderByID(fixture.order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != storage.PaymentOrderStatusClosed || stored.ProviderTradeState != "NOTPAY" || stored.LastErrorCode != "" {
		t.Fatalf("stored missing trade order = %#v", stored)
	}
}

func TestPaymentProviderDisplayNameMatchesRuntimeProvider(t *testing.T) {
	if got := paymentProviderDisplayName(storage.PaymentProviderAlipay); got != "支付宝" {
		t.Fatalf("alipay label = %q", got)
	}
	if got := paymentProviderDisplayName(storage.PaymentProviderWechatPay); got != "微信支付" {
		t.Fatalf("wechat label = %q", got)
	}
}

func TestPaymentRecoveryCreditsSuccessfulExpiredOrderWithoutClosing(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	fixture.stub.queryResult.TradeState = "SUCCESS"
	fixture.stub.queryResult.TradeStateDesc = "支付成功"
	fixture.stub.queryResult.TransactionID = "wx-recovery-1"
	fixture.stub.queryResult.SuccessTime = fixture.now.Add(-time.Minute).Format(time.RFC3339)
	summary, err := fixture.service.RecoverDueOrders(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Succeeded != 1 || fixture.stub.closeCalls != 0 {
		t.Fatalf("summary = %#v close=%d", summary, fixture.stub.closeCalls)
	}
	account, err := fixture.service.credits.Account("user-1")
	if err != nil || account.Balance != 100 {
		t.Fatalf("account = %#v err=%v", account, err)
	}
}

func TestPaymentRecoveryRetriesFailedClose(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	fixture.stub.closeErr = errors.New("provider unavailable")
	summary, err := fixture.service.RecoverDueOrders(context.Background(), 10)
	if err == nil || summary.Failed != 1 {
		t.Fatalf("summary = %#v err=%v", summary, err)
	}
	stored, err := fixture.service.backend.LoadPaymentOrderByID(fixture.order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != storage.PaymentOrderStatusClosing || stored.LastErrorCode != "close_failed" {
		t.Fatalf("failed close order = %#v", stored)
	}
	fixture.stub.closeErr = nil
	*fixture.now = fixture.now.Add(time.Minute)
	summary, err = fixture.service.RecoverDueOrders(context.Background(), 10)
	if err != nil || summary.Closed != 1 {
		t.Fatalf("retry summary = %#v err=%v", summary, err)
	}
}

func TestPaymentRecoveryRejectsMismatchedQueryBeforeClosing(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	fixture.stub.queryResult.MerchantID = "other-merchant"
	summary, err := fixture.service.RecoverDueOrders(context.Background(), 10)
	if err == nil || summary.Failed != 1 || fixture.stub.closeCalls != 0 {
		t.Fatalf("summary = %#v close=%d err=%v", summary, fixture.stub.closeCalls, err)
	}
	stored, loadErr := fixture.service.backend.LoadPaymentOrderByID(fixture.order.ID)
	if loadErr != nil {
		t.Fatal(loadErr)
	}
	if stored.Status != storage.PaymentOrderStatusPending || stored.LastErrorCode != "query_result_invalid" {
		t.Fatalf("mismatched query order = %#v", stored)
	}
}

func TestPaymentRecoveryStartsImmediatelyAndStopsWithContext(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	ctx, cancel := context.WithCancel(context.Background())
	observed := make(chan PaymentRecoverySummary, 1)
	fixture.service.StartRecovery(ctx, time.Hour, 10, func(summary PaymentRecoverySummary, _ error) {
		observed <- summary
	})
	select {
	case summary := <-observed:
		if summary.Closed != 1 {
			t.Fatalf("startup recovery summary = %#v", summary)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("startup payment recovery did not run")
	}
	cancel()
	closeCtx, closeCancel := context.WithTimeout(context.Background(), time.Second)
	defer closeCancel()
	if err := fixture.service.Close(closeCtx); err != nil {
		t.Fatal(err)
	}
}

func TestPaymentRecoverySerializesSameOrder(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	*fixture.now = fixture.now.Add(6 * time.Minute)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = fixture.service.RecoverDueOrders(context.Background(), 10)
		}()
	}
	wg.Wait()
	if fixture.stub.queryCalls != 1 || fixture.stub.closeCalls != 1 {
		t.Fatalf("same order calls query=%d close=%d", fixture.stub.queryCalls, fixture.stub.closeCalls)
	}
}

func TestPaymentAdminQueriesOrdersWithStableContract(t *testing.T) {
	fixture := newPaymentRecoveryFixture(t)
	admin := NewPaymentAdminService(fixture.service.backend.(storage.PaymentAdminBackend), fixture.service.key)
	page, err := admin.QueryOrders(PaymentOrderAdminQuery{Page: 1, PageSize: 10, UserID: "user-1"})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || page.Page != 1 || page.PageSize != 10 || len(page.Items) != 1 || page.Items[0].ID != fixture.order.ID {
		t.Fatalf("admin order page = %#v", page)
	}
	if _, err := admin.QueryOrders(PaymentOrderAdminQuery{Status: "invented"}); err == nil {
		t.Fatal("invalid payment status accepted")
	}
	if _, err := admin.QueryOrders(PaymentOrderAdminQuery{StartAt: "not-a-time"}); err == nil {
		t.Fatal("invalid payment time accepted")
	}
}
