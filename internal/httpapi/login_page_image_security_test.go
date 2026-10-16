package httpapi

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

const testScriptSVG = `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('/api/admin/users')</script></svg>`

func TestSettingsImageUploadsRejectSVG(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	tests := []struct {
		name      string
		path      string
		fileField string
		fields    map[string]string
	}{
		{
			name:      "login page",
			path:      "/api/settings/login-page-image",
			fileField: "login_page_image_file",
			fields:    map[string]string{"login_page_image_action": "replace"},
		},
		{
			name:      "announcement",
			path:      "/api/admin/announcements/upload-image",
			fileField: "image",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body, contentType := multipartImageRequest(t, test.fileField, "script.svg", []byte(testScriptSVG), test.fields)
			req := httptest.NewRequest(http.MethodPost, test.path, body)
			req.Header.Set("Authorization", adminAuthHeader(t, app))
			req.Header.Set("Content-Type", contentType)
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusBadRequest {
				t.Fatalf("SVG upload status = %d body = %s", res.Code, res.Body.String())
			}
		})
	}
}

func TestRasterStaticDirectoriesBlockLegacySVG(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	tests := []struct {
		url string
		dir string
	}{
		{url: "/login-page-images/legacy.svg", dir: app.config.LoginPageImagesDir()},
		{url: "/announcement-images/legacy.svg", dir: app.config.AnnouncementImagesDir()},
	}
	for _, test := range tests {
		if err := os.WriteFile(filepath.Join(test.dir, "legacy.svg"), []byte(testScriptSVG), 0o600); err != nil {
			t.Fatalf("write legacy SVG: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, test.url, nil)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusNotFound {
			t.Fatalf("legacy SVG status = %d body = %s", res.Code, res.Body.String())
		}
	}
}

func multipartImageRequest(t *testing.T, fileField, filename string, data []byte, fields map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("write multipart field: %v", err)
		}
	}
	part, err := writer.CreateFormFile(fileField, filename)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write multipart file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	return body, writer.FormDataContentType()
}
