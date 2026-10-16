package web

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlerServesEmbeddedSPA(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	res := httptest.NewRecorder()
	Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("SPA route status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `<div id="root"></div>`) {
		t.Fatalf("SPA route body missing root element: %q", res.Body.String())
	}
}

func TestHandlerKeepsMissingAssetsOutOfSPA(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
	res := httptest.NewRecorder()
	Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("missing asset status = %d body = %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), `<div id="root"></div>`) {
		t.Fatalf("missing asset must not fall back to SPA HTML")
	}
}

func TestHandlerSPAHTMLUsesNoCache(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/image-manager", nil)
	res := httptest.NewRecorder()
	Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	cc := res.Header().Get("Cache-Control")
	if cc != cacheControlHTML {
		t.Fatalf("SPA Cache-Control = %q want %q", cc, cacheControlHTML)
	}
}

func TestHandlerHashedAssetsUseImmutableCache(t *testing.T) {
	// Pick any existing hashed asset from the embedded dist.
	entries, err := fs.ReadDir(staticFS, "assets")
	if err != nil {
		t.Fatalf("readdir assets: %v", err)
	}
	var asset string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".js") {
			asset = "assets/" + e.Name()
			break
		}
	}
	if asset == "" {
		t.Skip("no embedded js assets")
	}
	req := httptest.NewRequest(http.MethodGet, "/"+asset, nil)
	res := httptest.NewRecorder()
	Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
	}
	cc := res.Header().Get("Cache-Control")
	if cc != cacheControlAssets {
		t.Fatalf("asset Cache-Control = %q want %q", cc, cacheControlAssets)
	}
}
