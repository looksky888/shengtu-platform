package httpapi

import (
	"chatgpt2api/internal/service"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCanvasSettingsAccessAndMetadata(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "canvas-reader", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	adminHeader := adminAuthHeader(t, app)
	for _, tc := range []struct {
		auth, body string
		status     int
	}{
		{"", `{"canvas_url":"https://canvas.example.com/"}`, 401},
		{"Bearer " + rawKey, `{"canvas_url":"https://canvas.example.com/"}`, 403},
		{adminHeader, `{"canvas_url":"javascript:alert(1)"}`, 400},
		{adminHeader, `{"canvas_url":"http://70.39.183.38:3000/"}`, 200},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(tc.body))
		if tc.auth != "" {
			r.Header.Set("Authorization", tc.auth)
		}
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("status=%d want=%d body=%s", w.Code, tc.status, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/app-meta", nil))
	var meta map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &meta); err != nil {
		t.Fatal(err)
	}
	if meta["canvas_url"] != "http://70.39.183.38:3000/" {
		t.Fatalf("meta=%v", meta)
	}
	if _, err := app.config.Update(map[string]any{"canvas_url": ""}); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	app.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/app-meta", nil))
	if err := json.Unmarshal(w.Body.Bytes(), &meta); err != nil {
		t.Fatal(err)
	}
	if meta["canvas_url"] != "" {
		t.Fatalf("clear not reflected: %v", meta)
	}
}

func TestCanvasSettingRequiresAdminEvenWithSettingsPermission(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	user, key, err := app.auth.CreateAPIKey(service.AuthRoleUser, "settings-editor", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "settings-editor",
		MenuPaths:      []string{"/settings"},
		APIPermissions: []string{service.APIPermissionKey(http.MethodPost, "/api/settings")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.auth.UpdateUser(user.ID, service.ManagedUserUpdate{RoleID: service.StringPtr(role.ID)}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"canvas_url":"https://canvas.example.com/"}`, 403},
		{`{"canvas_url":"","base_url":"https://studio.example.com"}`, 200},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(tc.body))
		r.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("status=%d want=%d body=%s", w.Code, tc.status, w.Body.String())
		}
	}
}
