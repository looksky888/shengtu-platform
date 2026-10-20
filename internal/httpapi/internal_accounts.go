package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"

	"chatgpt2api/internal/util"
)

const internalAccountsImportPath = "/internal/v1/accounts/import"

func (a *App) InternalHandler() (http.Handler, error) {
	if a == nil || a.config == nil {
		return nil, fmt.Errorf("internal service config unavailable")
	}
	if err := validateInternalServiceToken(a.config.InternalServiceToken()); err != nil {
		return nil, err
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != internalAccountsImportPath {
			http.NotFound(w, r)
			return
		}
		a.handleInternalAccountsImport(w, r)
	}), nil
}

func validateInternalServiceToken(token string) error {
	token = strings.TrimSpace(token)
	if len(token) < 32 {
		return fmt.Errorf("INTERNAL_SERVICE_TOKEN must contain at least 32 characters")
	}
	switch strings.ToLower(token) {
	case "dev-internal-token", "change-me-internal", "change_me_internal":
		return fmt.Errorf("INTERNAL_SERVICE_TOKEN uses a known insecure value")
	default:
		return nil
	}
}

func internalServiceTokenMatches(expected, provided string) bool {
	expectedHash := sha256.Sum256([]byte(strings.TrimSpace(expected)))
	providedHash := sha256.Sum256([]byte(strings.TrimSpace(provided)))
	return subtle.ConstantTimeCompare(expectedHash[:], providedHash[:]) == 1
}

// handleInternalAccountsImport accepts tokens from grok-runtime after Python registration.
// Auth: X-Internal-Token only (no user session). Network isolation assumed via Docker network.
//
// POST /internal/v1/accounts/import
// {"tokens":["..."], "source":"register-openai", "refresh":true}
func (a *App) handleInternalAccountsImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	expected := ""
	if a.config != nil {
		expected = a.config.InternalServiceToken()
	}
	got := strings.TrimSpace(r.Header.Get("X-Internal-Token"))
	if expected == "" {
		util.WriteError(w, http.StatusServiceUnavailable, "INTERNAL_SERVICE_TOKEN 未配置，拒绝内部导入")
		return
	}
	if got == "" || !internalServiceTokenMatches(expected, got) {
		util.WriteError(w, http.StatusUnauthorized, "invalid internal token")
		return
	}
	body, ok := readJSONMapOr400(w, r)
	if !ok {
		return
	}
	tokens := util.AsStringSlice(body["tokens"])
	if len(tokens) == 0 {
		// also accept single access_token
		if t := util.Clean(body["access_token"]); t != "" {
			tokens = []string{t}
		}
	}
	if len(tokens) == 0 {
		util.WriteError(w, http.StatusBadRequest, "请提供 tokens 或 access_token")
		return
	}
	result := a.accounts.AddAccounts(tokens)
	if errText, _ := result["error"].(string); errText != "" {
		util.WriteError(w, http.StatusInternalServerError, errText)
		return
	}
	doRefresh := true
	if v, ok := body["refresh"]; ok {
		doRefresh = util.ToBool(v)
	}
	if doRefresh {
		refresh := a.accounts.RefreshAccounts(r.Context(), tokens)
		for key, value := range refresh {
			if key == "refreshed" || key == "errors" {
				result[key] = value
			}
		}
	}
	result["source"] = util.Clean(body["source"])
	normalizeAccountPayload(result)
	util.WriteJSON(w, http.StatusOK, accountPayloadResponseFromMap(result))
}
