package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/sidecar"
	"chatgpt2api/internal/util"
)

func (a *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/register/events" {
		// Auth via Authorization header or session cookie only — never put tokens in query strings.
		if _, ok := a.requireIdentity(w, r, ""); !ok {
			return
		}
		// SSE: poll python snapshot when register backend is python (or Grok target forces python).
		a.streamRegisterEvents(w, r)
		return
	}
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	// 3.5: Grok registration is Python-only (independent of OpenAI Go worker).
	// OpenAI may use go (legacy) or python (target 3.5 dual backend).
	if a.shouldProxyRegisterToPython(r) {
		if a.proxyRegisterToPython(w, r) {
			return
		}
	}
	// Typed pilot: RegisterConfigPublic for all register snapshot responses.
	switch {
	case r.URL.Path == "/api/register" && r.Method == http.MethodGet:
		util.WriteJSON(w, http.StatusOK, registerResponse[service.RegisterConfigPublic]{Register: a.register.GetTyped()})
	case r.URL.Path == "/api/register" && r.Method == http.MethodPost:
		raw, body, ok := readJSONMapRawOr400(w, r)
		if !ok {
			return
		}
		// Switching to Grok always goes to python (independent protocol stack).
		if strings.EqualFold(util.Clean(body["target"]), "grok") {
			if a.proxyRegisterToPythonWithBody(w, r, raw) {
				return
			}
			util.WriteError(w, http.StatusBadRequest, "Grok 注册需要 python 注册后端（CHATGPT2API_FEATURE_REGISTER_BACKEND=python + grok-runtime）")
			return
		}
		value, err := a.register.UpdateTyped(body)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, registerResponse[service.RegisterConfigPublic]{Register: value})
	case r.URL.Path == "/api/register/start" && r.Method == http.MethodPost:
		// Never start OpenAI Go worker when saved target is grok.
		if strings.EqualFold(util.Clean(a.register.GetTyped().Target), "grok") {
			if a.proxyRegisterToPythonWithBody(w, r, nil) {
				return
			}
			util.WriteError(w, http.StatusBadRequest, "Grok 注册必须走 python 侧车独立流程，请设置 REGISTER_BACKEND=python 并确保 grok-runtime 已加载 register")
			return
		}
		value, err := a.register.StartTyped()
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, registerResponse[service.RegisterConfigPublic]{Register: value})
	case r.URL.Path == "/api/register/stop" && r.Method == http.MethodPost:
		value, err := a.register.StopTyped()
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, registerResponse[service.RegisterConfigPublic]{Register: value})
	case r.URL.Path == "/api/register/reset" && r.Method == http.MethodPost:
		value, err := a.register.ResetTyped()
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, registerResponse[service.RegisterConfigPublic]{Register: value})
	case r.URL.Path == "/api/register/outlook-pool/reset" && r.Method == http.MethodPost:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		scope := util.Clean(body["scope"])
		if scope == "" {
			util.WriteError(w, http.StatusBadRequest, "请显式指定 scope：all 或其它合法取值")
			return
		}
		value, err := a.register.ResetOutlookPoolTyped(scope)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, registerResponse[service.RegisterConfigPublic]{Register: value})
	default:
		http.NotFound(w, r)
	}
}

// shouldProxyRegisterToPython decides whether /api/register* is handled by
// grok-runtime's register_service (openai_register | grok_register by target).
func (a *App) shouldProxyRegisterToPython(r *http.Request) bool {
	if a.config == nil {
		return false
	}
	if a.config.FeatureRegisterBackend() == "python" {
		return true
	}
	// Even with go backend, Grok must never use the OpenAI Go worker.
	// Prefer python whenever current (or requested) target is grok.
	if a.register != nil && strings.EqualFold(util.Clean(a.register.GetTyped().Target), "grok") {
		return true
	}
	if r != nil && r.Method == http.MethodPost && r.URL.Path == "/api/register" {
		// Peek is handled after body read in caller for update; leave false here.
		return false
	}
	return false
}

// proxyRegisterToPython forwards /api/register* to GROK_RUNTIME_BASE_URL.
// Returns true if the request was handled (including error responses).
func (a *App) proxyRegisterToPython(w http.ResponseWriter, r *http.Request) bool {
	var body []byte
	if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
		var err error
		body, err = readRequestBody(r, 4<<20)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "读取请求体失败或请求体过大")
			return true
		}
	}
	return a.proxyRegisterToPythonWithBody(w, r, body)
}

// proxyRegisterToPythonWithBody is like proxyRegisterToPython but uses a pre-read body
// (needed after JSON decode already consumed r.Body).
func (a *App) proxyRegisterToPythonWithBody(w http.ResponseWriter, r *http.Request, body []byte) bool {
	if a.config == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "配置不可用")
		return true
	}
	base := a.config.GrokRuntimeBaseURL()
	token := a.config.InternalServiceToken()
	if base == "" {
		util.WriteError(w, http.StatusServiceUnavailable, "GROK_RUNTIME_BASE_URL 未配置")
		return true
	}
	path := r.URL.Path
	if r.URL.RawQuery != "" {
		path = path + "?" + r.URL.RawQuery
	}
	client := sidecar.New(base, token)
	status, data, err := client.DoJSON(r.Context(), r.Method, path, body)
	if err != nil {
		util.WriteError(w, http.StatusServiceUnavailable, "注册侧车不可用: "+err.Error())
		return true
	}
	if ct := http.DetectContentType(data); strings.Contains(ct, "json") || len(data) > 0 && data[0] == '{' {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	}
	w.WriteHeader(status)
	_, _ = w.Write(data)
	return true
}

func (a *App) streamRegisterEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	flusher, _ := w.(http.Flusher)
	last := ""
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	usePython := a.shouldProxyRegisterToPython(r)
	client := (*sidecar.Client)(nil)
	if usePython && a.config != nil {
		client = sidecar.New(a.config.GrokRuntimeBaseURL(), a.config.InternalServiceToken())
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			var payload string
			if usePython && client != nil {
				status, data, err := client.DoJSON(r.Context(), http.MethodGet, "/api/register", nil)
				if err != nil || status < 200 || status >= 300 {
					// Emit named event instead of a partial {"register":...} data frame
					// so transient sidecar hiccups never wipe client-side form state.
					if last == "" {
						last = "__sidecar_unavailable__"
						fmt.Fprintf(w, "event: sidecar_error\ndata: {\"error\":\"register sidecar unavailable\"}\n\n")
						if flusher != nil {
							flusher.Flush()
						}
					}
					continue
				} else {
					// Forward full body as SSE data (already {"register":...}).
					payload = strings.TrimSpace(string(data))
				}
			} else {
				// Always wrap as {"register": ...} so frontend SSE parser is consistent
				// with python proxy responses (avoids treating envelope as config).
				payload = jsonString(registerResponse[service.RegisterConfigPublic]{Register: a.register.GetTyped()})
			}
			if payload != last {
				last = payload
				fmt.Fprintf(w, "data: %s\n\n", payload)
				if flusher != nil {
					flusher.Flush()
				}
			}
		}
	}
}

func splitPath(path string) []string {
	trimmed := strings.Trim(path, "/")
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "/")
}
