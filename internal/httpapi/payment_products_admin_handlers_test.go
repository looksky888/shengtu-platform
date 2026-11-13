package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
)

func TestAdminRechargeProductCreateUpdateAndArchive(t *testing.T) {
	resetAuthRateLimiterForTest()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "payment-products.db")))
	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	auth := adminAuthHeader(t, app)

	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", auth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		return res
	}

	created := request(http.MethodPost, "/api/admin/recharge-products", `{"sku":"credits-100","name":"100 积分","amount_fen":400,"credits":100,"enabled":true,"sort_order":1,"product_type":"credits"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	var createBody struct {
		Item struct {
			ID string `json:"id"`
		} `json:"item"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &createBody); err != nil || createBody.Item.ID == "" {
		t.Fatalf("create body=%s err=%v", created.Body.String(), err)
	}

	path := "/api/admin/recharge-products/" + createBody.Item.ID
	updated := request(http.MethodPatch, path, `{"sku":"credits-100","name":"100 积分新名称","amount_fen":500,"credits":100,"enabled":true,"sort_order":2,"product_type":"credits"}`)
	if updated.Code != http.StatusOK || !strings.Contains(updated.Body.String(), "100 积分新名称") {
		t.Fatalf("update status=%d body=%s", updated.Code, updated.Body.String())
	}
	deleted := request(http.MethodDelete, path, "")
	if deleted.Code != http.StatusOK || !strings.Contains(deleted.Body.String(), `"deleted":true`) {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	listed := request(http.MethodGet, "/api/admin/recharge-products", "")
	if listed.Code != http.StatusOK || strings.Contains(listed.Body.String(), createBody.Item.ID) {
		t.Fatalf("list after delete status=%d body=%s", listed.Code, listed.Body.String())
	}
	public := request(http.MethodGet, "/api/payment/products", "")
	if public.Code != http.StatusOK || strings.Contains(public.Body.String(), createBody.Item.ID) {
		t.Fatalf("public list after delete status=%d body=%s", public.Code, public.Body.String())
	}
	secondDelete := request(http.MethodDelete, path, "")
	if secondDelete.Code != http.StatusNotFound {
		t.Fatalf("second delete status=%d body=%s", secondDelete.Code, secondDelete.Body.String())
	}
}

func TestCloudStorageVIPMasterSwitchConfigAndImageExpiryHints(t *testing.T) {
	resetAuthRateLimiterForTest()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "payment-vip.db")))
	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	auth := adminAuthHeader(t, app)

	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", auth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		return res
	}

	// 1. Default /api/payment/config has cloud_storage_enabled=false, tier="disabled", defaults 3/7/7
	cfgRes := request(http.MethodGet, "/api/payment/config", "")
	if cfgRes.Code != http.StatusOK {
		t.Fatalf("GET /api/payment/config status=%d body=%s", cfgRes.Code, cfgRes.Body.String())
	}
	var cfgPayload paymentConfigResponse
	if err := json.Unmarshal(cfgRes.Body.Bytes(), &cfgPayload); err != nil {
		t.Fatalf("decode /api/payment/config: %v", err)
	}
	if cfgPayload.CloudStorageEnabled || cfgPayload.FreeRetentionDays != 3 || cfgPayload.VIPGraceDays != 7 || cfgPayload.HistoricalGraceDays != 7 || cfgPayload.StorageEntitlement.Tier != "disabled" {
		t.Fatalf("default payment config = %#v", cfgPayload)
	}

	// 2. Unlimited cloud_storage product (storage_bytes = 0) creation succeeds via HTTP API
	unlimRes := request(http.MethodPost, "/api/admin/recharge-products", `{"sku":"vip-0bytes-30d","name":"30天畅存卡","description":"有效期内不限张数畅存所有生图","amount_fen":990,"credits":0,"enabled":true,"sort_order":1,"product_type":"cloud_storage","storage_days":30,"storage_bytes":0}`)
	if unlimRes.Code != http.StatusCreated || !strings.Contains(unlimRes.Body.String(), `"storage_bytes":0`) {
		t.Fatalf("create unlimited cloud_storage product status=%d body=%s", unlimRes.Code, unlimRes.Body.String())
	}

	// 3. Seed a local image so /api/images returns 1 item; with master switch OFF, expires_at must be omitted
	imgRel := "2026/09/01/sample.png"
	imgPath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(imgRel))
	if err := os.MkdirAll(filepath.Dir(imgPath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imgPath); err != nil {
		t.Fatalf("writeHTTPTestPNG: %v", err)
	}
	app.images.RecordImageOwners([]string{imgRel}, "admin")
	imagesOff := request(http.MethodGet, "/api/images?scope=all", "")
	if imagesOff.Code != http.StatusOK || strings.Contains(imagesOff.Body.String(), `"expires_at"`) {
		t.Fatalf("expected no expires_at when cloud_storage_enabled=false: status=%d body=%s", imagesOff.Code, imagesOff.Body.String())
	}

	// 4. Enable via /api/admin/payments/settings alias with custom retention/grace days
	putRes := request(http.MethodPut, "/api/admin/payments/settings", `{"recharge_enabled":true,"custom_credits_enabled":false,"cloud_storage_enabled":true,"free_retention_days":4,"vip_grace_days":9,"historical_grace_days":10,"credit_unit_price_fen":4,"min_custom_credits":10,"max_custom_credits":100000}`)
	if putRes.Code != http.StatusOK {
		t.Fatalf("PUT /api/admin/payments/settings status=%d body=%s", putRes.Code, putRes.Body.String())
	}

	cfgOnRes := request(http.MethodGet, "/api/payment/config", "")
	if cfgOnRes.Code != http.StatusOK {
		t.Fatalf("GET /api/payment/config after enable status=%d body=%s", cfgOnRes.Code, cfgOnRes.Body.String())
	}
	if err := json.Unmarshal(cfgOnRes.Body.Bytes(), &cfgPayload); err != nil {
		t.Fatalf("decode enabled /api/payment/config: %v", err)
	}
	if !cfgPayload.CloudStorageEnabled || cfgPayload.FreeRetentionDays != 4 || cfgPayload.VIPGraceDays != 9 || cfgPayload.HistoricalGraceDays != 10 || cfgPayload.StorageEntitlement.Tier != "free" {
		t.Fatalf("enabled payment config = %#v", cfgPayload)
	}

	// 5. With master switch ON, unprotected image in /api/images includes expires_at hint
	imagesOn := request(http.MethodGet, "/api/images?scope=all", "")
	if imagesOn.Code != http.StatusOK || !strings.Contains(imagesOn.Body.String(), `"expires_at"`) {
		t.Fatalf("expected expires_at hint when cloud_storage_enabled=true: status=%d body=%s", imagesOn.Code, imagesOn.Body.String())
	}
}


func TestMediaCleanupPolicyGraceExpiresAtAndVisibilityExemption(t *testing.T) {
	resetAuthRateLimiterForTest()
	for _, key := range []string{
		"CHATGPT2API_MEDIA_STORAGE_PROVIDER",
		"CHATGPT2API_MEDIA_AUTO_CLEANUP_ENABLED",
		"CHATGPT2API_IMAGE_RETENTION_DAYS",
		"CHATGPT2API_VIDEO_RETENTION_DAYS",
	} {
		unsetTestEnv(t, key)
	}
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "cleanup-policy.db")))
	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	if _, err := app.config.Update(map[string]any{
		"media_storage_provider":     "local",
		"media_auto_cleanup_enabled": true,
		"image_retention_days":       3,
		"video_retention_days":       3,
	}); err != nil {
		t.Fatalf("config.Update() error = %v", err)
	}
	auth := adminAuthHeader(t, app)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", auth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		return res
	}

	oldMod := time.Now().Add(-10 * 24 * time.Hour)
	seedOldImage := func(rel, ownerID, visibility string) string {
		p := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := writeHTTPTestPNG(p); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, oldMod, oldMod); err != nil {
			t.Fatal(err)
		}
		app.images.RecordImageOwners([]string{rel}, ownerID)
		if visibility == service.ImageVisibilityPublic {
			if _, err := app.images.UpdateImageVisibility(rel, service.ImageVisibilityPublic, service.ImageAccessScope{All: true}); err != nil {
				t.Fatal(err)
			}
			_ = os.Chtimes(p, oldMod, oldMod)
		}
		return p
	}

	freeImg := seedOldImage("2026/08/01/free.png", "user:free", service.ImageVisibilityPrivate)
	pubImg := seedOldImage("2026/08/01/pub.png", "user:free", service.ImageVisibilityPublic)
	activeImg := seedOldImage("2026/08/01/active.png", "user:active", service.ImageVisibilityPrivate)
	graceImg := seedOldImage("2026/08/01/grace.png", "user:grace", service.ImageVisibilityPrivate)

	freeVid := service.VideoAsset{TaskID: "vid-free", OwnerID: "user:free", Visibility: service.VideoAssetVisibilityPrivate, CreatedAt: oldMod.UTC().Format(time.RFC3339)}
	vipVid := service.VideoAsset{TaskID: "vid-vip", OwnerID: "user:grace", Visibility: service.VideoAssetVisibilityPrivate, CreatedAt: oldMod.UTC().Format(time.RFC3339)}
	for _, vid := range []service.VideoAsset{freeVid, vipVid} {
		vp := app.videos.ContentPath(vid.OwnerID, vid.TaskID)
		if err := os.MkdirAll(filepath.Dir(vp), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(vp, []byte("mp4"), 0o644); err != nil {
			t.Fatal(err)
		}
		_ = os.Chtimes(vp, oldMod, oldMod)
		if _, err := app.videos.Record(vid); err != nil {
			t.Fatal(err)
		}
	}

	// 1. With cloud_storage_enabled == false (default), runMediaCleanup MUST NOT delete any image or video!
	app.runMediaCleanup(context.Background())
	for _, p := range []string{freeImg, pubImg, activeImg, graceImg, app.videos.ContentPath(freeVid.OwnerID, freeVid.TaskID)} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("cloud_storage_enabled=false cleanup deleted %s: %v", p, err)
		}
	}

	// 2. Seed active & grace storage entitlements in SQLite
	backend, err := app.config.StorageBackend()
	if err != nil {
		t.Fatal(err)
	}
	payDB, ok := backend.(*storage.DatabaseBackend)
	if !ok {
		t.Fatal("expected *storage.DatabaseBackend")
	}
	t.Cleanup(func() { _ = payDB.Close() })
	now := time.Now().UTC().Truncate(time.Second)

	// Enable cloud storage policy (free=3d, vip_grace=7d, historical_grace=2d so grace > historical)
	putRes := request(http.MethodPut, "/api/admin/payments/settings", `{"recharge_enabled":true,"custom_credits_enabled":false,"cloud_storage_enabled":true,"free_retention_days":3,"vip_grace_days":7,"historical_grace_days":2,"credit_unit_price_fen":4,"min_custom_credits":10,"max_custom_credits":100000}`)
	if putRes.Code != http.StatusOK {
		t.Fatalf("PUT settings status=%d body=%s", putRes.Code, putRes.Body.String())
	}

	// Complete entitlements with exact StorageDaysSnapshot relative to PaidAt so CompletePaymentStorage sets exact expires_at:
	// - active: PaidAt = now, StorageDaysSnapshot = 20 -> expires_at = now + 20d (active)
	// - grace: PaidAt = now - 12d, StorageDaysSnapshot = 10 -> expires_at = now - 2d, grace_expires_at = now + 5d (> policyStart + 2d historical!)
	createCompletedStorageOrder := func(id, userID string, paidAt time.Time, days int) {
		ord := storage.PaymentOrderRecord{
			ID: "ord-" + id, OutTradeNo: "trade-" + id, UserID: userID, IdempotencyKey: "idem-" + id,
			ChannelID: "ch", ChannelVersionID: "chv", ProductID: "prod-vip", ProductNameSnapshot: "VIP",
			AmountFen: 990, CreditsSnapshot: 1, ProductTypeSnapshot: "cloud_storage",
			StorageDaysSnapshot: days, StorageBytesSnapshot: 0, Currency: "CNY",
			ExpireMinutesSnapshot: 15, ExpiresAt: now.Add(time.Hour).Format(time.RFC3339Nano),
			Status: storage.PaymentOrderStatusPending, CreatedAt: paidAt.Format(time.RFC3339Nano), UpdatedAt: paidAt.Format(time.RFC3339Nano),
		}
		if _, _, err := payDB.CreatePaymentOrder(ord); err != nil {
			t.Fatal(err)
		}
		if _, applied, err := payDB.CompletePaymentStorage(storage.PaymentStorageCompletion{
			OrderID: ord.ID, Provider: storage.PaymentProviderWechatPay, TransactionID: "tx-" + id,
			MerchantID: "mch", PaidAt: paidAt.Format(time.RFC3339Nano), CreditedAt: paidAt.Format(time.RFC3339Nano), TradeState: "SUCCESS",
			Entitlement: storage.PaymentStorageEntitlementRecord{
				ID: "ent-" + id, UserID: userID, SourceOrderID: ord.ID, ProductID: ord.ProductID,
				StorageBytes: 0, CreatedAt: paidAt.Format(time.RFC3339Nano), UpdatedAt: paidAt.Format(time.RFC3339Nano),
			},
		}); err != nil || !applied {
			t.Fatalf("CompletePaymentStorage(%s) applied=%v err=%v", id, applied, err)
		}
	}
	createCompletedStorageOrder("active", "user:active", now, 20)
	gracePaidAt := now.AddDate(0, 0, -12)
	expectedGraceExpiry := gracePaidAt.AddDate(0, 0, 10+7).UTC().Format(time.RFC3339)
	createCompletedStorageOrder("grace", "user:grace", gracePaidAt, 10)

	// 3. Verify /api/images?scope=all expires_at semantics for active, grace, public, and free
	listRes := request(http.MethodGet, "/api/images?scope=all", "")
	if listRes.Code != http.StatusOK {
		t.Fatalf("GET /api/images status=%d body=%s", listRes.Code, listRes.Body.String())
	}
	var listBody service.ImageListResponse
	if err := json.Unmarshal(listRes.Body.Bytes(), &listBody); err != nil {
		t.Fatal(err)
	}
	byPath := map[string]service.ImagePublic{}
	for _, it := range listBody.Items {
		byPath[it.Path] = it
	}
	if byPath["2026/08/01/active.png"].ExpiresAt != "" {
		t.Fatalf("active VIP image unexpectedly got expires_at=%q", byPath["2026/08/01/active.png"].ExpiresAt)
	}
	if byPath["2026/08/01/pub.png"].ExpiresAt != "" {
		t.Fatalf("public Inspiration image unexpectedly got expires_at=%q", byPath["2026/08/01/pub.png"].ExpiresAt)
	}
	if byPath["2026/08/01/grace.png"].ExpiresAt != expectedGraceExpiry {
		t.Fatalf("grace VIP image expires_at=%q, want %q", byPath["2026/08/01/grace.png"].ExpiresAt, expectedGraceExpiry)
	}
	if byPath["2026/08/01/free.png"].ExpiresAt == "" {
		t.Fatal("free private image missing expires_at")
	}

	// 4. Verify PATCH /api/images/visibility clears expires_at on private->public and restores on public->private
	toPubRes := request(http.MethodPatch, "/api/images/visibility", `{"path":"2026/08/01/free.png","visibility":"public"}`)
	if toPubRes.Code != http.StatusOK || strings.Contains(toPubRes.Body.String(), `"expires_at"`) {
		t.Fatalf("PATCH private->public status=%d body=%s", toPubRes.Code, toPubRes.Body.String())
	}
	toPrivRes := request(http.MethodPatch, "/api/images/visibility", `{"path":"2026/08/01/free.png","visibility":"private"}`)
	if toPrivRes.Code != http.StatusOK || !strings.Contains(toPrivRes.Body.String(), `"expires_at"`) {
		t.Fatalf("PATCH public->private status=%d body=%s", toPrivRes.Code, toPrivRes.Body.String())
	}
	// Restore old modtime on free.png before running cleanup
	_ = os.Chtimes(freeImg, oldMod, oldMod)

	// 5. Run media cleanup with cloud_storage_enabled == true: free private image & video removed; active, grace, public preserved!
	app.runMediaCleanup(context.Background())
	if _, err := os.Stat(freeImg); !os.IsNotExist(err) {
		t.Fatalf("expired free image survived cleanup: %v", err)
	}
	if _, err := os.Stat(app.videos.ContentPath(freeVid.OwnerID, freeVid.TaskID)); !os.IsNotExist(err) {
		t.Fatalf("expired free video survived cleanup: %v", err)
	}
	for _, keep := range []string{pubImg, activeImg, graceImg, app.videos.ContentPath(vipVid.OwnerID, vipVid.TaskID)} {
		if _, err := os.Stat(keep); err != nil {
			t.Fatalf("protected/public media %s was deleted: %v", keep, err)
		}
	}

	// 6. Also verify GET /api/admin/payment-orders returns product_type="cloud_storage", storage_days, and credits=0!
	ordersRes := request(http.MethodGet, "/api/admin/payment-orders", "")
	if ordersRes.Code != http.StatusOK {
		t.Fatalf("GET /api/admin/payment-orders status=%d body=%s", ordersRes.Code, ordersRes.Body.String())
	}
	if !strings.Contains(ordersRes.Body.String(), `"product_type":"cloud_storage"`) || !strings.Contains(ordersRes.Body.String(), `"credits":0`) {
		t.Fatalf("admin payment orders body=%s", ordersRes.Body.String())
	}
}


func TestAdminAnnouncementBannerUpdateFallbackAndBackslashLinkRejection(t *testing.T) {
	app := newTestApp(t)
	auth := adminAuthHeader(t, app)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", auth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		return res
	}

	// Reject /\evil.com open redirect on create
	badCreate := request(http.MethodPost, "/api/admin/announcements", `{"title":"活动","display_mode":"banner","link_url":"/\\evil.com","enabled":true,"show_image":true}`)
	if badCreate.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for /\\evil.com link_url, got %d body=%s", badCreate.Code, badCreate.Body.String())
	}

	// Create banner with empty content -> falls back to title
	created := request(http.MethodPost, "/api/admin/announcements", `{"title":"秋季福利上线","content":"","display_mode":"banner","link_url":"/wallet","enabled":true,"show_image":true}`)
	if created.Code != http.StatusOK {
		t.Fatalf("banner create status=%d body=%s", created.Code, created.Body.String())
	}
	var createResp struct {
		Item service.AnnouncementPublic `json:"item"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	if createResp.Item.ID == "" || createResp.Item.Content != "秋季福利上线" {
		t.Fatalf("banner create item=%#v", createResp.Item)
	}

	// Update banner with empty content -> also falls back to title instead of 400
	updated := request(http.MethodPost, "/api/admin/announcements/"+createResp.Item.ID, `{"title":"冬季福利上线","content":"","display_mode":"banner","link_url":"/wallet"}`)
	if updated.Code != http.StatusOK {
		t.Fatalf("banner update status=%d body=%s", updated.Code, updated.Body.String())
	}
	if err := json.Unmarshal(updated.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	if createResp.Item.Content != "冬季福利上线" {
		t.Fatalf("banner update item=%#v", createResp.Item)
	}

	// Popup update with empty content must still return 400
	popupEmpty := request(http.MethodPost, "/api/admin/announcements/"+createResp.Item.ID, `{"title":"弹窗","content":"","display_mode":"popup"}`)
	if popupEmpty.Code != http.StatusBadRequest {
		t.Fatalf("popup empty content update status=%d body=%s, want 400", popupEmpty.Code, popupEmpty.Body.String())
	}
}
