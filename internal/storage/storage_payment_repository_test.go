package storage

import (
	"errors"
	"testing"
)

func TestPaymentRepositoryListsActiveProductsAndChannels(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	products, err := backend.LoadActiveRechargeProducts()
	if err != nil {
		t.Fatalf("LoadActiveRechargeProducts() error = %v", err)
	}
	if len(products) != 1 || products[0].ID != "product-1" || products[0].AmountFen != 100 || products[0].Credits != 10 {
		t.Fatalf("products = %#v", products)
	}
	channels, err := backend.LoadActivePaymentChannels()
	if err != nil {
		t.Fatalf("LoadActivePaymentChannels() error = %v", err)
	}
	if len(channels) != 0 {
		t.Fatalf("channel without active version must be hidden: %#v", channels)
	}
	if _, err := backend.db.Exec(`UPDATE payment_channels SET enabled = 1, active_version_id = 'version-1' WHERE id = 'channel-1'`); err != nil {
		t.Fatalf("enable channel: %v", err)
	}
	channels, err = backend.LoadActivePaymentChannels()
	if err != nil || len(channels) != 1 || channels[0].ID != "channel-1" || !channels[0].Enabled {
		t.Fatalf("channels = %#v err=%v", channels, err)
	}
	version, err := backend.LoadPaymentChannelVersion("version-1")
	if err != nil || version.MerchantID != "merchant" || version.APIv3KeyCipher != "cipher-2" {
		t.Fatalf("version = %#v err=%v", version, err)
	}
}

func TestPaymentRepositoryArchivesProductWithoutRemovingHistory(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	deleted, err := backend.ArchiveRechargeProduct("product-1", "admin", "2026-08-30T12:00:00Z")
	if err != nil || !deleted {
		t.Fatalf("ArchiveRechargeProduct() deleted=%v err=%v", deleted, err)
	}
	products, err := backend.ListRechargeProducts()
	if err != nil || len(products) != 0 {
		t.Fatalf("archived product still listed: %#v err=%v", products, err)
	}
	if _, err := backend.LoadRechargeProduct("product-1"); !errors.Is(err, ErrPaymentRecordNotFound) {
		t.Fatalf("archived product load error = %v", err)
	}
	var sku, archivedAt string
	if err := backend.db.QueryRow(`SELECT sku, archived_at FROM recharge_products WHERE id = 'product-1'`).Scan(&sku, &archivedAt); err != nil {
		t.Fatal(err)
	}
	if sku != "starter" || archivedAt == "" {
		t.Fatalf("archived row = sku:%q archived_at:%q", sku, archivedAt)
	}
}

func TestPaymentRepositoryCreateOrderIsIdempotent(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	first := paymentRepositoryTestOrder("order-1", "trade-1", "idem-1")
	createdOrder, created, err := backend.CreatePaymentOrder(first)
	if err != nil || !created || createdOrder.ID != first.ID {
		t.Fatalf("first CreatePaymentOrder() = %#v created=%v err=%v", createdOrder, created, err)
	}
	retry := paymentRepositoryTestOrder("order-retry", "trade-retry", "idem-1")
	existing, created, err := backend.CreatePaymentOrder(retry)
	if err != nil || created || existing.ID != first.ID || existing.OutTradeNo != first.OutTradeNo {
		t.Fatalf("retry CreatePaymentOrder() = %#v created=%v err=%v", existing, created, err)
	}
	byID, err := backend.LoadPaymentOrderByID(first.ID)
	if err != nil || byID.IdempotencyKey != "idem-1" {
		t.Fatalf("LoadPaymentOrderByID() = %#v err=%v", byID, err)
	}
	byTrade, err := backend.LoadPaymentOrderByOutTradeNo(first.OutTradeNo)
	if err != nil || byTrade.ID != first.ID {
		t.Fatalf("LoadPaymentOrderByOutTradeNo() = %#v err=%v", byTrade, err)
	}
}

func TestPaymentRepositoryDoesNotMaskOutTradeNoCollisionAsIdempotentRetry(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	first := paymentRepositoryTestOrder("order-1", "trade-1", "idem-1")
	if _, _, err := backend.CreatePaymentOrder(first); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	collision := paymentRepositoryTestOrder("order-2", "trade-1", "idem-2")
	if _, _, err := backend.CreatePaymentOrder(collision); err == nil || errors.Is(err, ErrPaymentRecordNotFound) {
		t.Fatalf("out_trade_no collision error = %v", err)
	}
}

func TestPaymentRepositoryCallbackInboxIsIdempotent(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	event := PaymentEventRecord{
		ID: "event-1", Provider: PaymentProviderWechatPay, ProviderEventID: "provider-event-1",
		ChannelVersionID: "version-1", EventType: "TRANSACTION.SUCCESS",
		OutTradeNo: "trade-1", TransactionID: "wx-1", AmountFen: 100,
		ResourceDigest: "digest", Status: PaymentEventStatusPending, ReceivedAt: "2026-08-30T12:00:00+08:00",
	}
	created, err := backend.InsertPaymentEvent(event)
	if err != nil || !created {
		t.Fatalf("InsertPaymentEvent() created=%v err=%v", created, err)
	}
	event.ID = "event-retry"
	created, err = backend.InsertPaymentEvent(event)
	if err != nil || created {
		t.Fatalf("duplicate InsertPaymentEvent() created=%v err=%v", created, err)
	}
	loaded, err := backend.LoadPaymentEventByProviderEventID("provider-event-1")
	if err != nil || loaded.ID != "event-1" || loaded.Status != PaymentEventStatusPending {
		t.Fatalf("LoadPaymentEventByProviderEventID() = %#v err=%v", loaded, err)
	}
}

func TestPaymentRepositoryRejectsInvalidOrderBeforeDatabaseWrite(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	order := paymentRepositoryTestOrder("order-1", "trade-1", "idem-1")
	order.AmountFen = 0
	if _, _, err := backend.CreatePaymentOrder(order); err == nil {
		t.Fatal("CreatePaymentOrder() accepted zero amount")
	}
}

func TestPaymentRepositoryLifecycleListsDueAndPersistsClose(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	due := paymentRepositoryTestOrder("order-due", "trade-due", "idem-due")
	future := paymentRepositoryTestOrder("order-future", "trade-future", "idem-future")
	future.ExpiresAt = "2026-08-30T13:00:00+08:00"
	if _, _, err := backend.CreatePaymentOrder(due); err != nil {
		t.Fatal(err)
	}
	if _, _, err := backend.CreatePaymentOrder(future); err != nil {
		t.Fatal(err)
	}
	items, err := backend.ListPaymentOrdersDue("2026-08-30T12:01:00+08:00", 10)
	if err != nil || len(items) != 1 || items[0].ID != due.ID {
		t.Fatalf("due orders = %#v err=%v", items, err)
	}
	if err := backend.RecordPaymentOrderQuery(PaymentOrderQueryUpdate{
		OrderID: due.ID, TradeState: "NOTPAY", TradeStateDesc: "未支付",
		LastQueryAt: "2026-08-30T12:01:01+08:00",
	}); err != nil {
		t.Fatal(err)
	}
	if err := backend.MarkPaymentOrderClosing(due.ID, "2026-08-30T12:01:02+08:00", "", ""); err != nil {
		t.Fatal(err)
	}
	if err := backend.MarkPaymentOrderClosed(due.ID, "2026-08-30T12:01:03+08:00", "", ""); err != nil {
		t.Fatal(err)
	}
	stored, err := backend.LoadPaymentOrderByID(due.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != PaymentOrderStatusClosed || stored.ProviderTradeState != "NOTPAY" || stored.QueryAttempts != 1 || stored.ClosedAt == "" {
		t.Fatalf("closed order = %#v", stored)
	}
}

func TestPaymentRepositoryQueryOrdersFiltersAndPages(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	for index, order := range []PaymentOrderRecord{
		paymentRepositoryTestOrder("order-a", "trade-a", "idem-a"),
		paymentRepositoryTestOrder("order-b", "trade-b", "idem-b"),
		paymentRepositoryTestOrder("order-c", "trade-c", "idem-c"),
	} {
		order.CreatedAt = []string{"2026-08-30T01:00:00Z", "2026-08-30T02:00:00Z", "2026-08-30T03:00:00Z"}[index]
		order.UpdatedAt = order.CreatedAt
		order.UserID = []string{"alice", "bob", "alice"}[index]
		if _, _, err := backend.CreatePaymentOrder(order); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := backend.db.Exec(`UPDATE payment_orders SET status = 'succeeded', transaction_id = 'wx-b' WHERE id = 'order-b'`); err != nil {
		t.Fatal(err)
	}
	items, total, err := backend.QueryPaymentOrders(PaymentOrderFilter{Page: 1, PageSize: 1, UserID: "alice"})
	if err != nil || total != 2 || len(items) != 1 || items[0].ID != "order-c" {
		t.Fatalf("alice page = %#v total=%d err=%v", items, total, err)
	}
	items, total, err = backend.QueryPaymentOrders(PaymentOrderFilter{Keyword: "WX-B", Status: PaymentOrderStatusSucceeded})
	if err != nil || total != 1 || len(items) != 1 || items[0].ID != "order-b" {
		t.Fatalf("keyword/status page = %#v total=%d err=%v", items, total, err)
	}
}

func TestCompletePaymentCreditIsAtomicAndIdempotent(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	order := paymentRepositoryTestOrder("order-1", "trade-1", "idem-1")
	if _, _, err := backend.CreatePaymentOrder(order); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	input := PaymentCreditCompletion{
		OrderID: "order-1", TransactionID: "wx-1", MerchantID: "merchant",
		PaidAt: "2026-08-30T12:01:00+08:00", CreditedAt: "2026-08-30T12:01:01+08:00",
		TradeState: "SUCCESS", TradeStateDesc: "支付成功",
		LedgerEntry: CreditLedgerRow{ID: "ledger-1", UserID: "user-1", Delta: 10, BalanceAfter: 10,
			Reason: "payment_recharge", RefID: "order-1", CreatedAt: "2026-08-30T12:01:01+08:00"},
		CreditCoreDocument: map[string]any{"accounts": []any{map[string]any{"user_id": "user-1", "balance": 10}}},
	}
	completed, credited, err := backend.CompletePaymentCredit(input)
	if err != nil || !credited || completed.Status != PaymentOrderStatusSucceeded || completed.TransactionID != "wx-1" {
		t.Fatalf("CompletePaymentCredit() = %#v credited=%v err=%v", completed, credited, err)
	}
	var ledgerCount, receiptCount, documentCount int
	if err := backend.db.QueryRow(`SELECT COUNT(*) FROM credit_ledger WHERE id = 'ledger-1'`).Scan(&ledgerCount); err != nil {
		t.Fatal(err)
	}
	if err := backend.db.QueryRow(`SELECT COUNT(*) FROM payment_credit_receipts WHERE payment_order_id = 'order-1'`).Scan(&receiptCount); err != nil {
		t.Fatal(err)
	}
	if err := backend.db.QueryRow(`SELECT COUNT(*) FROM json_documents WHERE name = 'credits/state.json'`).Scan(&documentCount); err != nil {
		t.Fatal(err)
	}
	if ledgerCount != 1 || receiptCount != 1 || documentCount != 1 {
		t.Fatalf("atomic artifacts counts = ledger:%d receipt:%d document:%d", ledgerCount, receiptCount, documentCount)
	}
	retry, credited, err := backend.CompletePaymentCredit(input)
	if err != nil || credited || retry.Status != PaymentOrderStatusSucceeded {
		t.Fatalf("idempotent retry = %#v credited=%v err=%v", retry, credited, err)
	}
}

func TestCompletePaymentCreditRollsBackWhenCreditDocumentCannotEncode(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	order := paymentRepositoryTestOrder("order-1", "trade-1", "idem-1")
	if _, _, err := backend.CreatePaymentOrder(order); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	input := PaymentCreditCompletion{
		OrderID: "order-1", TransactionID: "wx-1", MerchantID: "merchant",
		PaidAt: "2026-08-30T12:01:00+08:00", CreditedAt: "2026-08-30T12:01:01+08:00",
		LedgerEntry: CreditLedgerRow{ID: "ledger-1", UserID: "user-1", Delta: 10, BalanceAfter: 10,
			Reason: "payment_recharge", RefID: "order-1", CreatedAt: "2026-08-30T12:01:01+08:00"},
		CreditCoreDocument: func() any { return make(chan int) }(),
	}
	if _, _, err := backend.CompletePaymentCredit(input); err == nil {
		t.Fatal("invalid credit document unexpectedly succeeded")
	}
	var orderStatus string
	if err := backend.db.QueryRow(`SELECT status FROM payment_orders WHERE id = 'order-1'`).Scan(&orderStatus); err != nil {
		t.Fatal(err)
	}
	if orderStatus != PaymentOrderStatusCreated {
		t.Fatalf("order status after pre-transaction failure = %q", orderStatus)
	}
}

func paymentRepositoryTestOrder(id, outTradeNo, idempotencyKey string) PaymentOrderRecord {
	return PaymentOrderRecord{
		ID: id, OutTradeNo: outTradeNo, UserID: "user-1", IdempotencyKey: idempotencyKey,
		ChannelID: "channel-1", ChannelVersionID: "version-1", ProductID: "product-1",
		ProductNameSnapshot: "测试套餐", AmountFen: 100, CreditsSnapshot: 10,
		Currency: "CNY", ExpireMinutesSnapshot: 15, ExpiresAt: "2026-08-30T12:00:00+08:00",
		Status: PaymentOrderStatusCreated, CreatedAt: "2026-08-30T11:45:00+08:00", UpdatedAt: "2026-08-30T11:45:00+08:00",
	}
}
