package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/service"
)

func TestImageArchiveDownloadsEverySelectedImageInOneZip(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "user:alice", Name: "alice", Provider: service.AuthProviderLocal}
	_, key, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	paths := []string{"2026/08/27/first.png", "2026/08/27/second.png"}
	for _, rel := range paths {
		imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := writeHTTPTestPNG(imagePath); err != nil {
			t.Fatal(err)
		}
	}
	app.images.RecordGeneratedImages(paths, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	body, _ := json.Marshal(imageArchiveRequest{Paths: paths})
	req := httptest.NewRequest(http.MethodPost, "/api/images/download", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("archive status = %d body = %s", res.Code, res.Body.String())
	}
	archive, err := zip.NewReader(bytes.NewReader(res.Body.Bytes()), int64(res.Body.Len()))
	if err != nil {
		t.Fatalf("zip.NewReader() error = %v", err)
	}
	if len(archive.File) != 2 || archive.File[0].Name != "first.png" || archive.File[1].Name != "second.png" {
		t.Fatalf("archive entries = %#v", archive.File)
	}
}

func TestImageArchiveAcceptsBrowserFormSubmission(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "user:form", Name: "form", Provider: service.AuthProviderLocal}
	_, key, err := app.auth.CreateAPIKey(service.AuthRoleUser, "form", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	rel := "2026/08/27/form.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatal(err)
	}
	app.images.RecordGeneratedImages([]string{rel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	form := url.Values{"paths": {rel}}
	req := httptest.NewRequest(http.MethodPost, "/api/images/download", bytes.NewBufferString(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: key})
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("archive form status = %d body = %s", res.Code, res.Body.String())
	}
	archive, err := zip.NewReader(bytes.NewReader(res.Body.Bytes()), int64(res.Body.Len()))
	if err != nil {
		t.Fatalf("zip.NewReader() error = %v", err)
	}
	if len(archive.File) != 1 || archive.File[0].Name != "form.png" {
		t.Fatalf("archive entries = %#v", archive.File)
	}
}
