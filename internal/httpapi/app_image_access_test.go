package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestStreamImageDownloadReturnsSameOriginAttachment(t *testing.T) {
	payload := []byte("original-image-bytes")
	res := httptest.NewRecorder()
	if err := streamImageDownload(res, "2026/08/original.png", "image/png", int64(len(payload)), bytes.NewReader(payload)); err != nil {
		t.Fatalf("streamImageDownload() error = %v", err)
	}
	if res.Code != http.StatusOK || !bytes.Equal(res.Body.Bytes(), payload) {
		t.Fatalf("stream response status=%d body=%q", res.Code, res.Body.Bytes())
	}
	if got := res.Header().Get("Location"); got != "" {
		t.Fatalf("stream download redirected to %q", got)
	}
	if got := res.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") || !strings.Contains(got, "original.png") {
		t.Fatalf("Content-Disposition = %q", got)
	}
	if got := res.Header().Get("Content-Length"); got != "20" {
		t.Fatalf("Content-Length = %q", got)
	}
	if got := res.Header().Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("X-Accel-Buffering = %q", got)
	}
}

func TestImageManagementIsScopedByOwner(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "user:alice", Name: "alice", Provider: service.AuthProviderLocal}
	_, sessionKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	aliceRel := "2026/04/29/alice.png"
	bobRel := "2026/04/29/bob.png"
	legacyRel := "2026/04/29/legacy.png"
	for _, rel := range []string{aliceRel, bobRel, legacyRel} {
		path := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir image dir: %v", err)
		}
		if err := writeHTTPTestPNG(path); err != nil {
			t.Fatalf("write image %s: %v", rel, err)
		}
	}
	app.images.RecordImageOwners([]string{aliceRel}, owner.ID)
	app.images.RecordImageOwners([]string{bobRel}, "user:bob")

	req := httptest.NewRequest(http.MethodGet, "/api/images", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner images status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("owner images json: %v", err)
	}
	items := logItems(list)
	if len(items) != 1 || items[0]["path"] != aliceRel {
		t.Fatalf("owner scoped images = %#v", list)
	}
	if items[0]["owner_name"] != owner.Name || items[0]["visibility"] != service.ImageVisibilityPrivate {
		t.Fatalf("owner image metadata = %#v", items[0])
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+aliceRel+`","visibility":"public"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner publish image status = %d body = %s", res.Code, res.Body.String())
	}
	var visibilityBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &visibilityBody); err != nil {
		t.Fatalf("visibility json: %v", err)
	}
	updatedItem, _ := visibilityBody["item"].(map[string]any)
	if updatedItem["visibility"] != service.ImageVisibilityPublic || updatedItem["owner_name"] != owner.Name {
		t.Fatalf("publish image response = %#v", visibilityBody)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+bobRel+`","visibility":"public"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("owner publish other image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=public", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("public images status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("public images json: %v", err)
	}
	if items := logItems(list); len(items) != 1 || items[0]["path"] != aliceRel || items[0]["owner_name"] != owner.Name {
		t.Fatalf("public scoped images = %#v", list)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+aliceRel+`","visibility":"private"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner unpublish image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=public", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("public images after unpublish status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("public images after unpublish json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("unpublished image should leave public gallery: %#v", list)
	}

	// Admin "public" is visibility-filtered (same as users); "all" sees every image.
	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=public", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin public gallery status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin public gallery json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("admin public gallery should only list public images, got %#v", list)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=all", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin all gallery status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin all gallery json: %v", err)
	}
	items = logItems(list)
	if len(items) != 3 {
		t.Fatalf("admin all gallery should see all images, got %#v", list)
	}
	seenPaths := make(map[string]bool, len(items))
	for _, item := range items {
		path, _ := item["path"].(string)
		seenPaths[path] = true
	}
	if !seenPaths[aliceRel] || !seenPaths[bobRel] || !seenPaths[legacyRel] {
		t.Fatalf("admin all gallery paths = %#v", items)
	}

	// Non-admin must not use scope=all.
	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=all", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("user scope=all status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+bobRel+`","`+aliceRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("owner delete images status = %d body = %s", res.Code, res.Body.String())
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(aliceRel))); err != nil {
		t.Fatalf("alice image should not be deleted by ordinary user, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(bobRel))); err != nil {
		t.Fatalf("bob image should not be deleted, stat error = %v", err)
	}

	_, localKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "local user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(local) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+aliceRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+localKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("local user delete images status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin images status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin images json: %v", err)
	}
	if items := logItems(list); len(items) != 3 {
		t.Fatalf("admin should see owned and legacy images, got %#v", list)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+aliceRel+`"]}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin delete images status = %d body = %s", res.Code, res.Body.String())
	}
	var deleteBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &deleteBody); err != nil {
		t.Fatalf("admin delete images json: %v", err)
	}
	if deleteBody["deleted"] != float64(1) || deleteBody["missing"] != float64(0) {
		t.Fatalf("admin delete images body = %#v", deleteBody)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(aliceRel))); !os.IsNotExist(err) {
		t.Fatalf("alice image should be deleted by admin, stat error = %v", err)
	}
}

func TestManagedImageFilesRequireOwnerOrPublicAccess(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "user:alice", Name: "alice", Provider: service.AuthProviderLocal}
	_, aliceKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey(alice) error = %v", err)
	}
	_, bobKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob", service.AuthOwner{ID: "user:bob", Name: "bob", Provider: service.AuthProviderLocal})
	if err != nil {
		t.Fatalf("CreateAPIKey(bob) error = %v", err)
	}

	rel := "2026/05/01/1777664437_f5b9d1d2cd2a380307ca9fb32c1a84d1.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodGet, "/images/2026/05/01", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("image directory listing status = %d body = %q, want 404", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous private image status = %d body = %q, want 401", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("other user private image status = %d body = %q, want 404", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image status = %d body = %q", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/png") {
		t.Fatalf("owner private image Content-Type = %q, want image/png", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: aliceKey})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image cookie status = %d body = %q", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel+"?download=1", nil)
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: aliceKey})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image download status = %d body = %q", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") || !strings.Contains(got, filepath.Base(rel)) {
		t.Fatalf("owner private image Content-Disposition = %q", got)
	}

	req = httptest.NewRequest(http.MethodHead, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image HEAD status = %d body = %q", res.Code, res.Body.String())
	}
	if res.Body.Len() != 0 {
		t.Fatalf("owner private image HEAD body length = %d, want 0", res.Body.Len())
	}

	if _, err := app.images.UpdateImageVisibility(rel, service.ImageVisibilityPublic, service.ImageAccessScope{OwnerID: owner.ID}); err != nil {
		t.Fatalf("publish image: %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("anonymous public image status = %d body = %q", res.Code, res.Body.String())
	}
}
