package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestImageListPaginationContract(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	for index := 0; index < 3; index++ {
		relativePath := fmt.Sprintf("2026/07/22/image-%d.png", index)
		path := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(relativePath))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("create image directory: %v", err)
		}
		if err := writeHTTPTestPNG(path); err != nil {
			t.Fatalf("write image: %v", err)
		}
	}

	defaultPage := requestImageList(t, app, "/api/images?scope=all")
	assertImageListNumber(t, defaultPage, "limit", 100)
	assertImageListNumber(t, defaultPage, "total", 3)
	if _, ok := defaultPage["has_more"]; !ok {
		t.Fatal("default response missing has_more")
	}
	if cursor, ok := defaultPage["next_cursor"]; !ok || cursor != "" {
		t.Fatalf("default next_cursor = %#v", cursor)
	}

	firstPage := requestImageList(t, app, "/api/images?scope=all&limit=1")
	assertImageListNumber(t, firstPage, "limit", 1)
	assertImageListNumber(t, firstPage, "total", 3)
	if firstPage["has_more"] != true {
		t.Fatalf("first page has_more = %#v", firstPage["has_more"])
	}
	if cursor, _ := firstPage["next_cursor"].(string); cursor == "" {
		t.Fatal("first page next_cursor is empty")
	}
}

func TestImageListRejectsInvalidLimit(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	for _, value := range []string{"", "0", "-1", "201", "invalid"} {
		t.Run(fmt.Sprintf("limit_%s", value), func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/images?scope=all&limit="+value, nil)
			req.Header.Set("Authorization", adminAuthHeader(t, app))
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusBadRequest {
				t.Fatalf("limit %q status = %d body = %s", value, res.Code, res.Body.String())
			}
		})
	}
}

func requestImageList(t *testing.T, app *App, target string) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("GET %s status = %d body = %s", target, res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode GET %s: %v", target, err)
	}
	return payload
}

func assertImageListNumber(t *testing.T, payload map[string]any, key string, want float64) {
	t.Helper()
	if got := payload[key]; got != want {
		t.Fatalf("%s = %#v, want %v", key, got, want)
	}
}
