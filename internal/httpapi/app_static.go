package httpapi

import (
	frontend "chatgpt2api/internal/web"
	"net/http"
)

func (a *App) serveWeb(w http.ResponseWriter, r *http.Request) {
	frontend.Handler().ServeHTTP(w, r)
}
