package storage

import (
	"testing"
	"time"
)

func TestPaymentSettingsDefaultsAndUpdate(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	item, err := backend.LoadPaymentSettings()
	if err != nil {
		t.Fatal(err)
	}
	if !item.RechargeEnabled || item.CustomCreditsEnabled || item.CloudStorageEnabled || item.CreditUnitPriceFen != 4 || item.MinCustomCredits != 10 || item.MaxCustomCredits != 100000 {
		t.Fatalf("defaults = %#v", item)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	updated, err := backend.SavePaymentSettings(PaymentSettingsRecord{RechargeEnabled: false, CustomCreditsEnabled: true, CloudStorageEnabled: true, CreditUnitPriceFen: 5, MinCustomCredits: 20, MaxCustomCredits: 2000, UpdatedBy: "admin", UpdatedAt: startedAt})
	if err != nil {
		t.Fatal(err)
	}
	if updated.RechargeEnabled || !updated.CustomCreditsEnabled || !updated.CloudStorageEnabled || updated.CreditUnitPriceFen != 5 || updated.CloudStoragePolicyStartedAt != startedAt {
		t.Fatalf("updated = %#v", updated)
	}
}

func TestPaymentStatsOnlyCountsSucceededAmount(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)
	now := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	for index, status := range []string{PaymentOrderStatusSucceeded, PaymentOrderStatusPending, PaymentOrderStatusFailed, PaymentOrderStatusClosed, PaymentOrderStatusException} {
		order := paymentRepositoryTestOrder("stats-order-"+string(rune('a'+index)), "stats-trade-"+string(rune('a'+index)), "stats-idem-"+string(rune('a'+index)))
		order.Status, order.CreatedAt, order.UpdatedAt = status, now.Add(-time.Hour).Format(time.RFC3339Nano), now.Add(-time.Hour).Format(time.RFC3339Nano)
		if status == PaymentOrderStatusSucceeded {
			order.PaidAt = now.Add(-30 * time.Minute).Format(time.RFC3339Nano)
		}
		if _, _, err := backend.CreatePaymentOrder(order); err != nil {
			t.Fatal(err)
		}
	}
	stats, err := backend.LoadPaymentStats(now.Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}
	if stats.Today.TotalOrders != 5 || stats.Today.SucceededOrders != 1 || stats.Today.FailedOrders != 2 || stats.Today.ClosedOrders != 1 || stats.Today.SucceededAmountFen != 100 || stats.Today.SuccessRate != 20 {
		t.Fatalf("stats = %#v", stats.Today)
	}
	if len(stats.DailyTrend) != 7 || stats.DailyTrend[6].Date != "2026-08-30" || stats.DailyTrend[6].SucceededAmountFen != 100 {
		t.Fatalf("daily trend = %#v", stats.DailyTrend)
	}
	if len(stats.ChannelBreakdown) != 1 || stats.ChannelBreakdown[0].ChannelID != "channel-1" || stats.ChannelBreakdown[0].TotalOrders != 5 || stats.ChannelBreakdown[0].SuccessRate != 20 {
		t.Fatalf("channel breakdown = %#v", stats.ChannelBreakdown)
	}
}

func TestPaymentStatsUsesAsiaShanghaiDayBoundaries(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	order := paymentRepositoryTestOrder("stats-boundary", "stats-boundary-trade", "stats-boundary-idem")
	order.Status = PaymentOrderStatusSucceeded
	order.CreatedAt = "2026-08-30T16:30:00Z"
	order.PaidAt = order.CreatedAt
	order.UpdatedAt = order.CreatedAt
	if _, _, err := backend.CreatePaymentOrder(order); err != nil {
		t.Fatal(err)
	}

	stats, err := backend.LoadPaymentStats("2026-08-31T01:00:00+08:00")
	if err != nil {
		t.Fatal(err)
	}
	if stats.Today.TotalOrders != 1 || stats.Today.SucceededOrders != 1 || stats.DailyTrend[6].Date != "2026-08-31" {
		t.Fatalf("Asia/Shanghai boundary stats = %#v, trend = %#v", stats.Today, stats.DailyTrend)
	}
}
