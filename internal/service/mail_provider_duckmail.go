package service

import (
	"chatgpt2api/internal/util"
	"net/http"
	"strings"
)

func (p *registerDuckMailProvider) CreateMailbox(username string) (map[string]any, error) {
	apiKey := util.Clean(p.entry["api_key"])
	domains, err := registerMailRequestAny(p.client, http.MethodGet, "https://api.duckmail.sbs/domains", map[string]string{
		"Authorization": "Bearer " + apiKey,
		"User-Agent":    p.conf.UserAgent,
		"Accept":        "application/json",
	}, nil, nil, http.StatusOK, http.StatusCreated)
	if err != nil {
		return nil, err
	}
	domain := util.Clean(p.entry["default_domain"])
	for _, item := range duckMailItems(domains) {
		if value := util.Clean(item["domain"]); value != "" {
			domain = value
			break
		}
	}
	if domain == "" {
		domain = "duckmail.sbs"
	}
	password := randomAlphaNum(12)
	address := firstNonEmpty(strings.TrimSpace(username), registerRandomMailboxName()) + "@" + domain
	payload := map[string]any{"address": address, "password": password}
	account, err := registerMailRequestJSON(p.client, http.MethodPost, "https://api.duckmail.sbs/accounts", map[string]string{
		"Authorization": "Bearer " + apiKey,
		"User-Agent":    p.conf.UserAgent,
		"Accept":        "application/json",
		"Content-Type":  "application/json",
	}, nil, payload, http.StatusOK, http.StatusCreated)
	if err != nil {
		return nil, err
	}
	tokenData, err := registerMailRequestJSON(p.client, http.MethodPost, "https://api.duckmail.sbs/token", map[string]string{
		"Authorization": "Bearer " + apiKey,
		"User-Agent":    p.conf.UserAgent,
		"Accept":        "application/json",
		"Content-Type":  "application/json",
	}, nil, payload, http.StatusOK, http.StatusCreated)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"provider":     "duckmail",
		"provider_ref": p.entry["provider_ref"],
		"address":      address,
		"token":        util.Clean(tokenData["token"]),
		"password":     password,
		"account_id":   util.Clean(account["id"]),
	}, nil
}

func (p *registerDuckMailProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	token := util.Clean(mailbox["token"])
	data, err := registerMailRequestAny(p.client, http.MethodGet, "https://api.duckmail.sbs/messages", map[string]string{
		"Authorization": "Bearer " + token,
		"User-Agent":    p.conf.UserAgent,
		"Accept":        "application/json",
	}, map[string]string{"page": "1"}, nil, http.StatusOK, http.StatusCreated)
	if err != nil {
		return nil, err
	}
	items := duckMailItems(data)
	if len(items) == 0 {
		return nil, nil
	}
	messageID := strings.TrimPrefix(util.Clean(firstNonNil(items[0]["id"], items[0]["@id"])), "/messages/")
	if messageID == "" {
		return nil, nil
	}
	message, err := registerMailRequestJSON(p.client, http.MethodGet, "https://api.duckmail.sbs/messages/"+messageID, map[string]string{
		"Authorization": "Bearer " + token,
		"User-Agent":    p.conf.UserAgent,
		"Accept":        "application/json",
	}, nil, nil, http.StatusOK)
	if err != nil {
		return nil, err
	}
	textContent, htmlContent := extractRegisterMailContent(message)
	return map[string]any{
		"subject":      util.Clean(message["subject"]),
		"text_content": textContent,
		"html_content": htmlContent,
		"raw":          message["raw"],
	}, nil
}

func duckMailItems(data any) []map[string]any {
	switch typed := data.(type) {
	case []any:
		return util.AsMapSlice(typed)
	case map[string]any:
		return util.AsMapSlice(firstNonNil(typed["hydra:member"], typed["member"], typed["data"]))
	default:
		return nil
	}
}
