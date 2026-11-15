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
	if !item.RechargeEnabled || item.CustomCreditsEnabled || item.CloudStorageEnabled ||
		item.FreeRetentionDays != 3 || item.VIPGraceDays != 7 || item.HistoricalGraceDays != 7 ||
		item.CreditUnitPriceFen != 4 || item.MinCustomCredits != 10 || item.MaxCustomCredits != 100000 {
		t.Fatalf("defaults = %#v", item)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	updated, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled: false, CustomCreditsEnabled: true, CloudStorageEnabled: true,
		FreeRetentionDays: 5, VIPGraceDays: 14, HistoricalGraceDays: 10,
		CreditUnitPriceFen: 5, MinCustomCredits: 20, MaxCustomCredits: 2000, UpdatedBy: "admin", UpdatedAt: startedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.RechargeEnabled || !updated.CustomCreditsEnabled || !updated.CloudStorageEnabled ||
		updated.FreeRetentionDays != 5 || updated.VIPGraceDays != 14 || updated.HistoricalGraceDays != 10 ||
		updated.CreditUnitPriceFen != 5 || updated.CloudStoragePolicyStartedAt != startedAt {
		t.Fatalf("updated = %#v", updated)
	}
	preserved, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled: true, CustomCreditsEnabled: true, CloudStorageEnabled: true,
		CreditUnitPriceFen: 6, MinCustomCredits: 20, MaxCustomCredits: 2000, UpdatedBy: "admin", UpdatedAt: startedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if preserved.FreeRetentionDays != 5 || preserved.VIPGraceDays != 14 || preserved.HistoricalGraceDays != 10 {
		t.Fatalf("zero-value update clobbered persisted retention days: %#v", preserved)
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


func TestPaymentSettingsCloudStoragePolicyStartedAtTransitionSemantics(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()

	t1 := "2026-09-01T10:00:00Z"
	firstEnable, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled: true, CustomCreditsEnabled: false, CloudStorageEnabled: true,
		FreeRetentionDays: 3, VIPGraceDays: 7, HistoricalGraceDays: 7,
		CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000,
		UpdatedBy: "admin", UpdatedAt: t1,
	})
	if err != nil {
		t.Fatalf("first enable SavePaymentSettings() error = %v", err)
	}
	if !firstEnable.CloudStorageEnabled || firstEnable.CloudStoragePolicyStartedAt != t1 {
		t.Fatalf("after 0->1 transition = %#v, want started_at=%q", firstEnable, t1)
	}

	t2 := "2026-09-02T10:00:00Z"
	stillEnabled, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled: true, CustomCreditsEnabled: true, CloudStorageEnabled: true,
		FreeRetentionDays: 5, VIPGraceDays: 7, HistoricalGraceDays: 7,
		CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000,
		UpdatedBy: "admin", UpdatedAt: t2,
	})
	if err != nil {
		t.Fatalf("1->1 SavePaymentSettings() error = %v", err)
	}
	if !stillEnabled.CloudStorageEnabled || stillEnabled.CloudStoragePolicyStartedAt != t1 {
		t.Fatalf("after 1->1 transition = %#v, want preserved started_at=%q", stillEnabled, t1)
	}

	t3 := "2026-09-03T10:00:00Z"
	disabled, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled: true, CustomCreditsEnabled: true, CloudStorageEnabled: false,
		FreeRetentionDays: 5, VIPGraceDays: 7, HistoricalGraceDays: 7,
		CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000,
		UpdatedBy: "admin", UpdatedAt: t3,
	})
	if err != nil {
		t.Fatalf("1->0 SavePaymentSettings() error = %v", err)
	}
	if disabled.CloudStorageEnabled || disabled.CloudStoragePolicyStartedAt != t1 {
		t.Fatalf("after 1->0 transition = %#v, want disabled with preserved started_at=%q", disabled, t1)
	}

	t4 := "2026-09-04T10:00:00Z"
	reEnabled, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled: true, CustomCreditsEnabled: true, CloudStorageEnabled: true,
		FreeRetentionDays: 5, VIPGraceDays: 7, HistoricalGraceDays: 7,
		CreditUnitPriceFen: 4, MinCustomCredits: 10, MaxCustomCredits: 100000,
		UpdatedBy: "admin", UpdatedAt: t4,
	})
	if err != nil {
		t.Fatalf("second 0->1 SavePaymentSettings() error = %v", err)
	}
	if !reEnabled.CloudStorageEnabled || reEnabled.CloudStoragePolicyStartedAt != t4 {
		t.Fatalf("after second 0->1 transition = %#v, want refreshed started_at=%q", reEnabled, t4)
	}
}

func TestPaymentStatsClampsCrossMidnightSuccessRateAndComputesLast30Days(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	// Order 1: created yesterday at 23:55+08:00, paid today at 00:02+08:00.
	crossMidnight := paymentRepositoryTestOrder("stats-cross-1", "stats-cross-trade-1", "stats-cross-idem-1")
	crossMidnight.Status = PaymentOrderStatusSucceeded
	crossMidnight.CreatedAt = "2026-08-29T15:55:00Z"
	crossMidnight.PaidAt = "2026-08-29T16:02:00Z"
	crossMidnight.UpdatedAt = crossMidnight.PaidAt
	if _, _, err := backend.CreatePaymentOrder(crossMidnight); err != nil {
		t.Fatal(err)
	}

	// Order 2: created today and paid today -> Today has TotalOrders=1, SucceededOrders=2!
	todayOrder := paymentRepositoryTestOrder("stats-cross-2", "stats-cross-trade-2", "stats-cross-idem-2")
	todayOrder.Status = PaymentOrderStatusSucceeded
	todayOrder.CreatedAt = "2026-08-29T17:00:00Z"
	todayOrder.PaidAt = "2026-08-29T17:05:00Z"
	todayOrder.UpdatedAt = todayOrder.PaidAt
	if _, _, err := backend.CreatePaymentOrder(todayOrder); err != nil {
		t.Fatal(err)
	}

	// Order 3: 20 days ago -> included in Last30Days and AllTime, excluded from Last7Days.
	twentyDaysAgo := paymentRepositoryTestOrder("stats-20d", "stats-20d-trade", "stats-20d-idem")
	twentyDaysAgo.UserID = "user-2"
	twentyDaysAgo.Status = PaymentOrderStatusSucceeded
	twentyDaysAgo.CreatedAt = "2026-08-10T10:00:00Z"
	twentyDaysAgo.PaidAt = "2026-08-10T10:01:00Z"
	twentyDaysAgo.UpdatedAt = twentyDaysAgo.PaidAt
	if _, _, err := backend.CreatePaymentOrder(twentyDaysAgo); err != nil {
		t.Fatal(err)
	}

	stats, err := backend.LoadPaymentStats("2026-08-30T12:00:00+08:00")
	if err != nil {
		t.Fatal(err)
	}
	if stats.Today.TotalOrders != 1 || stats.Today.SucceededOrders != 2 || stats.Today.SuccessRate != 100 {
		t.Fatalf("cross-midnight today stats = %#v, want total=1 succeeded=2 rate=100", stats.Today)
	}
	if stats.Last7Days.SucceededOrders != 2 || stats.Last7Days.SucceededAmountFen != 200 {
		t.Fatalf("last_7_days = %#v, want 2 orders / 200 fen", stats.Last7Days)
	}
	if stats.Last30Days.SucceededOrders != 3 || stats.Last30Days.SucceededAmountFen != 300 {
		t.Fatalf("last_30_days = %#v, want 3 orders / 300 fen", stats.Last30Days)
	}
	paidUsers, err := backend.CountPaidUsers()
	if err != nil {
		t.Fatal(err)
	}
	if paidUsers != 2 {
		t.Fatalf("paidUsers = %d, want 2", paidUsers)
	}
}
