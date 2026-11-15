package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/config"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func clearManagedSettingEnvForTest(t *testing.T) {
	t.Helper()
	for _, key := range config.ManagedSettingEnvKeys() {
		unsetTestEnv(t, key)
	}
}

func TestAdminOverviewAggregationFiltersLedgerAndRBAC(t *testing.T) {
	grokSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/grok/provider-accounts" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"items": [],
			"total": 9,
			"page": 1,
			"page_size": 1,
			"summary": {
				"total": 9,
				"by_provider": {"web": 6, "console": 3, "build": 0},
				"routable_by_provider": {"web": 5, "console": 2, "build": 0},
				"by_status": {"active": 7, "disabled": 1, "error": 1, "unknown": 0},
				"with_credentials": 8,
				"linked": 2,
				"theoretical_slots": 14,
				"quota_exhausted": 2
			},
			"projection": {
				"status": "success",
				"account_count": 9,
				"link_count": 2,
				"quota_count": 5,
				"source_counts": {},
				"warnings": [],
				"error_code": "",
				"started_at": "",
				"finished_at": "",
				"sources": {},
				"consistency": {}
			}
		}`))
	}))
	defer grokSrv.Close()

	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(dataDir, "overview-test.db")
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(dbPath))
	t.Setenv("GROK_RUNTIME_BASE_URL", grokSrv.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("k", 32))

	loc := util.ChinaLocation()
	now := time.Now().In(loc)
	todayNoon := time.Date(now.Year(), now.Month(), now.Day(), 10, 15, 0, 0, loc)
	if todayNoon.After(now) {
		todayNoon = time.Date(now.Year(), now.Month(), now.Day(), 0, 5, 0, 0, loc)
	}
	threeDaysAgo := todayNoon.AddDate(0, 0, -3)
	twentyDaysAgo := todayNoon.AddDate(0, 0, -20)

	// Pre-seed >200 tasks across today, 7d, and 30d (verifying no 180-row client truncation) plus chat tasks.
	seedBackend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatal(err)
	}
	rawTasks := make([]map[string]any, 0, 220)
	for i := 0; i < 195; i++ {
		id := fmt.Sprintf("img-today-%03d", i)
		ts := todayNoon.Format(time.RFC3339)
		rawTasks = append(rawTasks, map[string]any{
			"id":               id,
			"owner_id":         "user:u1",
			"status":           service.TaskStatusSuccess,
			"mode":             "generation",
			"model":            util.ImageModelGPT,
			"channel_id":       "local-account-pool",
			"channel_name":     "本地号池",
			"count":            1,
			"data":             []map[string]any{{"url": "/images/x.png"}},
			"created_at":       ts,
			"updated_at":       ts,
			"finished_at":      ts,
			"duration_seconds": 2.0,
		})
	}
	for i := 0; i < 12; i++ {
		id := fmt.Sprintf("vid-7d-%02d", i)
		ts := threeDaysAgo.Format(time.RFC3339)
		status := service.TaskStatusSuccess
		errMsg := ""
		var data []map[string]any
		if i < 10 {
			data = []map[string]any{{"url": "/api/videos/v.mp4"}}
		} else {
			status = service.TaskStatusError
			errMsg = "grok upstream quota exceeded"
		}
		rawTasks = append(rawTasks, map[string]any{
			"id":               id,
			"owner_id":         "user:u1",
			"status":           status,
			"mode":             "video",
			"model":            "grok-imagine-1.0-video",
			"channel_id":       "local-grok-runtime",
			"channel_name":     "Grok 号池",
			"count":            1,
			"data":             data,
			"error":            errMsg,
			"created_at":       ts,
			"updated_at":       ts,
			"finished_at":      ts,
			"duration_seconds": 8.0,
		})
	}
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("img-30d-%02d", i)
		ts := twentyDaysAgo.Format(time.RFC3339)
		rawTasks = append(rawTasks, map[string]any{
			"id":               id,
			"owner_id":         "user:u1",
			"status":           service.TaskStatusSuccess,
			"mode":             "edit",
			"model":            util.ImageModelGPT25,
			"channel_id":       "local-account-pool",
			"channel_name":     "本地号池",
			"count":            2,
			"data":             []map[string]any{{"url": "/images/1.png"}, {"url": "/images/2.png"}},
			"created_at":       ts,
			"updated_at":       ts,
			"finished_at":      ts,
			"duration_seconds": 4.0,
		})
	}
	// Chat tasks MUST be excluded from image/video overview metrics!
	for i := 0; i < 8; i++ {
		id := fmt.Sprintf("chat-today-%02d", i)
		ts := todayNoon.Format(time.RFC3339)
		rawTasks = append(rawTasks, map[string]any{
			"id":          id,
			"owner_id":    "user:u1",
			"status":      service.TaskStatusSuccess,
			"mode":        "chat",
			"model":       "gpt-4o",
			"count":       1,
			"created_at":  ts,
			"updated_at":  ts,
			"finished_at": ts,
		})
	}
	if err := seedBackend.SaveJSONDocument("image_tasks.json", map[string]any{"tasks": rawTasks}); err != nil {
		t.Fatal(err)
	}
	// Seed a succeeded payment order so payments & paid_users are non-zero.
	paidNow := now.UTC().Format(time.RFC3339Nano)
	if _, _, err := seedBackend.CreatePaymentChannel(
		storage.PaymentChannelRecord{
			ID: "ch-alipay", Code: "alipay", Name: "Alipay", Provider: storage.PaymentProviderAlipay,
			PaymentMethod: storage.PaymentMethodNative, Enabled: true, ActiveVersionID: "v1",
			NotifyBaseURL: "https://pay.example.com", OrderExpireMinutes: 15, CreatedAt: paidNow, UpdatedAt: paidNow,
		},
		storage.PaymentChannelVersionRecord{
			ID: "v1", ChannelID: "ch-alipay", Version: 1, AppID: "app1",
			AlipayPrivateKeyCipher: "enc1", AlipayPublicKeyCipher: "enc2",
			AlipayGateway: "https://openapi.alipay.com/gateway.do", ConfigFingerprint: "fp1",
			Status: "active", CreatedAt: paidNow,
		},
	); err != nil {
		_ = seedBackend.Close()
		t.Fatal(err)
	}
	ord := storage.PaymentOrderRecord{
		ID: "pay-1", OutTradeNo: "out-1", UserID: "user:buyer1", IdempotencyKey: "idem-1",
		ChannelID: "ch-alipay", ChannelVersionID: "v1", ProductID: "prod-1", ProductNameSnapshot: "100 Credits",
		AmountFen: 1990, CreditsSnapshot: 100, ProductTypeSnapshot: "credits", Currency: "CNY",
		ExpireMinutesSnapshot: 15, ExpiresAt: now.Add(time.Hour).UTC().Format(time.RFC3339Nano),
		Status: storage.PaymentOrderStatusPending, CreatedAt: paidNow, UpdatedAt: paidNow,
	}
	if _, _, err := seedBackend.CreatePaymentOrder(ord); err != nil {
		_ = seedBackend.Close()
		t.Fatal(err)
	}
	if _, applied, err := seedBackend.CompletePaymentCredit(storage.PaymentCreditCompletion{
		OrderID:       "pay-1",
		Provider:      storage.PaymentProviderAlipay,
		TransactionID: "ali-tx-1",
		MerchantID:    "app1",
		PaidAt:        paidNow,
		CreditedAt:    paidNow,
		TradeState:    "TRADE_SUCCESS",
		LedgerEntry: storage.CreditLedgerRow{
			ID:           "led-pay-1",
			UserID:       "user:buyer1",
			Delta:        100,
			BalanceAfter: 100,
			Reason:       "payment_recharge",
			RefID:        "pay-1",
			CreatedAt:    paidNow,
		},
		CreditCoreDocument: map[string]any{
			"balances": map[string]int{"user:buyer1": 100},
		},
	}); err != nil || !applied {
		_ = seedBackend.Close()
		t.Fatalf("CompletePaymentCredit applied=%v err=%v", applied, err)
	}
	_ = seedBackend.Close()

	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	app.accounts.AddAccounts([]string{"tok-openai-1", "tok-openai-2"})
	adminAuth := adminAuthHeader(t, app)

	// RBAC checks: unauthenticated -> 401; unprivileged role -> 403; role with PermViewDashboard -> 200.
	unauthRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(unauthRes, httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil))
	if unauthRes.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want 401", unauthRes.Code)
	}

	plainRole, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "PlainViewer",
		APIPermissions: []string{service.APIPermissionKey(http.MethodGet, "/v1/models")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.CreatePasswordUser("plain-u", "Password123", "Plain", plainRole.ID, true); err != nil {
		t.Fatal(err)
	}
	plainToken := loginTestUser(t, app, "plain-u", "Password123")
	forbidReq := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	forbidReq.Header.Set("Authorization", "Bearer "+plainToken)
	forbidRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(forbidRes, forbidReq)
	if forbidRes.Code != http.StatusForbidden {
		t.Fatalf("plain user status = %d, want 403", forbidRes.Code)
	}

	dashRole, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "DashboardViewer",
		APIPermissions: []string{service.PermViewDashboard},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.CreatePasswordUser("dash-u", "Password123", "Dash", dashRole.ID, true); err != nil {
		t.Fatal(err)
	}
	dashToken := loginTestUser(t, app, "dash-u", "Password123")

	callOverview := func(query, bearer string) adminOverviewResponse {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/admin/overview"+query, nil)
		req.Header.Set("Authorization", bearer)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("GET /api/admin/overview%s status=%d body=%s", query, res.Code, res.Body.String())
		}
		var out adminOverviewResponse
		if err := json.Unmarshal(res.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode overview response: %v", err)
		}
		return out
	}

	// 1. Today overview via PermViewDashboard role: 195 image tasks (chat excluded!), 24 hourly buckets.
	todayOut := callOverview("", "Bearer "+dashToken)
	if todayOut.Period != "today" || len(todayOut.Series) != 24 {
		t.Fatalf("today period=%q series_len=%d, want today / 24", todayOut.Period, len(todayOut.Series))
	}
	if todayOut.Tasks.Total != 195 || todayOut.Tasks.Succeeded != 195 || todayOut.Tasks.TotalImages != 195 || todayOut.Tasks.TotalVideos != 0 {
		t.Fatalf("today tasks = %+v, want 195 image tasks (chat excluded)", todayOut.Tasks)
	}
	if todayOut.Payments.TodayAmountFen != 1990 || todayOut.Users.PaidUsers != 1 {
		t.Fatalf("payments=%+v users=%+v, want 1990 fen and 1 paid user", todayOut.Payments, todayOut.Users)
	}
	if len(todayOut.Payments.ChannelBreakdown) != 1 || todayOut.Payments.ChannelBreakdown[0].Channel != "alipay" {
		t.Fatalf("channel_breakdown = %+v, want alipay", todayOut.Payments.ChannelBreakdown)
	}
	if todayOut.Pools.OpenAI.Total != 2 || todayOut.Pools.Grok.Total != 9 || todayOut.Pools.Grok.Available != 5 || todayOut.Pools.Grok.Cooling != 2 || todayOut.Pools.Grok.Quarantined != 1 || todayOut.Pools.Grok.Disabled != 1 || todayOut.Pools.Grok.TheoreticalSlots != 14 {
		t.Fatalf("unexpected pools = %+v", todayOut.Pools)
	}

	// 2. 7d overview: 195 today images + 12 video tasks (10 succeeded, 2 failed) = 207 total (>180 old cap!), 7 daily buckets.
	out7d := callOverview("?period=7d", adminAuth)
	if len(out7d.Series) != 7 || out7d.Tasks.Total != 207 || out7d.Tasks.Succeeded != 205 || out7d.Tasks.Failed != 2 || out7d.Tasks.TotalImages != 195 || out7d.Tasks.TotalVideos != 10 {
		t.Fatalf("7d overview mismatch: series=%d tasks=%+v", len(out7d.Series), out7d.Tasks)
	}
	if len(out7d.Errors) != 1 || out7d.Errors[0].Count != 2 || !strings.Contains(out7d.Errors[0].Reason, "quota exceeded") {
		t.Fatalf("7d errors = %+v, want 1 aggregated error with count=2", out7d.Errors)
	}

	// 3. 30d overview + capability=video & model filter:
	out30d := callOverview("?period=30d", adminAuth)
	if len(out30d.Series) != 30 || out30d.Tasks.Total != 212 || out30d.Tasks.TotalImages != 205 || out30d.Tasks.TotalVideos != 10 {
		t.Fatalf("30d overview mismatch: series=%d tasks=%+v", len(out30d.Series), out30d.Tasks)
	}
	vidOnly := callOverview("?period=7d&capability=video", adminAuth)
	if vidOnly.Tasks.Total != 12 || vidOnly.Tasks.TotalVideos != 10 || vidOnly.Tasks.TotalImages != 0 {
		t.Fatalf("capability=video tasks=%+v", vidOnly.Tasks)
	}
	editModelOnly := callOverview("?period=30d&model="+util.ImageModelGPT25, adminAuth)
	if editModelOnly.Tasks.Total != 5 || editModelOnly.Tasks.TotalImages != 10 {
		t.Fatalf("model filter tasks=%+v, want 5 tasks / 10 images", editModelOnly.Tasks)
	}

	// 4. Also verify /api/admin/image-task-stats supports period=7d and period=30d.
	for _, p := range []string{"7d", "30d"} {
		req := httptest.NewRequest(http.MethodGet, "/api/admin/image-task-stats?period="+p, nil)
		req.Header.Set("Authorization", adminAuth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("/api/admin/image-task-stats?period=%s status=%d body=%s", p, res.Code, res.Body.String())
		}
	}

	// 5. Clear all retained tasks via AdminClearTasksTyped("") and verify ledger keeps 30d totals alive!
	if _, err := app.tasks.AdminClearTasksTyped(""); err != nil {
		t.Fatalf("AdminClearTasksTyped: %v", err)
	}
	afterClear := callOverview("?period=30d", adminAuth)
	if afterClear.Tasks.Total != 212 || afterClear.Tasks.TotalImages != 205 || afterClear.Tasks.TotalVideos != 10 {
		t.Fatalf("ledger failed to preserve stats after task log clear: %+v", afterClear.Tasks)
	}
}

func TestAdminOverviewSlowGrokRuntimeTimesOutQuickly(t *testing.T) {
	slowGrok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			return
		case <-time.After(5 * time.Second):
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer slowGrok.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", slowGrok.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("s", 32))
	app := newTestApp(t)
	defer app.Close()

	start := time.Now()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	elapsed := time.Since(start)

	if res.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	if elapsed > 2500*time.Millisecond {
		t.Fatalf("overview hung on slow grok-runtime for %v (want <= 2.5s)", elapsed)
	}
}

func TestRedeemCodeEndpointRateLimiting(t *testing.T) {
	resetAuthRateLimiterForTest()
	defer resetAuthRateLimiterForTest()

	app := newTestApp(t)
	defer app.Close()

	if _, err := app.auth.CreatePasswordUser("redeem-user", "Password123", "Redeemer", "", true); err != nil {
		t.Fatal(err)
	}
	token := loginTestUser(t, app, "redeem-user", "Password123")

	for attempt := 1; attempt <= redeemCodeUserRateMax+1; attempt++ {
		req := httptest.NewRequest(http.MethodPost, "/api/profile/credits/redeem", strings.NewReader(`{"key":"INVALID-CODE"}`))
		req.Header.Set("Authorization", "Bearer "+token)
		req.RemoteAddr = "198.51.100.42:54321"
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if attempt <= redeemCodeUserRateMax {
			if res.Code == http.StatusTooManyRequests {
				t.Fatalf("attempt %d unexpectedly rate-limited early", attempt)
			}
			continue
		}
		if res.Code != http.StatusTooManyRequests {
			t.Fatalf("attempt %d status=%d, want 429 TooManyRequests", attempt, res.Code)
		}
		if res.Header().Get("Retry-After") == "" {
			t.Fatal("expected Retry-After header on 429 response")
		}
	}
}

func TestAuditLogOmitsGETResponseBodyAndSkipsOverviewPolling(t *testing.T) {
	clearManagedSettingEnvForTest(t)
	app := newTestApp(t)
	defer app.Close()
	auth := adminAuthHeader(t, app)

	// 1. Polling GETs skip audit log on 200 OK.
	for _, path := range []string{"/api/admin/overview", "/api/admin/image-task-stats", "/api/admin/image-task-logs", "/api/logs"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", auth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("GET %s status=%d", path, res.Code)
		}
	}
	logs := app.logs.Search(service.LogQuery{Limit: 50})
	for _, path := range []string{"/api/admin/overview", "/api/admin/image-task-stats", "/api/admin/image-task-logs", "/api/logs"} {
		if item := findLogByDetail(logs, "path", path); item != nil {
			t.Fatalf("expected polling GET %s to skip audit log, got %#v", path, item)
		}
	}

	// 2. Non-polling GET (/api/settings) records audit metadata WITHOUT response_body.
	getReq := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	getReq.Header.Set("Authorization", auth)
	getRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("GET /api/settings status=%d", getRes.Code)
	}

	// 3. Mutating POST (/api/settings) STILL records response_body.
	postReq := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"image_concurrent_limit":5}`))
	postReq.Header.Set("Authorization", auth)
	postRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(postRes, postReq)
	if postRes.Code != http.StatusOK {
		t.Fatalf("POST /api/settings status=%d body=%s", postRes.Code, postRes.Body.String())
	}

	logs = app.logs.Search(service.LogQuery{Limit: 50})
	var foundGet, foundPost bool
	for _, item := range logs {
		detail, _ := item["detail"].(map[string]any)
		if detail["path"] != "/api/settings" {
			continue
		}
		switch detail["method"] {
		case http.MethodGet:
			foundGet = true
			if _, hasBody := detail["response_body"]; hasBody {
				t.Fatalf("GET /api/settings should omit response_body, got %#v", detail["response_body"])
			}
		case http.MethodPost:
			foundPost = true
			if _, hasBody := detail["response_body"]; !hasBody {
				t.Fatalf("POST /api/settings should retain response_body, detail=%#v", detail)
			}
		}
	}
	if !foundGet || !foundPost {
		t.Fatalf("expected both GET and POST audit entries for /api/settings (foundGet=%v foundPost=%v)", foundGet, foundPost)
	}
}

func TestSettingsUpdateSyncsImageChannelsAndClearanceWithoutEnvRace(t *testing.T) {
	clearManagedSettingEnvForTest(t)
	app := newTestApp(t)
	defer app.Close()
	auth := adminAuthHeader(t, app)

	// Update credit costs and concurrency via POST /api/settings and verify built-in channels sync!
	body := `{"gpt_image_2_credit_cost":9,"grok_image_credit_cost_1k":4,"grok_image_credit_cost_2k":7,"image_concurrent_limit":11,"upstream_clearance_enabled":true,"upstream_clearance_mode":"flaresolverr","flaresolverr_url":"http://127.0.0.1:8191"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(body))
	req.Header.Set("Authorization", auth)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("POST /api/settings status=%d body=%s", res.Code, res.Body.String())
	}

	resolvedGPT, foundGPT, err := app.imageChannels.ResolveSystemModelByUpstream(util.ImageModelGPT, service.ImageCapabilityGenerate)
	if err != nil || !foundGPT {
		t.Fatalf("ResolveSystemModelByUpstream(gpt) found=%v err=%v", foundGPT, err)
	}
	if resolvedGPT.CreditCost != 9 || resolvedGPT.MaxConcurrency != 11 {
		t.Fatalf("expected synced GPT cost=9 and concurrency=11, got cost=%d concurrency=%d", resolvedGPT.CreditCost, resolvedGPT.MaxConcurrency)
	}

	resolvedGrok, foundGrok, err := app.imageChannels.ResolveSystemModelByUpstream(util.ImageModelGrokImagine, service.ImageCapabilityGenerate)
	if err != nil || !foundGrok {
		t.Fatalf("ResolveSystemModelByUpstream(grok) found=%v err=%v", foundGrok, err)
	}
	if resolvedGrok.CreditCost != 4 || resolvedGrok.CreditCosts["2k"] != 7 || resolvedGrok.MaxConcurrency != 11 {
		t.Fatalf("expected synced Grok 1k=4 2k=7 concurrency=11, got %+v", resolvedGrok)
	}

	// Concurrent reads and updates must be completely race-free without touching os.Setenv.
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(2)
		go func(idx int) {
			defer wg.Done()
			payload := fmt.Sprintf(`{"upstream_clearance_enabled":%v,"image_challenge_cooldown_seconds":%d}`, idx%2 == 0, 120+idx)
			r := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(payload))
			r.Header.Set("Authorization", auth)
			w := httptest.NewRecorder()
			app.Handler().ServeHTTP(w, r)
		}(i)
		go func() {
			defer wg.Done()
			_ = service.UpstreamClearanceEnabled()
			_ = service.UpstreamClearanceMode()
		}()
	}
	wg.Wait()
}

func TestRunMediaCleanupExecutesLocalRetentionWhenCloudStorageDisabled(t *testing.T) {
	clearManagedSettingEnvForTest(t)
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "local-cleanup.db")))

	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	if _, err := app.config.Update(map[string]any{
		"media_storage_provider":     "local",
		"media_auto_cleanup_enabled": true,
		"video_auto_cleanup_enabled": true,
		"image_retention_days":       3,
		"video_retention_days":       3,
	}); err != nil {
		t.Fatal(err)
	}

	// Verify cloud_storage_enabled is false (default).
	settings, err := app.paymentOrders.Settings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.CloudStorageEnabled {
		t.Fatal("expected CloudStorageEnabled == false by default")
	}

	oldMod := time.Now().Add(-10 * 24 * time.Hour)
	imgPath := filepath.Join(app.config.ImagesDir(), "2026", "08", "01", "expired-local.png")
	if err := os.MkdirAll(filepath.Dir(imgPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := writeHTTPTestPNG(imgPath); err != nil {
		t.Fatal(err)
	}
	_ = os.Chtimes(imgPath, oldMod, oldMod)
	app.images.RecordImageOwners([]string{"2026/08/01/expired-local.png"}, "user:free")

	vid := service.VideoAsset{
		TaskID:     "vid-expired-local",
		OwnerID:    "user:free",
		Visibility: service.VideoAssetVisibilityPrivate,
		CreatedAt:  oldMod.UTC().Format(time.RFC3339),
	}
	vidPath := app.videos.ContentPath(vid.OwnerID, vid.TaskID)
	if err := os.MkdirAll(filepath.Dir(vidPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(vidPath, []byte("mp4"), 0o644); err != nil {
		t.Fatal(err)
	}
	_ = os.Chtimes(vidPath, oldMod, oldMod)
	if _, err := app.videos.Record(vid); err != nil {
		t.Fatal(err)
	}

	app.runMediaCleanup(context.Background())

	if _, err := os.Stat(imgPath); !os.IsNotExist(err) {
		t.Fatalf("expected expired local image to be deleted even when cloud_storage_enabled=false, stat err=%v", err)
	}
	if _, err := os.Stat(vidPath); !os.IsNotExist(err) {
		t.Fatalf("expected expired local video to be deleted even when cloud_storage_enabled=false, stat err=%v", err)
	}
}
