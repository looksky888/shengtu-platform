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

func TestCleanupExpiredRemoteMediaContinuesAfterObjectFailure(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Now().UTC()
	policyStart := now.AddDate(0, 0, -10).Format(time.RFC3339Nano)
	createdAt := now.AddDate(0, 0, -7).Format(time.RFC3339Nano)
	failing := storage.MediaAssetRecord{ID: "failing", Path: "failing.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/failing.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: createdAt, UpdatedAt: now.Format(time.RFC3339Nano)}
	healthy := storage.MediaAssetRecord{ID: "healthy", Path: "healthy.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/healthy.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: createdAt, UpdatedAt: now.Format(time.RFC3339Nano)}
	for _, asset := range []storage.MediaAssetRecord{failing, healthy} {
		if err := repo.SaveMediaAsset(asset); err != nil {
			t.Fatal(err)
		}
		objects.data[asset.ObjectKey] = []byte("image")
	}
	objects.failDelete = failing.ObjectKey

	removed, err := library.CleanupExpiredRemoteMedia(context.Background(), 5, policyStart)
	if err == nil {
		t.Fatal("CleanupExpiredRemoteMedia() error = nil, want the object failure reported")
	}
	if removed != 1 {
		t.Fatalf("CleanupExpiredRemoteMedia() removed = %d, want the healthy asset only", removed)
	}
	if _, ok, err := repo.LoadMediaAsset(healthy.Path); err != nil || ok {
		t.Fatalf("healthy expired media was retained: ok=%v err=%v", ok, err)
	}
	stored, ok, err := repo.LoadMediaAsset(failing.Path)
	if err != nil || !ok {
		t.Fatalf("failed asset row was lost: ok=%v err=%v", ok, err)
	}
	if stored.Status != mediaStatusDeleting {
		t.Fatalf("failed asset status = %q, want %q", stored.Status, mediaStatusDeleting)
	}
	page, err := library.ListImages("https://app.example.test", ImageListQuery{Scope: ImageAccessScope{All: true}, Limit: 10})
	if err != nil {
		t.Fatalf("ListImages() error = %v", err)
	}
	if items := page["items"].([]map[string]any); len(items) != 0 {
		t.Fatalf("cleanup left listable media rows: %#v", items)
	}
}
