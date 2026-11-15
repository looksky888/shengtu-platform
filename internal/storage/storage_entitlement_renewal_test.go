package storage

import (
	"fmt"
	"testing"
	"time"
)

func TestCloudStorageRenewalDoesNotInflateBytesAndPreservesAuditTrail(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()
	seedPaymentSchemaParents(t, backend.db)

	if _, err := backend.SavePaymentSettings(PaymentSettingsRecord{
		RechargeEnabled:      true,
		CustomCreditsEnabled: false,
		CloudStorageEnabled:  true,
		FreeRetentionDays:    3,
		VIPGraceDays:         7,
		HistoricalGraceDays:  7,
		CreditUnitPriceFen:   4,
		MinCustomCredits:     10,
		MaxCustomCredits:     100000,
		UpdatedBy:            "admin",
		UpdatedAt:            "2026-09-01T00:00:00Z",
	}); err != nil {
		t.Fatalf("SavePaymentSettings: %v", err)
	}

	const gb = int64(1 << 30)
	day0 := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)

	buyPlan := func(seq int, userID string, at time.Time, days int, storageBytes int64) {
		t.Helper()
		ts := at.UTC().Format(time.RFC3339Nano)
		orderID := fmt.Sprintf("ord-%s-%d", userID, seq)
		order := PaymentOrderRecord{
			ID:                    orderID,
			OutTradeNo:            fmt.Sprintf("trade-%s-%d", userID, seq),
			UserID:                userID,
			IdempotencyKey:        fmt.Sprintf("idem-%s-%d", userID, seq),
			ChannelID:             "channel-1",
			ChannelVersionID:      "version-1",
			ProductID:             "product-1",
			ProductNameSnapshot:   "Cloud Storage",
			AmountFen:             990,
			CreditsSnapshot:       1,
			ProductTypeSnapshot:   "cloud_storage",
			StorageDaysSnapshot:   days,
			StorageBytesSnapshot:  storageBytes,
			Currency:              "CNY",
			ExpireMinutesSnapshot: 15,
			ExpiresAt:             at.Add(15 * time.Minute).UTC().Format(time.RFC3339Nano),
			Status:                PaymentOrderStatusCreated,
			CreatedAt:             ts,
			UpdatedAt:             ts,
		}
		if _, _, err := backend.CreatePaymentOrder(order); err != nil {
			t.Fatalf("CreatePaymentOrder(%s): %v", orderID, err)
		}
		_, applied, err := backend.CompletePaymentStorage(PaymentStorageCompletion{
			OrderID:       orderID,
			Provider:      PaymentProviderWechatPay,
			TransactionID: fmt.Sprintf("wx-%s-%d", userID, seq),
			MerchantID:    "merchant",
			PaidAt:        ts,
			CreditedAt:    ts,
			TradeState:    "SUCCESS",
			Entitlement: PaymentStorageEntitlementRecord{
				ID:            fmt.Sprintf("ent-%s-%d", userID, seq),
				UserID:        userID,
				SourceOrderID: orderID,
				ProductID:     order.ProductID,
				StorageBytes:  storageBytes,
				CreatedAt:     ts,
				UpdatedAt:     ts,
			},
		})
		if err != nil || !applied {
			t.Fatalf("CompletePaymentStorage(%s) applied=%v err=%v", orderID, applied, err)
		}
	}

	// 1. Renewing 10GB + 10GB + 10GB (3x 30d) must grant 10GB for 90 days, NEVER 30GB!
	buyPlan(1, "user-renew", day0, 30, 10*gb)
	buyPlan(2, "user-renew", day0.Add(time.Hour), 30, 10*gb)
	buyPlan(3, "user-renew", day0.Add(2*time.Hour), 30, 10*gb)

	var auditCount int
	if err := backend.reader().QueryRow(`SELECT COUNT(*) FROM user_storage_entitlements WHERE user_id = 'user-renew'`).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount != 3 {
		t.Fatalf("expected all 3 purchase audit rows preserved in user_storage_entitlements, got %d", auditCount)
	}

	checkAt := day0.Add(3 * time.Hour).UTC().Format(time.RFC3339Nano)
	summary, err := backend.LoadActiveStorageEntitlement("user-renew", checkAt)
	if err != nil {
		t.Fatalf("LoadActiveStorageEntitlement(user-renew): %v", err)
	}
	wantDay90 := day0.AddDate(0, 0, 90).UTC().Format(time.RFC3339Nano)
	if summary.Unlimited || summary.StorageBytes != 10*gb || summary.ExpiresAt != wantDay90 {
		t.Fatalf("renew summary = %+v, want StorageBytes=%d ExpiresAt=%s Unlimited=false", summary, 10*gb, wantDay90)
	}

	// Capacity enforcement must also see 10GB, rejecting an 11GB reservation.
	_, limited, allowed, _, totalCap, err := backend.ReserveStorageCapacity("user-renew", checkAt, 11*gb, 60)
	if err != nil || !limited || allowed || totalCap != 10*gb {
		t.Fatalf("ReserveStorageCapacity(11GB on 3x10GB renewal) = limited:%v allowed:%v total:%d err:%v", limited, allowed, totalCap, err)
	}

	// 2. Upgrading 10GB / 30d -> 50GB / 30d grants 50GB until Day 60.
	buyPlan(1, "user-upgrade", day0, 30, 10*gb)
	buyPlan(2, "user-upgrade", day0.Add(time.Hour), 30, 50*gb)
	upSummary, err := backend.LoadActiveStorageEntitlement("user-upgrade", checkAt)
	if err != nil {
		t.Fatal(err)
	}
	wantDay60 := day0.AddDate(0, 0, 60).UTC().Format(time.RFC3339Nano)
	if upSummary.Unlimited || upSummary.StorageBytes != 50*gb || upSummary.ExpiresAt != wantDay60 {
		t.Fatalf("upgrade summary = %+v, want 50GB until %s", upSummary, wantDay60)
	}

	// 3. Extending duration-only (0B / 30d) while holding 10GB keeps 10GB until Day 60.
	buyPlan(1, "user-extend", day0, 30, 10*gb)
	buyPlan(2, "user-extend", day0.Add(time.Hour), 30, 0)
	extSummary, err := backend.LoadActiveStorageEntitlement("user-extend", checkAt)
	if err != nil {
		t.Fatal(err)
	}
	if extSummary.Unlimited || extSummary.StorageBytes != 10*gb || extSummary.ExpiresAt != wantDay60 {
		t.Fatalf("duration-extension summary = %+v, want 10GB (Unlimited=false) until %s", extSummary, wantDay60)
	}
}

func TestAPIKeyLimitWholeSecondNanosecondSortingAndGlobalPrune(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()

	// Seed an abandoned key event 5 days ago; reserving on another key must prune it.
	oldTime := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	if _, _, _, err := backend.ReserveAPIKeyLimit("abandoned-key", oldTime.Format(time.RFC3339Nano), "2026-09-01", 10, 10, 10, 60); err != nil {
		t.Fatal(err)
	}

	// Hit at exact whole second T01:00:00Z (0 ns), then query 90s later at T01:01:30.500Z (rpm=1).
	// Before fixed-width 9-digit formatting, "T01:00:30Z" vs ".500000000Z" could invert lexical order.
	wholeSec := time.Date(2026, 9, 7, 1, 0, 30, 0, time.UTC)
	id1, _, reason1, err := backend.ReserveAPIKeyLimit("active-key", wholeSec.Format(time.RFC3339), "2026-09-07", 1, 10, 10, 60)
	if err != nil || id1 == "" || reason1 != "" {
		t.Fatalf("first reserve = (%q, %q, %v)", id1, reason1, err)
	}
	_ = backend.ReleaseAPIKeyLimit(id1)

	// 60.5s later: cutoff is T01:00:30.500000000Z, which is strictly AFTER T01:00:30.000000000Z,
	// so rpm=1 window must allow the new request!
	afterWindow := wholeSec.Add(60*time.Second + 500*time.Millisecond)
	id2, _, reason2, err := backend.ReserveAPIKeyLimit("active-key", afterWindow.Format(time.RFC3339Nano), "2026-09-07", 1, 10, 10, 60)
	if err != nil || id2 == "" || reason2 != "" {
		t.Fatalf("reserve after 60.5s window = (%q, %q, %v), want allowed", id2, reason2, err)
	}

	var abandonedLeft int
	if err := backend.reader().QueryRow(`SELECT COUNT(*) FROM api_key_limit_events WHERE key_id = 'abandoned-key'`).Scan(&abandonedLeft); err != nil {
		t.Fatal(err)
	}
	if abandonedLeft != 0 {
		t.Fatalf("expected global prune to delete expired abandoned-key rows, still have %d", abandonedLeft)
	}
}
