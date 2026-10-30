package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/version"
)

func TestAppAuthAndSPACompatibility(t *testing.T) {
	originalVersion := version.Version
	version.Version = "test-build"
	t.Cleanup(func() { version.Version = originalVersion })

	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if user.Role != "user" {
		t.Fatalf("created user = %#v", user)
	}

	// New credentials store only key_hash; re-display is intentionally unavailable.
	req := httptest.NewRequest(http.MethodGet, "/api/auth/users/"+user.ID+"/key", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("reveal user key status = %d body = %s, want 404 for hash-only storage", res.Code, res.Body.String())
	}
	// Raw key from create still authenticates.
	if identity := app.auth.Authenticate(rawKey); identity == nil || identity.Role != "user" {
		t.Fatalf("Authenticate(create raw) = %#v", identity)
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/auth/session status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	if login["role"] != "user" {
		t.Fatalf("login role = %#v", login)
	}
	if login["version"] != "test-build" {
		t.Fatalf("login version = %#v", login["version"])
	}

	req = httptest.NewRequest(http.MethodGet, "/version", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/version status = %d body = %s", res.Code, res.Body.String())
	}
	var versionBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &versionBody); err != nil {
		t.Fatalf("version json: %v", err)
	}
	if versionBody["version"] != "test-build" {
		t.Fatalf("/version body = %#v", versionBody)
	}

	anonReq := httptest.NewRequest(http.MethodGet, "/health", nil)
	anonRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(anonRes, anonReq)
	if anonRes.Code != http.StatusOK {
		t.Fatalf("anonymous /health status = %d body = %s", anonRes.Code, anonRes.Body.String())
	}
	var anonHealth map[string]any
	if err := json.Unmarshal(anonRes.Body.Bytes(), &anonHealth); err != nil {
		t.Fatalf("anonymous health json: %v", err)
	}
	if anonHealth["status"] != "ok" || anonHealth["ready"] != true || anonHealth["version"] != "test-build" {
		t.Fatalf("anonymous /health body = %#v", anonHealth)
	}
	for _, hiddenKey := range []string{"account_pool", "task_executors", "features_v35", "payment_callbacks"} {
		if _, leaked := anonHealth[hiddenKey]; leaked {
			t.Fatalf("anonymous /health leaked %s: %#v", hiddenKey, anonHealth)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/health status = %d body = %s", res.Code, res.Body.String())
	}
	var health map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &health); err != nil {
		t.Fatalf("health json: %v", err)
	}
	executors, _ := health["task_executors"].(map[string]any)
	if executors["image"] == nil || executors["video"] == nil {
		t.Fatalf("health task executors = %#v", executors)
	}
	stageDurations, _ := health["task_stage_durations"].(map[string]any)
	imageDurations, _ := stageDurations["image"].(map[string]any)
	videoDurations, _ := stageDurations["video"].(map[string]any)
	if imageDurations["stages"] == nil || videoDurations["stages"] == nil {
		t.Fatalf("health task stage durations = %#v", stageDurations)
	}
	mediaStorage, _ := health["media_storage"].(map[string]any)
	if mediaStorage["status"] != "local" {
		t.Fatalf("health media storage = %#v", mediaStorage)
	}
	paymentCallbacks, _ := health["payment_callbacks"].(map[string]any)
	if paymentCallbacks["status"] != "unavailable" || paymentCallbacks["available"] != false {
		t.Fatalf("health payment callbacks = %#v", paymentCallbacks)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/announcements?target=login", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/announcements status = %d body = %s", res.Code, res.Body.String())
	}
	var announcementsBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("announcements json: %v", err)
	}
	if items := logItems(announcementsBody); len(items) != 0 {
		t.Fatalf("unexpected initial announcements = %#v", announcementsBody)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/announcements", strings.NewReader(`{"title":"通知 A","content":"今晚维护","show_login":true,"show_image":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create login announcement status = %d body = %s", res.Code, res.Body.String())
	}
	var createBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createBody); err != nil {
		t.Fatalf("create announcement json: %v", err)
	}
	createdItem, _ := createBody["item"].(map[string]any)
	createdID, _ := createdItem["id"].(string)
	if createdID == "" {
		t.Fatalf("missing created announcement id: %#v", createBody)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/announcements", strings.NewReader(`{"title":"通知 B","content":"画图页公告","show_login":false,"show_image":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create image announcement status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/announcements", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin list announcements status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("admin announcements json: %v", err)
	}
	if items := logItems(announcementsBody); len(items) != 2 {
		t.Fatalf("admin announcements length = %d body = %#v", len(items), announcementsBody)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/announcements?target=login", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("public login announcements status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("public login announcements json: %v", err)
	}
	items := logItems(announcementsBody)
	if len(items) != 1 || items[0]["title"] != "通知 A" {
		t.Fatalf("unexpected public login announcements = %#v", announcementsBody)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/announcements/"+createdID, strings.NewReader(`{"enabled":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("disable announcement status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/announcements?target=login", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("public login announcements after disable status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("public login announcements after disable json: %v", err)
	}
	if items := logItems(announcementsBody); len(items) != 0 {
		t.Fatalf("disabled announcement should be hidden: %#v", announcementsBody)
	}

	msgReq := httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader("{"))
	msgReq.Header.Set("x-api-key", rawKey)
	msgRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(msgRes, msgReq)
	if msgRes.Code != http.StatusBadRequest {
		t.Fatalf("x-api-key auth did not reach JSON validation, status = %d body = %s", msgRes.Code, msgRes.Body.String())
	}

	for _, path := range []string{"/", "/settings"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `<div id="root"></div>`) {
			t.Fatalf("%s status/body = %d %q", path, res.Code, res.Body.String())
		}
	}
	req = httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("missing asset status = %d", res.Code)
	}
}

func TestAdminSystemCheckUpdates(t *testing.T) {
	releaseAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/looksky888/shengtu-platform/releases/latest" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"tag_name": "v1.2.0",
			"name": "v1.2.0",
			"body": "release notes",
			"html_url": "https://github.com/ZyphrZero/chatgpt2api/releases/tag/v1.2.0",
			"published_at": "2026-01-01T00:00:00Z",
			"assets": [
				{"name":"chatgpt2api_1.2.0_linux_amd64.tar.gz","browser_download_url":"https://github.com/ZyphrZero/chatgpt2api/releases/download/v1.2.0/chatgpt2api_1.2.0_linux_amd64.tar.gz","size":123},
				{"name":"checksums.txt","browser_download_url":"https://github.com/ZyphrZero/chatgpt2api/releases/download/v1.2.0/checksums.txt","size":64}
			]
		}`))
	}))
	defer releaseAPI.Close()

	originalVersion := version.Version
	originalBuildType := version.BuildType
	version.Version = "1.1.0"
	version.BuildType = "release"
	t.Cleanup(func() {
		version.Version = originalVersion
		version.BuildType = originalBuildType
	})

	app := newTestApp(t)
	defer app.Close()
	app.update = service.NewUpdateService(service.UpdateOptions{
		APIBaseURL:     releaseAPI.URL,
		CurrentVersion: version.Get(),
		BuildType:      version.GetBuildType(),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/admin/system/check-updates?force=true", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("check updates status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("check updates json: %v", err)
	}
	if body["current_version"] != "1.1.0" || body["latest_version"] != "1.2.0" || body["has_update"] != true || body["build_type"] != "release" {
		t.Fatalf("unexpected check updates body = %#v", body)
	}
}

func TestPasswordAccountLoginAndRegistrationToggle(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(authJSON(`{"username":"admin","password":"AdminPass123!"}`)))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin password login status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	adminToken, _ := login["token"].(string)
	if adminToken == "" || login["role"] != service.AuthRoleAdmin || login["subject_id"] != "admin" {
		t.Fatalf("admin login body = %#v", login)
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(authJSON(`{"email":"alice@example.test","email_code":"123456","password":"Password123","name":"Alice"}`)))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("disabled registration status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration status = %d body = %s", res.Code, res.Body.String())
	}

	deviceCookie := sendTestRegistrationEmailCode(t, app, "alice@example.test", "", "", "")
	req = httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(authJSON(`{"email":"alice@example.test","email_code":"123456","password":"Password123","name":"Alice"}`)))
	req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceCookie})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enabled registration status = %d body = %s", res.Code, res.Body.String())
	}
	var registered map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &registered); err != nil {
		t.Fatalf("register json: %v", err)
	}
	userToken, _ := registered["token"].(string)
	if userToken == "" || registered["role"] != service.AuthRoleUser || registered["name"] != "Alice" {
		t.Fatalf("register body = %#v", registered)
	}
	if registered["role_id"] != service.DefaultManagedRoleID {
		t.Fatalf("registered role fields = %#v", registered)
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("registered session status = %d body = %s", res.Code, res.Body.String())
	}
}
