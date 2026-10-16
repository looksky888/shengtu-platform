package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

// registerICloudMailProvider talks to iCloud Privacy Mail sidecar.
// type: icloud_local (internal header) | icloud_api (Bearer API key).
// API aligned with gptGrok2api ICloudPrivacyMailProvider + sidecar /api/v1/mailboxes/*.
type registerICloudMailProvider struct {
	registerHTTPMailProvider
	entry         map[string]any
	apiBase       string
	apiKey        string
	internalToken string
	internal      bool
	project       string // openai | grok
	purpose       string
	keyword       string
	waitMS        int
}

func newRegisterICloudMailProvider(base registerHTTPMailProvider, entry map[string]any) *registerICloudMailProvider {
	typ := strings.ToLower(util.Clean(entry["type"]))
	apiBase := strings.TrimRight(firstNonEmpty(
		util.Clean(entry["api_base"]),
		os.Getenv("ICLOUD_PRIVACY_MAIL_BASE_URL"),
		"http://icloud-privacy-mail:8787",
	), "/")
	waitMS := util.ToInt(entry["wait_ms"], 12000)
	if waitMS < 0 {
		waitMS = 0
	}
	if waitMS > 30000 {
		waitMS = 30000
	}
	keyword := firstNonEmpty(util.Clean(entry["keyword"]), "OpenAI")
	project := firstNonEmpty(util.Clean(entry["project"]), "openai")
	if project == "grok" && util.Clean(entry["keyword"]) == "" {
		keyword = "xAI"
	}
	return &registerICloudMailProvider{
		registerHTTPMailProvider: base,
		entry:                    entry,
		apiBase:                  apiBase,
		apiKey:                   util.Clean(entry["api_key"]),
		internalToken:            strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN")),
		internal:                 typ == "icloud_local",
		project:                  project,
		purpose:                  firstNonEmpty(util.Clean(entry["purpose"]), "register"),
		keyword:                  keyword,
		waitMS:                   waitMS,
	}
}

func (p *registerICloudMailProvider) CreateMailbox(username string) (map[string]any, error) {
	if p.apiBase == "" {
		return nil, fmt.Errorf("iCloud Privacy Mail 缺少 API Base")
	}
	if !p.internal && p.apiKey == "" {
		return nil, fmt.Errorf("iCloud Privacy Mail 缺少 API Key")
	}
	if p.internal && p.internalToken == "" {
		return nil, fmt.Errorf("iCloud Privacy Mail 缺少 INTERNAL_SERVICE_TOKEN")
	}
	payload := map[string]any{
		"project": p.project,
		"purpose": p.purpose,
		"count":   1,
	}
	_ = username
	data, status, err := p.doJSON(http.MethodPost, "/api/v1/mailboxes/claim", payload)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("iCloud 领取邮箱失败 HTTP %d: %s", status, truncateRunes(string(data), 240))
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, err
	}
	if root["success"] != true && root["success"] != "true" {
		msg := firstNonEmpty(util.Clean(root["message"]), util.Clean(root["code"]), "claim failed")
		// Guide ops: claim uses pre-created hide-my-email pool, not live Apple create.
		if strings.Contains(msg, "没有可用隐私邮箱") || strings.Contains(strings.ToLower(msg), "no_available") {
			return nil, fmt.Errorf("iCloud Privacy Mail: %s（请先到「iCloud 邮箱」页登录 Apple 并「创建隐私邮箱」，再启动注册）", msg)
		}
		return nil, fmt.Errorf("iCloud Privacy Mail: %s", msg)
	}
	item, _ := root["mailbox"].(map[string]any)
	if item == nil {
		return nil, fmt.Errorf("iCloud 领取响应缺少 mailbox")
	}
	email := util.Clean(item["email"])
	apiURL := util.Clean(item["api_url"])
	if email == "" || apiURL == "" {
		// publicMailbox uses APIURL field in Go JSON — accept both.
		apiURL = firstNonEmpty(apiURL, util.Clean(item["APIURL"]), util.Clean(item["apiURL"]))
	}
	if email == "" {
		return nil, fmt.Errorf("iCloud 领取响应缺少 email")
	}
	if apiURL == "" {
		// Reconstruct from base + email if key present in path style.
		apiURL = fmt.Sprintf("%s/api/v1/mailboxes/%s/code", p.apiBase, url.PathEscape(email))
		if tok := util.Clean(item["api_token"]); tok != "" {
			apiURL += "?key=" + url.QueryEscape(tok)
		}
	}
	if item["api_active"] == false {
		return nil, fmt.Errorf("iCloud Privacy Mail 返回的邮箱 API 已停用")
	}
	if item["icloud_active"] == false {
		return nil, fmt.Errorf("iCloud Privacy Mail 返回的邮箱 iCloud 状态不可用")
	}
	return map[string]any{
		"provider":                    "icloud_api",
		"provider_ref":                util.Clean(p.entry["provider_ref"]),
		"type":                        util.Clean(p.entry["type"]),
		"address":                     email,
		"email":                       email,
		"api_url":                     apiURL,
		"mailbox_id":                  firstNonEmpty(util.Clean(item["id"]), util.Clean(item["ID"])),
		"label":                       util.Clean(item["label"]),
		"supports_passwordless_login": true,
		"_icloud_claim_project":       p.project,
		"_icloud_claim_base":          p.apiBase,
		"_icloud_claim_internal":      p.internal,
		"_icloud_keyword":             p.keyword,
	}, nil
}

func (p *registerICloudMailProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	codeURL := util.Clean(mailbox["api_url"])
	if codeURL == "" {
		return nil, fmt.Errorf("iCloud 邮箱缺少 api_url")
	}
	keyword := firstNonEmpty(util.Clean(mailbox["_icloud_keyword"]), p.keyword, "OpenAI")
	waitMS := p.waitMS
	if v := util.ToInt(mailbox["_icloud_request_wait_ms"], -1); v >= 0 {
		waitMS = v
	}
	u, err := url.Parse(codeURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("iCloud api_url 无效")
	}
	q := u.Query()
	if keyword != "" {
		q.Set("keyword", keyword)
	}
	if waitMS > 0 {
		q.Set("wait_ms", fmt.Sprintf("%d", waitMS))
	}
	u.RawQuery = q.Encode()

	timeout := p.conf.RequestTimeout
	if waitMS > 0 {
		extra := time.Duration(waitMS)*time.Millisecond + 5*time.Second
		if extra > timeout {
			timeout = extra
		}
	}
	client := p.client
	if client == nil {
		client = &http.Client{Timeout: timeout}
	} else {
		// Clone timeout for this long-poll.
		c2 := *client
		c2.Timeout = timeout
		client = &c2
	}

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	p.applyAuth(req)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		if resp.StatusCode >= 500 {
			return nil, nil // retryable
		}
		return nil, fmt.Errorf("iCloud 取码非 JSON HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		code := util.Clean(root["code"])
		if code == "no_code" || resp.StatusCode == 429 || resp.StatusCode >= 500 {
			return nil, nil
		}
		return nil, fmt.Errorf("iCloud 取码失败 HTTP %d: %s", resp.StatusCode, firstNonEmpty(util.Clean(root["message"]), code))
	}
	// success body may still be no_code with HTTP 200
	if util.Clean(root["code"]) == "no_code" {
		return nil, nil
	}
	if root["success"] != true && root["success"] != "true" && util.Clean(root["code"]) != "" {
		if util.Clean(root["code"]) == "no_code" {
			return nil, nil
		}
		return nil, fmt.Errorf("iCloud Privacy Mail: %s", firstNonEmpty(util.Clean(root["message"]), util.Clean(root["code"])))
	}
	codeText := firstNonEmpty(util.Clean(root["code"]), util.Clean(root["verification_code"]))
	// Some responses put code only in nested fields; keep raw for pollRegisterMailCode regex.
	subject := firstNonEmpty(util.Clean(root["subject"]), "Account verification code")
	return map[string]any{
		"provider":     "icloud_api",
		"mailbox":      firstNonEmpty(util.Clean(mailbox["address"]), util.Clean(mailbox["email"]), util.Clean(root["email"])),
		"message_id":   util.Clean(root["message_id"]),
		"subject":      subject,
		"sender":       "iCloud Privacy Mail",
		"text_content": codeText,
		"html_content": "",
		"body":         codeText,
		"raw":          root,
	}, nil
}

func (p *registerICloudMailProvider) Close() {}

// UpdateICloudClaim marks mailbox used/released on the sidecar (internal only).
func UpdateICloudClaim(mailbox map[string]any, claimed bool) error {
	if !util.ToBool(mailbox["_icloud_claim_internal"]) {
		return nil
	}
	base := firstNonEmpty(util.Clean(mailbox["_icloud_claim_base"]), os.Getenv("ICLOUD_PRIVACY_MAIL_BASE_URL"))
	project := firstNonEmpty(util.Clean(mailbox["_icloud_claim_project"]), "openai")
	email := firstNonEmpty(util.Clean(mailbox["address"]), util.Clean(mailbox["email"]))
	if base == "" || email == "" {
		return nil
	}
	p := &registerICloudMailProvider{
		apiBase:       strings.TrimRight(base, "/"),
		internalToken: strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN")),
		internal:      true,
		project:       project,
	}
	if p.internalToken == "" {
		return fmt.Errorf("iCloud Privacy Mail 缺少 INTERNAL_SERVICE_TOKEN")
	}
	_, status, err := p.doJSON(http.MethodPost, "/api/v1/mailboxes/claim-status", map[string]any{
		"project": project,
		"emails":  []string{email},
		"claimed": claimed,
	})
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("iCloud claim-status HTTP %d", status)
	}
	return nil
}

func (p *registerICloudMailProvider) applyAuth(req *http.Request) {
	if p.internal {
		req.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
		req.Header.Set("X-Internal-Token", p.internalToken)
	} else if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
	req.Header.Set("Accept", "application/json")
}

func (p *registerICloudMailProvider) doJSON(method, path string, body map[string]any) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = strings.NewReader(string(raw))
	}
	req, err := http.NewRequest(method, p.apiBase+path, reader)
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	p.applyAuth(req)
	client := p.client
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return data, resp.StatusCode, err
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}
