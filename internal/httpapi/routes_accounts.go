package httpapi

import (
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleAccounts(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	switch {
	case r.URL.Path == "/api/accounts" && r.Method == http.MethodGet:
		q := r.URL.Query()
		canViewTokens := a.identityCanAccessAPI(identity, http.MethodGet, "/api/accounts/tokens")
		page := util.ToInt(q.Get("page"), 0)
		pageSize := util.ToInt(q.Get("page_size"), 0)
		if q.Get("page") == "" && q.Get("page_size") == "" {
			page, pageSize = 0, 0
		}
		result, err := a.accounts.QueryAccounts(service.AdminListQuery{
			Page:                        page,
			PageSize:                    pageSize,
			Keyword:                     strings.TrimSpace(q.Get("keyword")),
			IncludeAccessTokenInKeyword: canViewTokens,
			Type:                        strings.TrimSpace(q.Get("type")),
			Status:                      strings.TrimSpace(q.Get("status")),
		})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		// Redact tokens when caller lacks token export permission.
		if !canViewTokens {
			for i := range result.Items {
				result.Items[i].AccessToken = ""
			}
		}
		util.WriteJSON(w, http.StatusOK, result)
	case r.URL.Path == "/api/accounts/tokens" && r.Method == http.MethodGet:
		util.WriteJSON(w, http.StatusOK, tokensResponse{Tokens: a.accounts.ListTokens()})
	case r.URL.Path == "/api/accounts" && r.Method == http.MethodPost:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		tokens := util.AsStringSlice(body["tokens"])
		if len(tokens) == 0 {
			util.WriteError(w, http.StatusBadRequest, "请提供 tokens")
			return
		}
		result := a.accounts.AddAccounts(tokens)
		if errText, _ := result["error"].(string); errText != "" {
			util.WriteError(w, http.StatusInternalServerError, errText)
			return
		}
		refresh := a.accounts.RefreshAccounts(r.Context(), tokens)
		for key, value := range refresh {
			if key == "refreshed" || key == "errors" || key == "items" {
				result[key] = value
			}
		}
		a.writeAccountPayload(w, identity, result)
	case r.URL.Path == "/api/accounts" && r.Method == http.MethodDelete:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		tokens := util.AsStringSlice(body["tokens"])
		accountIDs := util.AsStringSlice(body["account_ids"])
		if len(tokens) == 0 {
			tokens = a.accounts.ListTokensByIDs(accountIDs)
		}
		if len(tokens) == 0 {
			if len(accountIDs) > 0 {
				util.WriteError(w, http.StatusNotFound, "账号不存在")
				return
			}
			util.WriteError(w, http.StatusBadRequest, "请提供 tokens 或 account_ids")
			return
		}
		result := a.accounts.DeleteAccounts(tokens)
		if errText, _ := result["error"].(string); errText != "" {
			util.WriteError(w, http.StatusInternalServerError, errText)
			return
		}
		a.writeAccountPayload(w, identity, result)
	case r.URL.Path == "/api/accounts/refresh" && r.Method == http.MethodPost:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		tokens := util.AsStringSlice(body["access_tokens"])
		accountIDs := util.AsStringSlice(body["account_ids"])
		if len(tokens) == 0 && len(accountIDs) > 0 {
			tokens = a.accounts.ListTokensByIDs(accountIDs)
		}
		if len(tokens) == 0 && len(accountIDs) == 0 {
			tokens = a.accounts.ListTokens()
		}
		if len(tokens) == 0 {
			if len(accountIDs) > 0 {
				util.WriteError(w, http.StatusNotFound, "账号不存在")
				return
			}
			util.WriteError(w, http.StatusBadRequest, "请提供 access_tokens 或 account_ids")
			return
		}
		a.writeAccountPayload(w, identity, a.accounts.RefreshAccounts(r.Context(), tokens))
	case r.URL.Path == "/api/accounts/update" && r.Method == http.MethodPost:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		token := util.Clean(body["access_token"])
		accountID := util.Clean(body["account_id"])
		if token == "" && accountID != "" {
			token = a.accounts.GetTokenByID(accountID)
			if token == "" {
				util.WriteError(w, http.StatusNotFound, "账号不存在")
				return
			}
		}
		if token == "" {
			util.WriteError(w, http.StatusBadRequest, "请提供 access_token 或 account_id")
			return
		}
		updates := map[string]any{}
		for _, key := range []string{"type", "status", "quota"} {
			if value, ok := body[key]; ok && value != nil {
				updates[key] = value
			}
		}
		if len(updates) == 0 {
			util.WriteError(w, http.StatusBadRequest, "未提供可更新字段")
			return
		}
		item, err := a.accounts.UpdateAccount(token, updates)
		if err != nil {
			util.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if item == nil {
			util.WriteError(w, http.StatusNotFound, "账号不存在")
			return
		}
		// Prefer typed public records on the wire (no raw storage map leakage).
		a.writeAccountPayload(w, identity, map[string]any{
			"item":  service.AccountPublicFromMap(item),
			"items": a.accountItemsForIdentity(identity),
		})
	default:
		http.NotFound(w, r)
	}
}

func (a *App) accountItemsForIdentity(identity service.Identity) []service.AccountPublic {
	items := a.accounts.ListAccountsTyped()
	if !a.identityCanAccessAPI(identity, http.MethodGet, "/api/accounts/tokens") {
		for i := range items {
			items[i].AccessToken = ""
		}
	}
	return items
}

// writeAccountPayload normalizes map-based account payloads to AccountPublic then redacts tokens.
func (a *App) writeAccountPayload(w http.ResponseWriter, identity service.Identity, payload map[string]any) {
	normalizeAccountPayload(payload)
	a.redactAccountPayloadForIdentity(identity, payload)
	util.WriteJSON(w, http.StatusOK, accountPayloadResponseFromMap(payload))
}

func normalizeAccountPayload(payload map[string]any) {
	if items, ok := payload["items"].([]map[string]any); ok {
		payload["items"] = service.AccountPublicListFromMaps(items)
	}
	if item, ok := payload["item"].(map[string]any); ok {
		payload["item"] = service.AccountPublicFromMap(item)
	}
}

func (a *App) redactAccountPayloadForIdentity(identity service.Identity, payload map[string]any) {
	if a.identityCanAccessAPI(identity, http.MethodGet, "/api/accounts/tokens") {
		return
	}
	switch item := payload["item"].(type) {
	case map[string]any:
		redactAccountToken(item)
	case service.AccountPublic:
		item.AccessToken = ""
		payload["item"] = item
	}
	switch items := payload["items"].(type) {
	case []map[string]any:
		redactAccountTokens(items)
	case []service.AccountPublic:
		for i := range items {
			items[i].AccessToken = ""
		}
		payload["items"] = items
	}
	if errors, ok := payload["errors"].([]map[string]string); ok {
		for _, item := range errors {
			token := item["access_token"]
			delete(item, "access_token")
			if token != "" {
				item["account_id"] = util.SHA1Short(token, 16)
			}
		}
	}
}

func redactAccountTokens(items []map[string]any) {
	for _, item := range items {
		redactAccountToken(item)
	}
}

func redactAccountToken(item map[string]any) {
	delete(item, "access_token")
}
