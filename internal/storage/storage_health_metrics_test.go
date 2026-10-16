package storage

import "testing"

func TestDatabaseHealthMetricsCountPendingMediaAndPaymentEvents(t *testing.T) {
	backend := newMediaTestBackend(t)
	for _, asset := range []MediaAssetRecord{
		{ID: "pending", Path: "pending.png", MediaType: "image", ObjectKey: "objects/pending.png", ContentType: "image/png", Visibility: "private", Status: "pending", CreatedAt: "2026-08-31T10:00:00Z", UpdatedAt: "2026-08-31T10:00:00Z"},
		{ID: "ready", Path: "ready.png", MediaType: "image", ObjectKey: "objects/ready.png", ContentType: "image/png", Visibility: "private", Status: "ready", CreatedAt: "2026-08-31T10:00:00Z", UpdatedAt: "2026-08-31T10:00:00Z"},
	} {
		if err := backend.SaveMediaAsset(asset); err != nil {
			t.Fatalf("SaveMediaAsset(%s): %v", asset.ID, err)
		}
	}
	if got, err := backend.CountPendingMediaAssets(); err != nil || got != 1 {
		t.Fatalf("CountPendingMediaAssets() = %d, %v", got, err)
	}

	for _, event := range []PaymentEventRecord{
		{ID: "pending-new", Provider: PaymentProviderAlipay, ProviderEventID: "pending-new", OutTradeNo: "trade-new", Status: PaymentEventStatusPending, ReceivedAt: "2026-08-31T10:00:00Z"},
		{ID: "pending-old", Provider: PaymentProviderAlipay, ProviderEventID: "pending-old", OutTradeNo: "trade-old", Status: PaymentEventStatusPending, ReceivedAt: "2026-08-31T09:00:00Z"},
		{ID: "failed", Provider: PaymentProviderWechatPay, ProviderEventID: "failed", OutTradeNo: "trade-failed", Status: PaymentEventStatusFailed, ReceivedAt: "2026-08-31T08:00:00Z"},
		{ID: "processed", Provider: PaymentProviderWechatPay, ProviderEventID: "processed", OutTradeNo: "trade-processed", Status: PaymentEventStatusProcessed, ReceivedAt: "2026-08-31T07:00:00Z"},
	} {
		if _, err := backend.InsertPaymentEvent(event); err != nil {
			t.Fatalf("InsertPaymentEvent(%s): %v", event.ID, err)
		}
	}
	health, err := backend.PaymentEventHealth()
	if err != nil {
		t.Fatal(err)
	}
	if health.Pending != 2 || health.Failed != 1 || health.OldestPendingAt != "2026-08-31T09:00:00Z" {
		t.Fatalf("PaymentEventHealth() = %#v", health)
	}
}
