package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"chatgpt2api/internal/sidecar"
	"chatgpt2api/internal/util"
)

// handleGrokAccounts proxies admin Grok 号池 APIs to grok-runtime.
// Frontend: /api/grok/accounts*  →  runtime /api/grok/accounts* (X-Internal-Token).
func (a *App) handleGrokAccounts(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	var body []byte
	if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
		var err error
		body, err = readRequestBody(r, 8<<20)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "读取请求体失败或请求体过大")
			return
		}
	}
	if requestsFullGrokCredentialExport(r, body) && !identityIsAdmin(identity) {
		util.WriteError(w, http.StatusForbidden, "仅管理员可导出完整 Grok 凭据")
		return
	}
	if a.config == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "config unavailable")
		return
	}
	base := strings.TrimSpace(a.config.GrokRuntimeBaseURL())
	token := a.config.InternalServiceToken()
	if base == "" {
		util.WriteError(w, http.StatusServiceUnavailable, "GROK_RUNTIME_BASE_URL 未配置，无法管理 Grok 号池")
		return
	}

	// Map admin path to runtime path (same suffix after /api/grok).
	path := r.URL.Path
	if r.URL.RawQuery != "" {
		path = path + "?" + r.URL.RawQuery
	}
	client := sidecar.New(base, token)
	status, data, err := client.DoJSON(r.Context(), r.Method, path, body)
	if err != nil {
		util.WriteError(w, http.StatusServiceUnavailable, "Grok 运行时不可用: "+err.Error())
		return
	}
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	}
	if isGrokExportRequest(r) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")
	}
	w.WriteHeader(status)
	_, _ = w.Write(data)
}

func requestsFullGrokCredentialExport(r *http.Request, body []byte) bool {
	if requestsFullGrokSSOExport(r) {
		return true
	}
	if r == nil || r.Method != http.MethodPost || strings.TrimSuffix(r.URL.Path, "/") != "/api/grok/provider-account-exports" {
		return false
	}
	var request struct {
		Mode string `json:"mode"`
	}
	if err := json.Unmarshal(body, &request); err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(request.Mode), "credentials")
}

func isGrokExportRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	path := strings.TrimSuffix(r.URL.Path, "/")
	return (r.Method == http.MethodGet && path == "/api/grok/accounts/export") ||
		(r.Method == http.MethodPost && path == "/api/grok/provider-account-exports")
}

func requestsFullGrokSSOExport(r *http.Request) bool {
	if r == nil || r.Method != http.MethodGet || strings.TrimSuffix(r.URL.Path, "/") != "/api/grok/accounts/export" {
		return false
	}
	for _, value := range r.URL.Query()["include_sso"] {
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "1", "t", "true", "y", "yes", "on":
			return true
		}
	}
	return false
}
