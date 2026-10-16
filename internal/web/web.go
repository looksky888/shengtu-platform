package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var dist embed.FS

var staticFS = mustSubFS(dist, "dist")

const (
	cacheControlHTML   = "no-cache, must-revalidate"
	cacheControlAssets = "public, max-age=31536000, immutable"
)

func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.Trim(strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/"), "/")
		if serveAsset(w, r, clean) {
			return
		}
		last := path.Base(clean)
		// Missing hashed assets must 404 (not SPA fallback), so old tabs can detect deploy.
		if strings.HasPrefix(clean, "assets/") || strings.Contains(last, ".") {
			http.NotFound(w, r)
			return
		}
		if serveAsset(w, r, "index.html") {
			return
		}
		http.NotFound(w, r)
	})
}

func serveAsset(w http.ResponseWriter, r *http.Request, name string) bool {
	if name == "" {
		name = "index.html"
	}
	for _, candidate := range assetCandidates(name) {
		info, err := fs.Stat(staticFS, candidate)
		if err == nil && !info.IsDir() {
			setStaticCacheHeaders(w, candidate)
			http.ServeFileFS(w, r, staticFS, candidate)
			return true
		}
	}
	return false
}

func setStaticCacheHeaders(w http.ResponseWriter, name string) {
	if name == "index.html" || strings.HasSuffix(name, "/index.html") {
		w.Header().Set("Cache-Control", cacheControlHTML)
		return
	}
	if strings.HasPrefix(name, "assets/") {
		w.Header().Set("Cache-Control", cacheControlAssets)
	}
}

func assetCandidates(name string) []string {
	if name == "index.html" {
		return []string{name}
	}
	return []string{name, path.Join(name, "index.html"), name + ".html"}
}

func mustSubFS(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return sub
}
