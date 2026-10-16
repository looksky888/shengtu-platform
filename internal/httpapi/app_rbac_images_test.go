package httpapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestEmptyCollectionEndpointsReturnArrays(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	for _, tc := range []struct {
		name string
		path string
		keys []string
	}{
		{name: "accounts", path: "/api/accounts", keys: []string{"items"}},
		{name: "images", path: "/api/images", keys: []string{"items", "groups"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set("Authorization", adminAuthHeader(t, app))
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusOK {
				t.Fatalf("%s status = %d body = %s", tc.path, res.Code, res.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
				t.Fatalf("%s json: %v", tc.path, err)
			}
			for _, key := range tc.keys {
				items, ok := payload[key].([]any)
				if !ok || items == nil || len(items) != 0 {
					t.Fatalf("%s %q = %#v, want empty array", tc.path, key, payload[key])
				}
			}
		})
	}
}

func TestRBACPermissionsGateManagementAPIs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "operator", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("default user accounts status = %d body = %s", res.Code, res.Body.String())
	}

	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "accounts viewer",
		MenuPaths:      []string{"/accounts"},
		APIPermissions: []string{service.APIPermissionKey(http.MethodGet, "/api/accounts")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	userID := user.ID
	updated, _ := app.auth.UpdateUser(userID, service.ManagedUserUpdate{RoleID: service.StringPtr(role.ID)})
	if updated.ID == "" {
		t.Fatal("UpdateUser() returned empty user")
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("login after permission update status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	if paths := util.AsStringSlice(login["menu_paths"]); len(paths) != 1 || paths[0] != "/accounts" {
		t.Fatalf("login menu_paths = %#v", login["menu_paths"])
	}
	if login["role_id"] != role.ID || login["role_name"] != "accounts viewer" {
		t.Fatalf("login role fields = %#v", login)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted user accounts status = %d body = %s", res.Code, res.Body.String())
	}

	app.accounts.AddAccounts([]string{"pool-token"})
	req = httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted user accounts with token status = %d body = %s", res.Code, res.Body.String())
	}
	var accountsBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &accountsBody); err != nil {
		t.Fatalf("accounts json: %v", err)
	}
	accountItems := logItems(accountsBody)
	if len(accountItems) != 1 {
		t.Fatalf("accounts body = %#v", accountsBody)
	}
	if _, ok := accountItems[0]["access_token"]; ok {
		t.Fatalf("account list should not expose access_token without export permission: %#v", accountItems[0])
	}
	accountID, _ := accountItems[0]["id"].(string)
	if accountID == "" || accountItems[0]["token_preview"] == "" {
		t.Fatalf("account list missing id/token preview: %#v", accountItems[0])
	}
	req = httptest.NewRequest(http.MethodGet, "/api/accounts?keyword=pool-token", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	var tokenSearchWithoutPermission map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &tokenSearchWithoutPermission); err != nil {
		t.Fatalf("token search json: %v", err)
	}
	if total := util.ToInt(tokenSearchWithoutPermission["total"], -1); res.Code != http.StatusOK || total != 0 {
		t.Fatalf("token search without permission status=%d body=%#v", res.Code, tokenSearchWithoutPermission)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/accounts/tokens", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("ungranted account token export status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(`{"tokens":["x"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("ungranted write accounts status = %d body = %s", res.Code, res.Body.String())
	}

	apisDelete := []string{
		service.APIPermissionKey(http.MethodGet, "/api/accounts"),
		service.APIPermissionKey(http.MethodDelete, "/api/accounts"),
	}
	if _, err := app.auth.UpdateRole(role.ID, service.ManagedRoleUpdate{APIPermissions: &apisDelete}); err != nil {
		t.Fatalf("UpdateRole(delete accounts) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodDelete, "/api/accounts", strings.NewReader(`{"account_ids":["`+accountID+`"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete account by id status = %d body = %s", res.Code, res.Body.String())
	}

	app.accounts.AddAccounts([]string{"pool-token"})
	apisExport := []string{
		service.APIPermissionKey(http.MethodGet, "/api/accounts"),
		service.APIPermissionKey(http.MethodGet, "/api/accounts/tokens"),
	}
	if _, err := app.auth.UpdateRole(role.ID, service.ManagedRoleUpdate{APIPermissions: &apisExport}); err != nil {
		t.Fatalf("UpdateRole(export tokens) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/accounts/tokens", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted account token export status = %d body = %s", res.Code, res.Body.String())
	}
	var tokenExport map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &tokenExport); err != nil {
		t.Fatalf("token export json: %v", err)
	}
	tokens := util.AsStringSlice(tokenExport["tokens"])
	if len(tokens) != 1 || tokens[0] != "pool-token" {
		t.Fatalf("exported tokens = %#v", tokenExport["tokens"])
	}
	req = httptest.NewRequest(http.MethodGet, "/api/accounts?keyword=pool-token", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	var tokenSearchWithPermission map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &tokenSearchWithPermission); err != nil {
		t.Fatalf("permitted token search json: %v", err)
	}
	if total := util.ToInt(tokenSearchWithPermission["total"], -1); res.Code != http.StatusOK || total != 1 {
		t.Fatalf("token search with permission status=%d body=%#v", res.Code, tokenSearchWithPermission)
	}
}

func TestRBACImageDeletePermissionAllowsDelegatedUser(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "user-operator-1", Name: "operator"}
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image-operator", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	identity := app.auth.Authenticate(rawKey)
	if identity == nil {
		t.Fatal("Authenticate() returned nil")
	}
	ownerScope := identity.OwnerID
	if ownerScope == "" {
		ownerScope = identity.ID
	}

	ownRel := "delegated-own.png"
	otherRel := "delegated-other.png"
	ownPath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(ownRel))
	otherPath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(otherRel))
	if err := writeHTTPTestPNG(ownPath); err != nil {
		t.Fatalf("write own image: %v", err)
	}
	if err := writeHTTPTestPNG(otherPath); err != nil {
		t.Fatalf("write other image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{ownRel}, ownerScope, "operator", service.ImageVisibilityPrivate)
	app.images.RecordGeneratedImages([]string{otherRel}, "another-owner", "Another Owner", service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+ownRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("default user delete status = %d body = %s", res.Code, res.Body.String())
	}

	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "image manager",
		MenuPaths:      []string{"/image-manager"},
		APIPermissions: []string{service.APIPermissionKey(http.MethodDelete, "/api/images")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	// Managed user id is owner_id when present.
	updated, _ := app.auth.UpdateUser(owner.ID, service.ManagedUserUpdate{RoleID: service.StringPtr(role.ID)})
	if updated.ID == "" {
		t.Fatal("UpdateUser() returned empty user")
	}

	// Granted DELETE may remove own images only — not other owners' (no All scope for non-admin).
	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+otherRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted user delete other status = %d body = %s", res.Code, res.Body.String())
	}
	var otherPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &otherPayload); err != nil {
		t.Fatalf("delete other json: %v", err)
	}
	if deleted, _ := otherPayload["deleted"].(float64); int(deleted) != 0 {
		t.Fatalf("non-admin should not delete other-owner image, body = %#v", otherPayload)
	}
	if _, err := os.Stat(otherPath); err != nil {
		t.Fatalf("other-owner image should remain, stat error = %v", err)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+ownRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted user delete own status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("delete own json: %v", err)
	}
	if deleted, _ := payload["deleted"].(float64); int(deleted) != 1 {
		t.Fatalf("deleted own = %#v body = %#v", payload["deleted"], payload)
	}
	if _, err := os.Stat(ownPath); !os.IsNotExist(err) {
		t.Fatalf("own image should be deleted, stat error = %v", err)
	}
}

func TestLoginPageImageUploadSettings(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/app-meta", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("app meta status = %d body = %s", res.Code, res.Body.String())
	}
	var meta map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &meta); err != nil {
		t.Fatalf("app meta json: %v", err)
	}
	if meta["login_page_image_url"] != "" || meta["login_page_image_mode"] != "contain" {
		t.Fatalf("initial app meta = %#v", meta)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("login_page_image_action", "replace")
	_ = writer.WriteField("login_page_image_mode", "cover")
	_ = writer.WriteField("login_page_image_zoom", "1.25")
	_ = writer.WriteField("login_page_image_position_x", "40")
	_ = writer.WriteField("login_page_image_position_y", "60")
	part, err := writer.CreateFormFile("login_page_image_file", "panel.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if err := encodeHTTPTestPNG(part); err != nil {
		t.Fatalf("encode upload png: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/settings/login-page-image", body)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("upload json: %v", err)
	}
	config, _ := payload["config"].(map[string]any)
	imageURL, _ := config["login_page_image_url"].(string)
	if !strings.HasPrefix(imageURL, "/login-page-images/") {
		t.Fatalf("uploaded image url = %#v in %#v", imageURL, payload)
	}
	if config["login_page_image_mode"] != "cover" || config["login_page_image_zoom"] != float64(1.25) {
		t.Fatalf("login page image config = %#v", config)
	}

	req = httptest.NewRequest(http.MethodGet, imageURL, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("uploaded image static status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/app-meta", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("app meta after upload status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &meta); err != nil {
		t.Fatalf("app meta after upload json: %v", err)
	}
	if meta["login_page_image_url"] != imageURL || meta["login_page_image_mode"] != "cover" {
		t.Fatalf("app meta after upload = %#v", meta)
	}
}
