package httpapi

import (
	"bytes"
	"net/http"
	"net/url"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// handleICloudProxy reverse-proxies admin iCloud Privacy Mail APIs to the Go sidecar.
// Enabled when CHATGPT2API_FEATURE_ICLOUD=true.
// Path mapping follows gptGrok2api api/icloud_privacy_mail.py.
func (a *App) handleICloudProxy(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/icloud"), "/")
	if a.config == nil || !a.config.FeatureICloud() {
		if rest == "bridge-status" {
			identity, ok := a.requireIdentity(w, r, "")
			if !ok {
				return
			}
			if !identityIsAdmin(identity) {
				util.WriteError(w, http.StatusForbidden, "仅管理员可访问 iCloud 邮箱数据")
				return
			}
			util.WriteJSON(w, http.StatusOK, iCloudBridgeStatusResponse{
				Enabled: false, Reachable: false, Error: "iCloud 功能未启用（CHATGPT2API_FEATURE_ICLOUD）",
			})
			return
		}
		util.WriteError(w, http.StatusNotFound, "iCloud 功能未启用（CHATGPT2API_FEATURE_ICLOUD）")
		return
	}
	base := a.config.ICloudPrivacyMailBaseURL()
	if base == "" {
		util.WriteError(w, http.StatusServiceUnavailable, "ICLOUD_PRIVACY_MAIL_BASE_URL 未配置")
		return
	}

	// /api/icloud/... → sidecar
	publicMailboxCode := isICloudPublicMailboxCodePath(rest)
	if publicMailboxCode {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
	} else {
		identity, ok := a.requireIdentity(w, r, "")
		if !ok {
			return
		}
		// iCloud sidecar data is global/admin scoped. RBAC grants control API
		// visibility, but must not expand a non-admin identity to all mailboxes.
		if !identityIsAdmin(identity) {
			util.WriteError(w, http.StatusForbidden, "仅管理员可访问 iCloud 邮箱数据")
			return
		}
	}

	if rest == "bridge-status" || rest == "" {
		a.writeICloudBridgeStatus(w, r, base)
		return
	}

	upstreamPath, ok := mapICloudUpstreamPath(rest)
	if !ok {
		util.WriteError(w, http.StatusNotFound, "icloud_endpoint_not_found")
		return
	}

	target, err := url.Parse(base)
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, "invalid icloud base url")
		return
	}
	target.Path = strings.TrimRight(target.Path, "/") + upstreamPath
	target.RawQuery = r.URL.RawQuery

	body, err := readRequestBody(r, 8<<20)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "读取请求体失败或请求体过大")
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), strings.NewReader(string(body)))
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if ct := r.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	if publicMailboxCode {
		for _, header := range []string{"Authorization", "X-API-Key"} {
			if value := r.Header.Get(header); value != "" {
				req.Header.Set(header, value)
			}
		}
	} else {
		internalToken := a.config.InternalServiceToken()
		if err := validateInternalServiceToken(internalToken); err != nil {
			util.WriteError(w, http.StatusServiceUnavailable, "INTERNAL_SERVICE_TOKEN 未正确配置，拒绝访问 iCloud 内部接口")
			return
		}
		req.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
		req.Header.Set("X-Internal-Token", internalToken)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		util.WriteError(w, http.StatusServiceUnavailable, "iCloud Privacy Mail 模块不可用: "+err.Error())
		return
	}
	defer resp.Body.Close()
	for _, h := range []string{"Content-Type", "Content-Disposition", "Cache-Control", "X-Content-Type-Options"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("X-ICloud-Privacy-Mail-Proxy", "1")
	// Never forward 401/403 from the sidecar — the frontend treats those as
	// main-app session expiry and redirects to /login. Map to 502 with body.
	status := resp.StatusCode
	bodyBytes, readErr := util.ReadAllLimited(resp.Body, 32<<20)
	if readErr != nil {
		util.WriteError(w, http.StatusBadGateway, "iCloud Privacy Mail 响应读取失败: "+readErr.Error())
		return
	}
	if !publicMailboxCode && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
		status = http.StatusBadGateway
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if len(bytes.TrimSpace(bodyBytes)) == 0 {
			bodyBytes = []byte(`{"error":"icloud_upstream_auth","message":"iCloud 模块鉴权失败（非主站登录失效），请检查邮箱 API Key / sidecar 配置"}`)
		}
	}
	w.WriteHeader(status)
	_, _ = w.Write(bodyBytes)
}

func (a *App) writeICloudBridgeStatus(w http.ResponseWriter, r *http.Request, base string) {
	internalToken := a.config.InternalServiceToken()
	if err := validateInternalServiceToken(internalToken); err != nil {
		util.WriteJSON(w, http.StatusOK, iCloudBridgeStatusResponse{
			Enabled: true, Reachable: false, BaseURL: base,
			Error: "INTERNAL_SERVICE_TOKEN 未正确配置，无法验证 iCloud 内部 API",
		})
		return
	}
	target := strings.TrimRight(base, "/") + "/api/status"
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		util.WriteJSON(w, http.StatusOK, iCloudBridgeStatusResponse{
			Enabled: true, Reachable: false, BaseURL: base, Error: err.Error(),
		})
		return
	}
	request.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
	request.Header.Set("X-Internal-Token", internalToken)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(request)
	if err != nil {
		util.WriteJSON(w, http.StatusOK, iCloudBridgeStatusResponse{
			Enabled: true, Reachable: false, BaseURL: base, Error: err.Error(),
		})
		return
	}
	defer resp.Body.Close()
	reachable := resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices
	errorMessage := ""
	if !reachable {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			errorMessage = "iCloud 内部 API 鉴权失败，请检查 INTERNAL_SERVICE_TOKEN"
		} else {
			errorMessage = "iCloud 内部 API 返回异常状态: " + resp.Status
		}
	}
	statusCode := resp.StatusCode
	util.WriteJSON(w, http.StatusOK, iCloudBridgeStatusResponse{
		Enabled: true, Reachable: reachable, BaseURL: base,
		StatusCode: &statusCode, Error: errorMessage,
	})
}

func mapICloudUpstreamPath(path string) (string, bool) {
	path = strings.Trim(path, "/")
	switch {
	case isICloudPublicMailboxCodePath(path):
		return "/api/" + strings.TrimPrefix(path, "public/"), true
	case path == "status":
		return "/api/status", true
	case path == "health":
		return "/api/v1/health", true
	case path == "session":
		return "/api/icloud/session", true
	case path == "create-settings":
		return "/api/create-settings", true
	case path == "accounts" || strings.HasPrefix(path, "accounts/"):
		return "/api/" + path, true
	case path == "mailboxes/lookup":
		return "/api/v1/mailboxes/lookup", true
	case path == "mailboxes" || strings.HasPrefix(path, "mailboxes/"):
		return "/api/" + path, true
	case path == "claim-status" || strings.HasPrefix(path, "claim-status/"):
		return "/api/" + path, true
	case strings.HasPrefix(path, "icloud/") || strings.HasPrefix(path, "apple-account/") ||
		strings.HasPrefix(path, "runtime/") || strings.HasPrefix(path, "update/"):
		return "/api/" + path, true
	default:
		return "", false
	}
}

func isICloudPublicMailboxCodePath(path string) bool {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	return len(parts) == 5 && parts[0] == "public" && parts[1] == "v1" && parts[2] == "mailboxes" &&
		strings.TrimSpace(parts[3]) != "" && parts[4] == "code"
}

func isICloudPublicMailboxCodeRequest(r *http.Request) bool {
	if r == nil || r.URL == nil {
		return false
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/icloud/")
	return r.Method == http.MethodGet && isICloudPublicMailboxCodePath(path)
}
