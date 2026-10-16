package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"net/http"
	"strings"
)

func (p *registerMoEmailProvider) CreateMailbox(username string) (map[string]any, error) {
	apiBase := strings.TrimRight(util.Clean(p.entry["api_base"]), "/")
	if apiBase == "" {
		return nil, fmt.Errorf("moemail api_base is required")
	}
	domain, err := nextRegisterDomain(util.AsStringSlice(p.entry["domain"]))
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"name":       firstNonEmpty(strings.TrimSpace(username), registerRandomMailboxName()),
		"expiryTime": util.ToInt(p.entry["expiry_time"], 0),
		"domain":     domain,
	}
	data, err := registerMailRequestJSON(p.client, http.MethodPost, apiBase+"/api/emails/generate", map[string]string{
		"X-API-Key":    util.Clean(p.entry["api_key"]),
		"Content-Type": "application/json",
		"User-Agent":   p.conf.UserAgent,
		"Accept":       "application/json",
	}, nil, payload, http.StatusOK, http.StatusCreated)
	if err != nil {
		return nil, err
	}
	address := util.Clean(data["email"])
	emailID := firstNonEmpty(util.Clean(data["id"]), util.Clean(data["email_id"]))
	if address == "" || emailID == "" {
		return nil, fmt.Errorf("MoEmail missing email or id")
	}
	return map[string]any{"provider": "moemail", "provider_ref": p.entry["provider_ref"], "address": address, "email_id": emailID}, nil
}

func (p *registerMoEmailProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	apiBase := strings.TrimRight(util.Clean(p.entry["api_base"]), "/")
	emailID := util.Clean(mailbox["email_id"])
	if apiBase == "" {
		return nil, fmt.Errorf("moemail api_base is required")
	}
	if emailID == "" {
		return nil, fmt.Errorf("MoEmail missing email_id")
	}
	data, err := registerMailRequestJSON(p.client, http.MethodGet, apiBase+"/api/emails/"+emailID, map[string]string{
		"X-API-Key":    util.Clean(p.entry["api_key"]),
		"Content-Type": "application/json",
		"User-Agent":   p.conf.UserAgent,
		"Accept":       "application/json",
	}, nil, nil, http.StatusOK)
	if err != nil {
		return nil, err
	}
	items := util.AsMapSlice(data["messages"])
	if len(items) == 0 {
		return nil, nil
	}
	latest := latestRegisterMailMessage(items)
	messageID := firstNonEmpty(util.Clean(latest["id"]), util.Clean(latest["message_id"]), util.Clean(latest["_id"]))
	message := latest
	raw := any(data)
	if messageID != "" {
		detail, detailErr := registerMailRequestJSON(p.client, http.MethodGet, apiBase+"/api/emails/"+emailID+"/"+messageID, map[string]string{
			"X-API-Key":    util.Clean(p.entry["api_key"]),
			"Content-Type": "application/json",
			"User-Agent":   p.conf.UserAgent,
			"Accept":       "application/json",
		}, nil, nil, http.StatusOK)
		if detailErr != nil {
			return nil, detailErr
		}
		raw = detail
		if nested := util.StringMap(detail["message"]); len(nested) > 0 {
			message = nested
		} else {
			message = detail
		}
	}
	textContent, htmlContent := extractRegisterMailContent(message)
	sender := firstNonNil(message["from"], message["sender"])
	if senderMap, ok := sender.(map[string]any); ok {
		sender = firstNonNil(senderMap["address"], senderMap["email"], senderMap["name"])
	}
	return map[string]any{
		"provider":     "moemail",
		"mailbox":      util.Clean(mailbox["address"]),
		"message_id":   messageID,
		"subject":      firstNonEmpty(util.Clean(message["subject"]), util.Clean(latest["subject"])),
		"sender":       util.Clean(sender),
		"text_content": textContent,
		"html_content": htmlContent,
		"received_at":  firstNonNil(message["createdAt"], message["created_at"], message["receivedAt"], message["date"], message["timestamp"], latest["createdAt"], latest["created_at"], latest["receivedAt"], latest["date"], latest["timestamp"]),
		"raw":          raw,
	}, nil
}
