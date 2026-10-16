package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"net/http"
	"strings"
)

func (p *registerGPTMailProvider) CreateMailbox(username string) (map[string]any, error) {
	payload := map[string]any{}
	if username = strings.TrimSpace(username); username != "" {
		payload["prefix"] = username
	}
	if domain := util.Clean(p.entry["default_domain"]); domain != "" {
		payload["domain"] = domain
	}
	method := http.MethodGet
	var requestBody any
	if len(payload) > 0 {
		method = http.MethodPost
		requestBody = payload
	}
	data, err := registerMailRequestAny(p.client, method, "https://mail.chatgpt.org.uk/api/generate-email", map[string]string{
		"X-API-Key":    util.Clean(p.entry["api_key"]),
		"User-Agent":   p.conf.UserAgent,
		"Accept":       "application/json",
		"Content-Type": "application/json",
	}, nil, requestBody, http.StatusOK)
	if err != nil {
		return nil, err
	}
	typed := util.StringMap(data)
	payloadMap := util.StringMap(firstNonNil(typed["data"], data))
	address := util.Clean(payloadMap["email"])
	if address == "" {
		return nil, fmt.Errorf("gptmail response missing email")
	}
	return map[string]any{"provider": "gptmail", "provider_ref": p.entry["provider_ref"], "address": address}, nil
}

func (p *registerGPTMailProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	data, err := registerMailRequestAny(p.client, http.MethodGet, "https://mail.chatgpt.org.uk/api/emails", map[string]string{
		"X-API-Key":  util.Clean(p.entry["api_key"]),
		"User-Agent": p.conf.UserAgent,
		"Accept":     "application/json",
	}, map[string]string{"email": util.Clean(mailbox["address"])}, nil, http.StatusOK)
	if err != nil {
		return nil, err
	}
	body := util.StringMap(data)
	if nested := util.StringMap(body["data"]); len(nested) > 0 {
		body = nested
	}
	items := util.AsMapSlice(firstNonNil(body["emails"], body))
	if len(items) == 0 {
		return nil, nil
	}
	latest := latestRegisterMailMessage(items)
	if id := util.Clean(latest["id"]); id != "" {
		detail, detailErr := registerMailRequestAny(p.client, http.MethodGet, "https://mail.chatgpt.org.uk/api/email/"+id, map[string]string{
			"X-API-Key":  util.Clean(p.entry["api_key"]),
			"User-Agent": p.conf.UserAgent,
			"Accept":     "application/json",
		}, nil, nil, http.StatusOK)
		if detailErr == nil {
			if typed, ok := detail.(map[string]any); ok && typed["data"] != nil {
				latest = util.StringMap(typed["data"])
			} else if typed, ok := detail.(map[string]any); ok {
				latest = typed
			}
		}
	}
	textContent, htmlContent := extractRegisterMailContent(latest)
	return map[string]any{
		"subject":      util.Clean(latest["subject"]),
		"text_content": textContent,
		"html_content": htmlContent,
		"raw":          latest["raw"],
	}, nil
}
