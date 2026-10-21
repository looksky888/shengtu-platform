package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/config"
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

// authJSON appends accept_terms payload required by login/register handlers.
func authJSON(body string) string {
	body = strings.TrimSpace(body)
	if body == "" || body == "{}" {
		return fmt.Sprintf(`{"accept_terms":true,"terms_version":%q}`, CurrentTermsVersion)
	}
	if !strings.HasPrefix(body, "{") || !strings.HasSuffix(body, "}") {
		return body
	}
	inner := strings.TrimSpace(body[1 : len(body)-1])
	if inner == "" {
		return fmt.Sprintf(`{"accept_terms":true,"terms_version":%q}`, CurrentTermsVersion)
	}
	return fmt.Sprintf(`{%s,"accept_terms":true,"terms_version":%q}`, inner, CurrentTermsVersion)
}

func logItems(payload map[string]any) []map[string]any {
	rawItems, _ := payload["items"].([]any)
	items := make([]map[string]any, 0, len(rawItems))
	for _, raw := range rawItems {
		if item, ok := raw.(map[string]any); ok {
			items = append(items, item)
		}
	}
	return items
}

func findLogBySummary(items []map[string]any, summary string) map[string]any {
	for _, item := range items {
		if item["summary"] == summary {
			return item
		}
	}
	return nil
}

func findHTTPItem(items []map[string]any, id string) map[string]any {
	for _, item := range items {
		if item["id"] == id {
			return item
		}
	}
	return nil
}

func findResponseCookie(res *http.Response, name string) *http.Cookie {
	for _, cookie := range res.Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

func findLogByDetail(items []map[string]any, key, value string) map[string]any {
	return findLogByDetails(items, map[string]any{key: value})
}

func findLogByDetails(items []map[string]any, values map[string]any) map[string]any {
	for _, item := range items {
		detail, _ := item["detail"].(map[string]any)
		matches := true
		for key, value := range values {
			if detail[key] != value {
				matches = false
				break
			}
		}
		if matches {
			return item
		}
	}
	return nil
}

const (
	testAdminUsername         = "admin"
	testAdminPassword         = "AdminPass123!"
	testRegistrationEmailCode = "123456"
)

func adminAuthHeader(t *testing.T, app *App) string {
	t.Helper()
	identity, token, err := app.auth.LoginPassword(testAdminUsername, testAdminPassword)
	if err != nil {
		t.Fatalf("admin LoginPassword() error = %v", err)
	}
	if identity == nil || identity.Role != service.AuthRoleAdmin || token == "" {
		t.Fatalf("admin LoginPassword() identity=%#v token=%q", identity, token)
	}
	return "Bearer " + token
}

func newTestApp(t *testing.T) *App {
	t.Helper()
	resetAuthRateLimiterForTest()
	// config.Update also writes process env; clear login-page keys so -count=N app-meta stays clean (F-01).
	// Do not wipe all managed keys here — that can race with proxy e2e tests sharing the process.
	for _, key := range []string{
		"CHATGPT2API_LOGIN_PAGE_IMAGE_URL",
		"CHATGPT2API_LOGIN_PAGE_IMAGE_MODE",
		"CHATGPT2API_LOGIN_PAGE_IMAGE_ZOOM",
		"CHATGPT2API_LOGIN_PAGE_IMAGE_POSITION_X",
		"CHATGPT2API_LOGIN_PAGE_IMAGE_POSITION_Y",
		"CHATGPT2API_REGISTRATION_ENABLED",
		"CHATGPT2API_GPT_IMAGE_2_CREDIT_COST",
		"CHATGPT2API_GPT_IMAGE_2_5_CREDIT_COST",
		"CHATGPT2API_GPT_IMAGE_2_5_FLARE_CREDIT_COST",
		"CHATGPT2API_GPT_IMAGE_2_5_SUNBURST_CREDIT_COST",
	} {
		unsetTestEnv(t, key)
	}
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "json")
	t.Setenv("DATABASE_URL", "")
	app, err := NewApp()
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	assertConfigRootIsolated(t, root, app.config.RootDir)
	configureTestRegistrationEmail(t, app)
	app.engine.ListModelsFunc = func(context.Context) (map[string]any, error) {
		return map[string]any{"object": "list", "data": []map[string]any{}}, nil
	}
	t.Cleanup(func() {
		app.Close()
	})
	return app
}

func configureTestRegistrationEmail(t *testing.T, app *App) {
	t.Helper()
	backend, err := app.config.StorageBackend()
	if err != nil {
		t.Fatalf("StorageBackend() error = %v", err)
	}
	emailService, err := service.NewRegistrationEmailService(app.config.DataDir, backend, &service.RegistrationEmailOptions{
		SendMail:     func(context.Context, service.EmailSMTPConfig, string, string, string) error { return nil },
		GenerateCode: func() (string, error) { return testRegistrationEmailCode, nil },
	})
	if err != nil {
		t.Fatalf("NewRegistrationEmailService() error = %v", err)
	}
	if _, err := emailService.UpdateSettings(service.EmailSettingsInput{
		Enabled: true, Host: "smtp.example.test", Port: 25, Encryption: "none",
		FromEmail: "no-reply@example.test", FromName: "生图测试",
	}); err != nil {
		t.Fatalf("UpdateSettings() error = %v", err)
	}
	app.email = emailService
}

func sendTestRegistrationEmailCode(t *testing.T, app *App, email, remoteAddr, deviceCookie, forwardedFor string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/auth/email-code", strings.NewReader(fmt.Sprintf(`{"email":%q}`, email)))
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	if deviceCookie != "" {
		req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceCookie})
	}
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("send email code for %s status = %d body = %s", email, res.Code, res.Body.String())
	}
	for _, cookie := range res.Result().Cookies() {
		if cookie.Name == service.DeviceCookieName() {
			return cookie.Value
		}
	}
	if deviceCookie == "" {
		t.Fatalf("send email code for %s did not return device cookie", email)
	}
	return deviceCookie
}

func loginTestUser(t *testing.T, app *App, username, password string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(authJSON(fmt.Sprintf(`{"username":%q,"password":%q}`, username, password))))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("login %s status = %d body = %s", username, res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("login json: %v", err)
	}
	token, _ := body["token"].(string)
	if token == "" {
		t.Fatalf("login response missing token: %#v", body)
	}
	return token
}

func registerTestUser(t *testing.T, app *App, username, name, inviteCode string) string {
	t.Helper()
	email := username
	if !strings.Contains(email, "@") {
		email += "@example.test"
	}
	deviceCookie := sendTestRegistrationEmailCode(t, app, email, "", "", "")
	path := "/auth/register"
	if inviteCode != "" {
		path += "?invite_code=" + inviteCode
	}
	body := authJSON(fmt.Sprintf(`{"email":%q,"email_code":%q,"password":"Password123","name":%q}`, email, testRegistrationEmailCode, name))
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceCookie})
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("register %s status = %d body = %s", username, res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("register json: %v", err)
	}
	token, _ := payload["token"].(string)
	if token == "" {
		t.Fatalf("register response missing token: %#v", payload)
	}
	return token
}

func getProfileCredits(t *testing.T, app *App, token string) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/profile/credits", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile credits status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("profile credits json: %v", err)
	}
	return body
}

func waitCreationTaskStatus(t *testing.T, app *App, token, taskID, want string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		req := httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids="+url.QueryEscape(taskID), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list task status = %d body = %s", res.Code, res.Body.String())
		}
		var body map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
			t.Fatalf("list task json: %v", err)
		}
		items := logItems(body)
		if len(items) > 0 && items[0]["status"] == want {
			return items[0]
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("task %s did not reach status %s", taskID, want)
	return nil
}

func seedImageCreditCharge(t *testing.T, app *App, balance, amount int) (service.Identity, *imageCreditCharge) {
	t.Helper()
	user, _, err := app.auth.CreateAPIKey(service.AuthRoleUser, "direct image user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	userID := user.ID
	if _, _, err := app.credits.Add(userID, balance, "test", "seed-"+util.NewHex(6)); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	refID := "direct-test:" + util.NewHex(6)
	if _, _, err := app.credits.Deduct(userID, amount, service.CreditReasonImageGeneration, refID); err != nil {
		t.Fatalf("Deduct() error = %v", err)
	}
	return service.Identity{ID: userID, Role: service.AuthRoleUser, Kind: service.AuthKindAPIKey}, &imageCreditCharge{UserID: userID, Amount: amount, RefID: refID}
}

func imageTestStream(items []map[string]any, streamErr error) *protocol.StreamResult {
	itemCh := make(chan map[string]any, len(items))
	for _, item := range items {
		itemCh <- item
	}
	close(itemCh)
	errCh := make(chan error, 1)
	errCh <- streamErr
	close(errCh)
	return &protocol.StreamResult{Items: itemCh, Err: errCh, Kind: "openai"}
}

func postProfileCheckin(t *testing.T, app *App, token string) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/profile/checkin", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile checkin status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("profile checkin json: %v", err)
	}
	return body
}

func getProfileInvite(t *testing.T, app *App, token string) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/profile/invite", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile invite status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("profile invite json: %v", err)
	}
	return body
}

func unsetTestEnv(t *testing.T, key string) {
	t.Helper()
	original, existed := os.LookupEnv(key)
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("Unsetenv(%s): %v", key, err)
	}
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv(key, original)
			return
		}
		_ = os.Unsetenv(key)
	})
}

func writeHTTPTestPNG(path string) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return encodeHTTPTestPNG(file)
}

func encodeHTTPTestPNG(file interface {
	Write([]byte) (int, error)
}) error {
	img := image.NewRGBA(image.Rect(0, 0, 12, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 12; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 16), G: uint8(y * 16), B: 180, A: 255})
		}
	}
	return png.Encode(file, img)
}

// newTestConfigStore isolates config/data under t.TempDir so tests never write the real project tree.
func newTestConfigStore(t *testing.T) *config.Store {
	t.Helper()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	cfg, err := config.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	assertConfigRootIsolated(t, root, cfg.RootDir)
	return cfg
}

// assertConfigRootIsolated fails the test when config root is not under the given temp root (F-01).
func assertConfigRootIsolated(t *testing.T, tempRoot, storeRoot string) {
	t.Helper()
	tempRoot = filepath.Clean(tempRoot)
	storeRoot = filepath.Clean(storeRoot)
	if storeRoot != tempRoot && !strings.HasPrefix(storeRoot, tempRoot+string(filepath.Separator)) {
		t.Fatalf("config root not isolated under TempDir: root=%q store=%q", tempRoot, storeRoot)
	}
}
