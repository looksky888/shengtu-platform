package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestCleanupExpiredRemoteMediaRespectsPolicyStartAndEntitlement(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)
	library.nowFn = func() time.Time { return now }
	// Within the 7-day historical grace buffer (5 days < 7 days): pre-policy historical images stay protected.
	policyStartWithinBuffer := now.AddDate(0, 0, -5).Format(time.RFC3339Nano)
	assets := []storage.MediaAssetRecord{
		{ID: "historical", Path: "historical.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/historical.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: now.AddDate(0, 0, -20).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)},
		{ID: "free-expired", Path: "free-expired.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/free-expired.png", ThumbnailKey: "thumbnails/free-expired.webp", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: now.AddDate(0, 0, -4).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)},
		{ID: "paid-expired", Path: "paid-expired.png", OwnerID: "paid-user", MediaType: "image", ObjectKey: "images/paid-expired.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: now.AddDate(0, 0, -4).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)},
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
	order := storage.PaymentOrderRecord{ID: "storage-order", OutTradeNo: "storage-trade", UserID: "paid-user", IdempotencyKey: "storage-idempotency", ChannelID: "channel", ChannelVersionID: "channel-version", ProductID: "storage-product", ProductNameSnapshot: "storage", AmountFen: 100, CreditsSnapshot: 1, ProductTypeSnapshot: "cloud_storage", StorageDaysSnapshot: 30, StorageBytesSnapshot: 0, Currency: "CNY", ExpireMinutesSnapshot: 15, ExpiresAt: now.Add(time.Hour).Format(time.RFC3339Nano), Status: storage.PaymentOrderStatusPending, CreatedAt: createdAt, UpdatedAt: createdAt}
	if _, _, err := repo.CreatePaymentOrder(order); err != nil {
		t.Fatal(err)
	}
	completion := storage.PaymentStorageCompletion{OrderID: order.ID, Provider: storage.PaymentProviderWechatPay, TransactionID: "storage-transaction", MerchantID: "merchant", PaidAt: createdAt, CreditedAt: createdAt, TradeState: "SUCCESS", Entitlement: storage.PaymentStorageEntitlementRecord{ID: "entitlement", UserID: order.UserID, SourceOrderID: order.ID, ProductID: order.ProductID, StorageBytes: 0, CreatedAt: createdAt, UpdatedAt: createdAt}}
	if _, applied, err := repo.CompletePaymentStorage(completion); err != nil || !applied {
		t.Fatalf("CompletePaymentStorage() applied=%v err=%v", applied, err)
	}
	if _, applied, err := repo.CompletePaymentStorage(completion); err != nil || applied {
		t.Fatalf("replayed CompletePaymentStorage() applied=%v err=%v", applied, err)
	}

	if removed, err := library.CleanupExpiredRemoteMedia(context.Background(), 3, ""); err != nil || removed != 0 {
		t.Fatalf("empty policy cleanup removed=%d err=%v", removed, err)
	}
	removed, err := library.CleanupExpiredRemoteMedia(context.Background(), 3, policyStartWithinBuffer)
	if err != nil || removed != 1 {
		t.Fatalf("CleanupExpiredRemoteMedia() within historical grace removed=%d err=%v", removed, err)
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

	// Once now >= policyStart + 7 days, pre-policy historical media for free users becomes eligible.
	policyStartPastBuffer := now.AddDate(0, 0, -8).Format(time.RFC3339Nano)
	removed, err = library.CleanupExpiredRemoteMedia(context.Background(), 3, policyStartPastBuffer)
	if err != nil || removed != 1 {
		t.Fatalf("CleanupExpiredRemoteMedia() past historical grace removed=%d err=%v", removed, err)
	}
	if _, ok, _ := repo.LoadMediaAsset("historical.png"); ok {
		t.Fatal("historical free-tier media should be cleaned once 7-day historical grace elapses")
	}
	if _, ok, err := repo.LoadMediaAsset("paid-expired.png"); err != nil || !ok {
		t.Fatalf("paid VIP media missing: ok=%v err=%v", ok, err)
	}
}

func TestCleanupExpiredRemoteMediaDualBuffersMasterSwitchAndGraceVIP(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)
	library.nowFn = func() time.Time { return now }

	// Seed a user in VIP 7-day grace (expired 5 days ago, legacy StorageBytes=10 < UsedBytes=5000)
	// and a user whose VIP grace expired 8 days ago.
	grantVIP := func(id, userID string, storageBytes int64, creditedAt time.Time, days int) {
		ts := creditedAt.UTC().Format(time.RFC3339Nano)
		order := storage.PaymentOrderRecord{
			ID: "ord-" + id, OutTradeNo: "trade-" + id, UserID: userID, IdempotencyKey: "idem-" + id,
			ChannelID: "ch", ChannelVersionID: "chv", ProductID: "prod-" + id, ProductNameSnapshot: "vip",
			AmountFen: 100, CreditsSnapshot: 1, ProductTypeSnapshot: "cloud_storage",
			StorageDaysSnapshot: days, StorageBytesSnapshot: storageBytes, Currency: "CNY",
			ExpireMinutesSnapshot: 15, ExpiresAt: creditedAt.Add(time.Hour).Format(time.RFC3339Nano),
			Status: storage.PaymentOrderStatusPending, CreatedAt: ts, UpdatedAt: ts,
		}
		if _, _, err := repo.CreatePaymentOrder(order); err != nil {
			t.Fatal(err)
		}
		comp := storage.PaymentStorageCompletion{
			OrderID: order.ID, Provider: storage.PaymentProviderWechatPay, TransactionID: "tx-" + id,
			MerchantID: "mch", PaidAt: ts, CreditedAt: ts, TradeState: "SUCCESS",
			Entitlement: storage.PaymentStorageEntitlementRecord{
				ID: "ent-" + id, UserID: userID, SourceOrderID: order.ID, ProductID: order.ProductID,
				StorageBytes: storageBytes, CreatedAt: ts, UpdatedAt: ts,
			},
		}
		if _, applied, err := repo.CompletePaymentStorage(comp); err != nil || !applied {
			t.Fatalf("grantVIP(%s) applied=%v err=%v", id, applied, err)
		}
	}
	grantVIP("grace", "grace-user", 10, now.AddDate(0, 0, -15), 10)   // expires now-5d (within 7d grace!)
	grantVIP("expired", "expired-user", 0, now.AddDate(0, 0, -18), 10) // expires now-8d (past 7d grace!)

	for _, tc := range []struct {
		path    string
		owner   string
		created time.Time
	}{
		{"grace-over-quota.png", "grace-user", now.AddDate(0, 0, -25)},
		{"expired-vip-hist.png", "expired-user", now.AddDate(0, 0, -25)},
	} {
		rec := storage.MediaAssetRecord{
			ID: tc.path, Path: tc.path, OwnerID: tc.owner, MediaType: "image",
			ObjectKey: "images/" + tc.path, ContentType: "image/png", SizeBytes: 5000,
			Status: "ready", CreatedAt: tc.created.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano),
		}
		if err := repo.SaveMediaAsset(rec); err != nil {
			t.Fatal(err)
		}
		objects.data[rec.ObjectKey] = []byte("image")
	}

	policyStart := now.AddDate(0, 0, -8).Format(time.RFC3339Nano)
	// Master switch OFF: zero deletions!
	if removed, err := library.CleanupExpiredRemoteMediaWithPolicy(context.Background(), PaymentSettingsPublic{
		CloudStorageEnabled:         false,
		CloudStoragePolicyStartedAt: policyStart,
		FreeRetentionDays:           3,
		VIPGraceDays:                7,
		HistoricalGraceDays:         7,
	}); err != nil || removed != 0 {
		t.Fatalf("master switch OFF removed=%d err=%v, want 0", removed, err)
	}

	// Master switch ON: grace-user stays protected even with SizeBytes > legacy StorageBytes, while expired-user is cleaned!
	removed, err := library.CleanupExpiredRemoteMediaWithPolicy(context.Background(), PaymentSettingsPublic{
		CloudStorageEnabled:         true,
		CloudStoragePolicyStartedAt: policyStart,
		FreeRetentionDays:           3,
		VIPGraceDays:                7,
		HistoricalGraceDays:         7,
	})
	if err != nil || removed != 1 {
		t.Fatalf("master switch ON removed=%d err=%v, want 1", removed, err)
	}
	if _, ok, _ := repo.LoadMediaAsset("grace-over-quota.png"); !ok {
		t.Fatal("grace VIP user's image was deleted")
	}
	if _, ok, _ := repo.LoadMediaAsset("expired-vip-hist.png"); ok {
		t.Fatal("expired-past-grace user's historical image was retained")
	}
}

func TestCleanupExpiredRemoteMediaCapsBoundedSweepAt1000(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)
	library.nowFn = func() time.Time { return now }
	policyStart := now.AddDate(0, 0, -10).Format(time.RFC3339Nano)

	const totalHistorical = 1050
	for i := 0; i < totalHistorical; i++ {
		path := fmt.Sprintf("hist-%04d.png", i)
		rec := storage.MediaAssetRecord{
			ID: path, Path: path, OwnerID: "free-user", MediaType: "image",
			ObjectKey: "images/" + path, ContentType: "image/png", SizeBytes: 10,
			Status: "ready", CreatedAt: now.AddDate(0, 0, -30).Add(time.Duration(i) * time.Second).Format(time.RFC3339Nano),
			UpdatedAt: now.Format(time.RFC3339Nano),
		}
		if err := repo.SaveMediaAsset(rec); err != nil {
			t.Fatal(err)
		}
		objects.data[rec.ObjectKey] = []byte("x")
	}

	policy := PaymentSettingsPublic{
		CloudStorageEnabled:         true,
		CloudStoragePolicyStartedAt: policyStart,
		FreeRetentionDays:           3,
		VIPGraceDays:                7,
		HistoricalGraceDays:         7,
	}
	firstRemoved, err := library.CleanupExpiredRemoteMediaWithPolicy(context.Background(), policy)
	if err != nil || firstRemoved != 1000 {
		t.Fatalf("first bounded sweep removed=%d err=%v, want 1000", firstRemoved, err)
	}
	secondRemoved, err := library.CleanupExpiredRemoteMediaWithPolicy(context.Background(), policy)
	if err != nil || secondRemoved != 50 {
		t.Fatalf("second bounded sweep removed=%d err=%v, want 50", secondRemoved, err)
	}
}

func TestStoreImageNeverBlocksOnCloudStorageCapacity(t *testing.T) {
	library, repo, _ := newMediaLibraryTestFixture(t)
	library.capacity = repo // Wire real StorageCapacityBackend just like NewR2MediaLibrary

	now := time.Now().UTC()
	ts := now.Format(time.RFC3339Nano)
	// Give user a tiny 1-byte legacy entitlement and an existing 10KB asset so they are 10,000x over legacy byte quota.
	order := storage.PaymentOrderRecord{
		ID: "tiny-ord", OutTradeNo: "tiny-trade", UserID: "over-quota-user", IdempotencyKey: "tiny-idem",
		ChannelID: "ch", ChannelVersionID: "chv", ProductID: "tiny-prod", ProductNameSnapshot: "tiny",
		AmountFen: 100, CreditsSnapshot: 1, ProductTypeSnapshot: "cloud_storage",
		StorageDaysSnapshot: 30, StorageBytesSnapshot: 1, Currency: "CNY",
		ExpireMinutesSnapshot: 15, ExpiresAt: now.Add(time.Hour).Format(time.RFC3339Nano),
		Status: storage.PaymentOrderStatusPending, CreatedAt: ts, UpdatedAt: ts,
	}
	if _, _, err := repo.CreatePaymentOrder(order); err != nil {
		t.Fatal(err)
	}
	if _, applied, err := repo.CompletePaymentStorage(storage.PaymentStorageCompletion{
		OrderID: order.ID, Provider: storage.PaymentProviderWechatPay, TransactionID: "tiny-tx",
		MerchantID: "mch", PaidAt: ts, CreditedAt: ts, TradeState: "SUCCESS",
		Entitlement: storage.PaymentStorageEntitlementRecord{
			ID: "tiny-ent", UserID: order.UserID, SourceOrderID: order.ID, ProductID: order.ProductID,
			StorageBytes: 1, CreatedAt: ts, UpdatedAt: ts,
		},
	}); err != nil || !applied {
		t.Fatalf("CompletePaymentStorage() applied=%v err=%v", applied, err)
	}
	if err := repo.SaveMediaAsset(storage.MediaAssetRecord{
		ID: "existing-big", Path: "existing-big.png", OwnerID: "over-quota-user", MediaType: "image",
		ObjectKey: "images/existing-big.png", ContentType: "image/png", SizeBytes: 10240,
		Status: "ready", CreatedAt: ts, UpdatedAt: ts,
	}); err != nil {
		t.Fatal(err)
	}

	url, err := library.StoreImage(mediaPNG(t), "", "over-quota-user", "OverQuota", "png")
	if err != nil || url == "" {
		t.Fatalf("StoreImage() blocked or failed due to capacity: url=%q err=%v", url, err)
	}
}

func TestCleanupExpiredRemoteMediaContinuesAfterObjectFailure(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Now().UTC()
	policyStart := now.AddDate(0, 0, -5).Format(time.RFC3339Nano)
	createdAt := now.AddDate(0, 0, -4).Format(time.RFC3339Nano)
	failing := storage.MediaAssetRecord{ID: "failing", Path: "failing.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/failing.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: createdAt, UpdatedAt: now.Format(time.RFC3339Nano)}
	healthy := storage.MediaAssetRecord{ID: "healthy", Path: "healthy.png", OwnerID: "free-user", MediaType: "image", ObjectKey: "images/healthy.png", ContentType: "image/png", SizeBytes: 10, Status: "ready", CreatedAt: createdAt, UpdatedAt: now.Format(time.RFC3339Nano)}
	for _, asset := range []storage.MediaAssetRecord{failing, healthy} {
		if err := repo.SaveMediaAsset(asset); err != nil {
			t.Fatal(err)
		}
		objects.data[asset.ObjectKey] = []byte("image")
	}
	objects.failDelete = failing.ObjectKey

	removed, err := library.CleanupExpiredRemoteMedia(context.Background(), 3, policyStart)
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


func TestCleanupExpiredRemoteMediaExemptsPublicInspirationAssets(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)
	library.nowFn = func() time.Time { return now }
	policyStart := now.AddDate(0, 0, -10).Format(time.RFC3339Nano)

	assets := []storage.MediaAssetRecord{
		{
			ID: "pub-pre", Path: "pub-pre.png", OwnerID: "free-user", MediaType: "image",
			ObjectKey: "images/pub-pre.png", ContentType: "image/png", SizeBytes: 10,
			Visibility: ImageVisibilityPublic, Status: "ready",
			CreatedAt: now.AddDate(0, 0, -20).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano),
		},
		{
			ID: "pub-post", Path: "pub-post.png", OwnerID: "free-user", MediaType: "image",
			ObjectKey: "images/pub-post.png", ContentType: "image/png", SizeBytes: 10,
			Visibility: ImageVisibilityPublic, Status: "ready",
			CreatedAt: now.AddDate(0, 0, -5).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano),
		},
		{
			ID: "priv-post", Path: "priv-post.png", OwnerID: "free-user", MediaType: "image",
			ObjectKey: "images/priv-post.png", ContentType: "image/png", SizeBytes: 10,
			Visibility: ImageVisibilityPrivate, Status: "ready",
			CreatedAt: now.AddDate(0, 0, -5).Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano),
		},
	}
	for _, asset := range assets {
		if err := repo.SaveMediaAsset(asset); err != nil {
			t.Fatal(err)
		}
		objects.data[asset.ObjectKey] = []byte("art")
	}

	removed, err := library.CleanupExpiredRemoteMediaWithPolicy(context.Background(), PaymentSettingsPublic{
		CloudStorageEnabled:         true,
		CloudStoragePolicyStartedAt: policyStart,
		FreeRetentionDays:           3,
		VIPGraceDays:                7,
		HistoricalGraceDays:         7,
	})
	if err != nil || removed != 1 {
		t.Fatalf("CleanupExpiredRemoteMediaWithPolicy() = %d, %v, want 1", removed, err)
	}
	for _, pubPath := range []string{"pub-pre.png", "pub-post.png"} {
		if _, ok, _ := repo.LoadMediaAsset(pubPath); !ok {
			t.Fatalf("public Inspiration asset %s was deleted", pubPath)
		}
	}
	if _, ok, _ := repo.LoadMediaAsset("priv-post.png"); ok {
		t.Fatal("expired private asset survived cleanup")
	}
}

func TestPublicPaymentOrderAdminZerosCreditsForCloudStorage(t *testing.T) {
	storageOrder := publicPaymentOrderAdmin(storage.PaymentOrderRecord{
		ID:                   "ord-storage-1",
		OutTradeNo:           "trade-storage-1",
		UserID:               "user:alice",
		ProductID:            "prod-vip-30d",
		ProductNameSnapshot:  "30天云存储VIP",
		AmountFen:            990,
		CreditsSnapshot:      1,
		ProductTypeSnapshot:  "cloud_storage",
		StorageDaysSnapshot:  30,
		StorageBytesSnapshot: 0,
		Currency:             "CNY",
		Status:               storage.PaymentOrderStatusSucceeded,
	})
	if storageOrder.Credits != 0 || storageOrder.ProductType != "cloud_storage" || storageOrder.StorageDays != 30 || storageOrder.StorageBytes != 0 {
		t.Fatalf("cloud_storage admin DTO = %#v", storageOrder)
	}

	creditsOrder := publicPaymentOrderAdmin(storage.PaymentOrderRecord{
		ID:                  "ord-credits-1",
		OutTradeNo:          "trade-credits-1",
		UserID:              "user:alice",
		ProductID:           "prod-credits-100",
		ProductNameSnapshot: "100积分",
		AmountFen:           400,
		CreditsSnapshot:     100,
		Currency:            "CNY",
		Status:              storage.PaymentOrderStatusSucceeded,
	})
	if creditsOrder.Credits != 100 || creditsOrder.ProductType != "credits" {
		t.Fatalf("credits admin DTO = %#v", creditsOrder)
	}
}
