package service

import (
	"context"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestCleanupExpiredRemoteMediaRespectsPolicyStartAndEntitlement(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Now().UTC()
	policyStart := now.AddDate(0, 0, -10).Format(time.RFC3339Nano)
	assets := []storage.MediaAssetRecord{
		{ID: "historical", Path: "historical.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/historical.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: now.AddDate(0, 0, -20).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)},
		{ID: "free-expired", Path: "free-expired.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/free-expired.png", ThumbnailKey: "thumbnails/free-expired.webp", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: now.AddDate(0, 0, -7).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)},
		{ID: "paid-expired", Path: "paid-expired.png", OwnerID: "paid-user", MediaType: "image", ObjectKey: "images/paid-expired.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: now.AddDate(0, 0, -7).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)},
	}
	for _, asset := range assets {
		if err := repo.SaveMediaAsset(asset); err != nil {
			t.Fatal(err)
		}
		objects.data[asset.ObjectKey] = []byte("image")
		if asset.ThumbnailKey != "" {
			objects.data[asset.ThumbnailKey] = []byte("thumbnail")
		}
	}

	createdAt := now.Format(time.RFC3339Nano)
	order := storage.PaymentOrderRecord{ID: "storage-order", OutTradeNo: "storage-trade", UserID: "paid-user", IdempotencyKey: "storage-idempotency", ChannelID: "channel", ChannelVersionID: "channel-version", ProductID: "storage-product", ProductNameSnapshot: "storage", AmountFen: 100, CreditsSnapshot: 1, ProductTypeSnapshot: "cloud_storage", StorageDaysSnapshot: 30, StorageBytesSnapshot: 1024, Currency: "CNY", ExpireMinutesSnapshot: 15, ExpiresAt: now.Add(time.Hour).Format(time.RFC3339Nano), Status: storage.PaymentOrderStatusPending, CreatedAt: createdAt, UpdatedAt: createdAt}
	if _, _, err := repo.CreatePaymentOrder(order); err != nil {
		t.Fatal(err)
	}
	completion := storage.PaymentStorageCompletion{OrderID: order.ID, Provider: storage.PaymentProviderWechatPay, TransactionID: "storage-transaction", MerchantID: "merchant", PaidAt: createdAt, CreditedAt: createdAt, TradeState: "SUCCESS", Entitlement: storage.PaymentStorageEntitlementRecord{ID: "entitlement", UserID: order.UserID, SourceOrderID: order.ID, ProductID: order.ProductID, StorageBytes: order.StorageBytesSnapshot, CreatedAt: createdAt, UpdatedAt: createdAt}}
	if _, applied, err := repo.CompletePaymentStorage(completion); err != nil || !applied {
		t.Fatalf("CompletePaymentStorage() applied=%v err=%v", applied, err)
	}
	if _, applied, err := repo.CompletePaymentStorage(completion); err != nil || applied {
		t.Fatalf("replayed CompletePaymentStorage() applied=%v err=%v", applied, err)
	}

	if removed, err := library.CleanupExpiredRemoteMedia(context.Background(), 5, ""); err != nil || removed != 0 {
		t.Fatalf("empty policy cleanup removed=%d err=%v", removed, err)
	}
	removed, err := library.CleanupExpiredRemoteMedia(context.Background(), 5, policyStart)
	if err != nil || removed != 1 {
		t.Fatalf("CleanupExpiredRemoteMedia() removed=%d err=%v", removed, err)
	}
	if _, ok, _ := repo.LoadMediaAsset("free-expired.png"); ok {
		t.Fatal("expired free-tier media was retained")
	}
	for _, path := range []string{"historical.png", "paid-expired.png"} {
		if _, ok, err := repo.LoadMediaAsset(path); err != nil || !ok {
			t.Fatalf("protected media %q missing: ok=%v err=%v", path, ok, err)
		}
	}
	if _, ok := objects.data["images/free-expired.png"]; ok {
		t.Fatal("expired free-tier object was retained")
	}
	if _, ok := objects.data["thumbnails/free-expired.webp"]; ok {
		t.Fatal("expired free-tier thumbnail was retained")
	}
}
