package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"net/http"
	"strings"
)

func (p *registerCloudflareTempMailProvider) CreateMailbox(username string) (map[string]any, error) {
	apiBase := strings.TrimRight(util.Clean(p.entry["api_base"]), "/")
	adminPassword := util.Clean(p.entry["admin_password"])
	domain, err := nextRegisterDomain(util.AsStringSlice(p.entry["domain"]))
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"enablePrefix": true,
		"name":         firstNonEmpty(strings.TrimSpace(username), registerRandomMailboxName()),
		"domain":       domain,
	}
	data, err := registerMailRequestJSON(p.client, http.MethodPost, apiBase+"/admin/new_address", map[string]string{
		"Content-Type": "application/json",
		"User-Agent":   p.conf.UserAgent,
		"x-admin-auth": adminPassword,
	}, nil, payload, http.StatusOK)
	if err != nil {
		return nil, err
	}
	address := util.Clean(data["address"])
	token := util.Clean(data["jwt"])
	if address == "" || token == "" {
		return nil, fmt.Errorf("cloudflare_temp_email response missing address or jwt")
	}
	return map[string]any{"provider": "cloudflare_temp_email", "provider_ref": p.entry["provider_ref"], "address": address, "token": token}, nil
}

func (p *registerCloudflareTempMailProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	apiBase := strings.TrimRight(util.Clean(p.entry["api_base"]), "/")
	token := util.Clean(mailbox["token"])
	data, err := registerMailRequestJSON(p.client, http.MethodGet, apiBase+"/api/mails", map[string]string{
		"Authorization": "Bearer " + token,
		"User-Agent":    p.conf.UserAgent,
	}, map[string]string{"limit": "10", "offset": "0"}, nil, http.StatusOK)
	if err != nil {
		return nil, err
	}
	items := util.AsMapSlice(data["results"])
	messages := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if registerMessageMatchesEmail(item, util.Clean(mailbox["address"])) {
			messages = append(messages, item)
		}
	}
	if len(messages) == 0 {
		return nil, nil
	}
	message := latestRegisterMailMessage(messages)
	textContent, htmlContent := extractRegisterMailContent(message)
	return map[string]any{
		"subject":      util.Clean(message["subject"]),
		"text_content": textContent,
		"html_content": htmlContent,
		"raw":          message["raw"],
	}, nil
}
