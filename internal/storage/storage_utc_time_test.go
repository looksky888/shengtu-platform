package storage

import "testing"

func TestPaymentQueriesIncludeFirstSecondFractionalUTCTimestamps(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	// 2026-08-30T16:00:00.500Z == 2026-08-31 00:00:00.500 Asia/Shanghai (first second of Aug 31 CST).
	orderAug31 := paymentRepositoryTestOrder("order-aug31-subsec", "trade-aug31-subsec", "idem-aug31-subsec")
	orderAug31.Status = PaymentOrderStatusSucceeded
	orderAug31.CreatedAt = "2026-08-30T16:00:00.500Z"
	orderAug31.PaidAt = "2026-08-30T16:00:00.500Z"
	orderAug31.UpdatedAt = "2026-08-30T16:00:00.500Z"
	if _, _, err := backend.CreatePaymentOrder(orderAug31); err != nil {
		t.Fatalf("seed Aug31 order: %v", err)
	}

	// 2026-08-31T16:00:00.500Z == 2026-09-01 00:00:00.500 Asia/Shanghai (first second of Sep 1 CST).
	orderSep01 := paymentRepositoryTestOrder("order-sep01-subsec", "trade-sep01-subsec", "idem-sep01-subsec")
	orderSep01.Status = PaymentOrderStatusSucceeded
	orderSep01.CreatedAt = "2026-08-31T16:00:00.500Z"
	orderSep01.PaidAt = "2026-08-31T16:00:00.500Z"
	orderSep01.UpdatedAt = "2026-08-31T16:00:00.500Z"
	if _, _, err := backend.CreatePaymentOrder(orderSep01); err != nil {
		t.Fatalf("seed Sep01 order: %v", err)
	}

	// 1. Reconciliation window for 2026-08-31 CST: [2026-08-30T16:00:00Z, 2026-08-31T16:00:00Z)
	reconciled, err := backend.ListSucceededPaymentOrdersForReconciliation(
		"channel-1",
		"2026-08-30T16:00:00Z",
		"2026-08-31T16:00:00Z",
	)
	if err != nil {
		t.Fatalf("ListSucceededPaymentOrdersForReconciliation() error = %v", err)
	}
	if len(reconciled) != 1 || reconciled[0].ID != "order-aug31-subsec" {
		t.Fatalf("reconciled orders for 2026-08-31 CST = %#v, want only [order-aug31-subsec]", reconciled)
	}

	// 2. Payment stats evaluated during 2026-08-31 CST must count order-aug31-subsec in Today and exclude order-sep01-subsec.
	stats, err := backend.LoadPaymentStats("2026-08-31T12:00:00+08:00")
	if err != nil {
		t.Fatalf("LoadPaymentStats() error = %v", err)
	}
	if stats.Today.TotalOrders != 1 || stats.Today.SucceededOrders != 1 || stats.Today.SucceededAmountFen != 100 {
		t.Fatalf("LoadPaymentStats(2026-08-31) Today = %#v, want 1 succeeded order (100 fen)", stats.Today)
	}

	// 3. QueryPaymentOrders for [2026-08-30T16:00:00Z, 2026-08-31T15:59:59.999999999Z]
	queried, total, err := backend.QueryPaymentOrders(PaymentOrderFilter{
		StartAt: "2026-08-30T16:00:00Z",
		EndAt:   "2026-08-31T15:59:59.999999999Z",
	})
	if err != nil {
		t.Fatalf("QueryPaymentOrders() error = %v", err)
	}
	if total != 1 || len(queried) != 1 || queried[0].ID != "order-aug31-subsec" {
		t.Fatalf("QueryPaymentOrders(2026-08-31 CST) = %#v total=%d, want only [order-aug31-subsec]", queried, total)
	}
}
