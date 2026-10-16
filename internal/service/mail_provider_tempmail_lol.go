package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
)

func (p *registerTempMailLOLProvider) CreateMailbox(username string) (map[string]any, error) {
	payload := map[string]any{}
	domains := util.AsStringSlice(p.entry["domain"])
	if len(domains) > 0 {
		domain := domains[rand.Intn(len(domains))]
		if strings.HasPrefix(domain, "*.") && len(domain) > 2 {
			payload["domain"] = registerRandomSubdomainLabel() + "." + strings.TrimPrefix(domain, "*.")
			payload["prefix"] = registerRandomMailboxName()
		} else if strings.TrimSpace(domain) != "" {
			payload["domain"] = strings.TrimSpace(domain)
		}
	}
	if username = strings.TrimSpace(username); username != "" && payload["prefix"] == nil {
		payload["prefix"] = username
	}
	data, err := registerMailRequestJSON(p.client, http.MethodPost, "https://api.tempmail.lol/v2/inbox/create", map[string]string{
		"Content-Type": "application/json",
		"User-Agent":   p.conf.UserAgent,
		"Accept":       "application/json",
		"Authorization": func() string {
			if key := util.Clean(p.entry["api_key"]); key != "" {
				return "Bearer " + key
			}
			return ""
		}(),
	}, nil, payload, http.StatusOK, http.StatusCreated)
	if err != nil {
		return nil, err
	}
	address := util.Clean(data["address"])
	token := util.Clean(data["token"])
	if address == "" || token == "" {
		return nil, fmt.Errorf("tempmail_lol response missing address or token")
	}
	return map[string]any{"provider": "tempmail_lol", "provider_ref": p.entry["provider_ref"], "address": address, "token": token}, nil
}

func (p *registerTempMailLOLProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	data, err := registerMailRequestJSON(p.client, http.MethodGet, "https://api.tempmail.lol/v2/inbox", map[string]string{
		"User-Agent": p.conf.UserAgent,
		"Accept":     "application/json",
	}, map[string]string{"token": util.Clean(mailbox["token"])}, nil, http.StatusOK)
	if err != nil {
		return nil, err
	}
	items := util.AsMapSlice(firstNonNil(data["emails"], data["messages"]))
	if len(items) == 0 {
		return nil, nil
	}
	latest := latestRegisterMailMessage(items)
	textContent, htmlContent := extractRegisterMailContent(latest)
	return map[string]any{
		"subject":      util.Clean(latest["subject"]),
		"text_content": textContent,
		"html_content": htmlContent,
		"raw":          latest["raw"],
	}, nil
}
