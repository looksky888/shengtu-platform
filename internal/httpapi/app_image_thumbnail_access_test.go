package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestImageThumbnailsAreGeneratedOnDemand(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rel := "2026/04/29/sample.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/images", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/images status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("/api/images json: %v", err)
	}
	items := logItems(list)
	if len(items) != 1 {
		t.Fatalf("/api/images items = %#v", list)
	}
	thumbnailURL, _ := items[0]["thumbnail_url"].(string)
	if !strings.Contains(thumbnailURL, "/image-thumbnails/") {
		t.Fatalf("thumbnail_url = %q, want lazy thumbnail route", thumbnailURL)
	}
	parsedThumbnailURL, err := url.Parse(thumbnailURL)
	if err != nil {
		t.Fatalf("parse thumbnail URL: %v", err)
	}
	if !strings.HasSuffix(parsedThumbnailURL.Path, ".jpg") {
		t.Fatalf("thumbnail path = %q, want .jpg suffix", parsedThumbnailURL.Path)
	}
	if parsedThumbnailURL.Query().Get("v") == "" {
		t.Fatalf("thumbnail URL = %q, want cache-busting query", thumbnailURL)
	}
	thumbPath := filepath.Join(app.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+".jpg")
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("/api/images should not create thumbnail synchronously, stat error = %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, parsedThumbnailURL.Path, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("thumbnail status = %d body = %s", res.Code, res.Body.String())
	}
	if res.Body.Len() == 0 {
		t.Fatal("thumbnail body is empty")
	}
	if got := res.Header().Get("Cache-Control"); got != imageThumbnailCacheControl {
		t.Fatalf("thumbnail Cache-Control = %q, want %q", got, imageThumbnailCacheControl)
	}
	if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/jpeg") {
		t.Fatalf("thumbnail Content-Type = %q, want image/jpeg", got)
	}
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created on demand: %v", err)
	}
}

func TestManagedImageThumbnailsRequireOwnerOrPublicAccess(t *testing.T) {
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

	rel := "2026/05/01/private.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	thumbnailPath := "/image-thumbnails/" + rel + ".jpg"

	req := httptest.NewRequest(http.MethodGet, thumbnailPath, nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous private thumbnail status = %d body = %q, want 401", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, thumbnailPath, nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("other user private thumbnail status = %d body = %q, want 404", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, thumbnailPath, nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private thumbnail status = %d body = %q", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/jpeg") {
		t.Fatalf("owner private thumbnail Content-Type = %q, want image/jpeg", got)
	}

	req = httptest.NewRequest(http.MethodGet, thumbnailPath, nil)
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: aliceKey})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private thumbnail cookie status = %d body = %q", res.Code, res.Body.String())
	}

	if _, err := app.images.UpdateImageVisibility(rel, service.ImageVisibilityPublic, service.ImageAccessScope{OwnerID: owner.ID}); err != nil {
		t.Fatalf("publish image: %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, thumbnailPath, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("anonymous public thumbnail status = %d body = %q", res.Code, res.Body.String())
	}
}

func TestRemoteMediaRedirectIsNotCached(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/image-thumbnails/example.jpg", nil)
	res := httptest.NewRecorder()

	redirectRemoteMedia(res, req, "https://r2.example.test/signed-thumbnail")

	if res.Code != http.StatusFound {
		t.Fatalf("redirect status = %d, want %d", res.Code, http.StatusFound)
	}
	if got := res.Header().Get("Location"); got != "https://r2.example.test/signed-thumbnail" {
		t.Fatalf("Location = %q", got)
	}
	if got := res.Header().Get("Cache-Control"); got != remoteMediaCacheControl {
		t.Fatalf("Cache-Control = %q, want %q", got, remoteMediaCacheControl)
	}
}
