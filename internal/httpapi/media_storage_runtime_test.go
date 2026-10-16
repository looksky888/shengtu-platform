package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMediaStorageRuntimeStateDetectsPendingRestart(t *testing.T) {
	app := newTestApp(t)
	configureR2AfterAppStart(t, app)

	state := app.mediaStorageRuntimeState()
	if state.ActiveProvider != "local" || state.ConfiguredProvider != "r2" || !state.RestartRequired {
		t.Fatalf("runtime state = %#v", state)
	}
}

func TestMediaStorageCleanupRejectsDeleteBeforeR2Restart(t *testing.T) {
	app := newTestApp(t)
	configureR2AfterAppStart(t, app)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/media-storage/local-cleanup", strings.NewReader(`{"mode":"delete","confirmation_token":"verified"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusConflict {
		t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "重启主应用") {
		t.Fatalf("body = %s", res.Body.String())
	}
}

func configureR2AfterAppStart(t *testing.T, app *App) {
	t.Helper()
	for _, key := range []string{
		"CHATGPT2API_MEDIA_STORAGE_PROVIDER",
		"CHATGPT2API_MEDIA_R2_ACCOUNT_ID",
		"CHATGPT2API_MEDIA_R2_ACCESS_KEY_ID",
		"CHATGPT2API_MEDIA_R2_SECRET_ACCESS_KEY",
		"CHATGPT2API_MEDIA_R2_BUCKET",
	} {
		t.Setenv(key, "")
	}
	if _, err := app.config.Update(map[string]any{
		"media_storage_provider":     "r2",
		"media_r2_account_id":        "test-account",
		"media_r2_access_key_id":     "test-access",
		"media_r2_secret_access_key": "test-secret",
		"media_r2_bucket":            "test-bucket",
	}); err != nil {
		t.Fatalf("config.Update() error = %v", err)
	}
}
