package service

import (
	"chatgpt2api/internal/util"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	outlookTokenURL          = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
	outlookGraphMessagesURL  = "https://graph.microsoft.com/v1.0/me/messages"
	outlookGraphScope        = "offline_access https://graph.microsoft.com/Mail.Read"
	outlookIMAPScope         = "offline_access https://outlook.office.com/IMAP.AccessAsUser.All"
	outlookDefaultIMAPHost   = "outlook.office365.com"
	outlookAccessTokenTTLSec = 600
)

// OutlookTokenError marks refresh_token exchange failures (invalid/expired credentials).
type OutlookTokenError struct {
	Msg string
}

func (e *OutlookTokenError) Error() string {
	if e == nil {
		return "OutlookToken error"
	}
	return e.Msg
}

type registerOutlookTokenProvider struct {
	registerHTTPMailProvider
	entry        map[string]any
	pool         []outlookCredential
	mode         string
	messageLimit int
	tokenCacheMu sync.Mutex
	tokenCache   map[string]map[string]outlookCachedToken // address -> scope -> token
}

type outlookCachedToken struct {
	AccessToken string
	ExpiresAt   time.Time
}

func newRegisterOutlookTokenProvider(base registerHTTPMailProvider, entry map[string]any) *registerOutlookTokenProvider {
	mode := strings.ToLower(strings.TrimSpace(util.Clean(entry["mode"])))
	if mode != "graph" && mode != "imap" && mode != "auto" {
		mode = "graph"
	}
	limit := util.ToInt(entry["message_limit"], 10)
	if limit < 1 {
		limit = 10
	}
	return &registerOutlookTokenProvider{
		registerHTTPMailProvider: base,
		entry:                    entry,
		pool:                     normalizeOutlookPool(firstNonNil(entry["mailboxes"], entry["pool"])),
		mode:                     mode,
		messageLimit:             limit,
		tokenCache:               map[string]map[string]outlookCachedToken{},
	}
}

func (p *registerOutlookTokenProvider) CreateMailbox(username string) (map[string]any, error) {
	_ = username
	if len(p.pool) == 0 {
		return nil, fmt.Errorf("OutlookToken 邮箱池为空，请在邮箱配置中导入 email----password----client_id----refresh_token")
	}
	outlookTokenStateMu.Lock()
	defer outlookTokenStateMu.Unlock()
	store, err := loadOutlookTokenState()
	if err != nil {
		return nil, err
	}
	var credential *outlookCredential
	for i := range p.pool {
		item := p.pool[i]
		entry, ok := store[strings.ToLower(strings.TrimSpace(item.Email))]
		var entryPtr *outlookTokenStateEntry
		if ok {
			entryPtr = &entry
		}
		if outlookEntryAvailable(entryPtr) {
			credential = &item
			break
		}
	}
	if credential == nil {
		label := firstNonEmpty(util.Clean(p.entry["label"]), util.Clean(p.entry["provider_ref"]), "outlook_token")
		return nil, fmt.Errorf("[%s] OutlookToken 邮箱池暂无可用邮箱（共 %d 个，已用尽或全部占用/失效），请导入新邮箱或重置池状态", label, len(p.pool))
	}
	store[strings.ToLower(strings.TrimSpace(credential.Email))] = outlookTokenStateEntry{
		State:     outlookStateInUse,
		Reason:    "",
		UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := saveOutlookTokenState(store); err != nil {
		return nil, err
	}
	return map[string]any{
		"provider":      "outlook_token",
		"provider_ref":  p.entry["provider_ref"],
		"address":       credential.Email,
		"label":         firstNonEmpty(util.Clean(p.entry["label"]), util.Clean(p.entry["provider_ref"])),
		"client_id":     credential.ClientID,
		"refresh_token": credential.RefreshToken,
	}, nil
}

func (p *registerOutlookTokenProvider) FetchLatestMessage(mailbox map[string]any) (map[string]any, error) {
	messages, err := p.FetchRecentMessages(mailbox)
	if err != nil {
		return nil, err
	}
	if len(messages) == 0 {
		return nil, nil
	}
	return messages[0], nil
}

func (p *registerOutlookTokenProvider) FetchRecentMessages(mailbox map[string]any) ([]map[string]any, error) {
	clientID := util.Clean(mailbox["client_id"])
	refreshToken := util.Clean(mailbox["refresh_token"])
	if clientID == "" || refreshToken == "" {
		return nil, fmt.Errorf("OutlookToken mailbox 缺少 client_id 或 refresh_token")
	}
	mode := p.mode
	if mode != "graph" && mode != "imap" && mode != "auto" {
		mode = "auto"
	}
	var errors []string
	if mode == "graph" || mode == "auto" {
		accessToken, err := p.accessToken(mailbox, clientID, refreshToken, outlookGraphScope)
		if err == nil {
			messages, graphErr := p.graphMessages(mailbox, accessToken)
			if graphErr == nil {
				return messages, nil
			}
			err = graphErr
		}
		if mode == "graph" {
			return nil, err
		}
		errors = append(errors, "graph: "+err.Error())
	}
	if mode == "imap" || mode == "auto" {
		accessToken, err := p.accessToken(mailbox, clientID, refreshToken, outlookIMAPScope)
		if err == nil {
			messages, imapErr := p.imapMessages(mailbox, accessToken)
			if imapErr == nil {
				return messages, nil
			}
			err = imapErr
		}
		if mode == "imap" {
			return nil, err
		}
		errors = append(errors, "imap: "+err.Error())
	}
	if len(errors) > 0 {
		return nil, fmt.Errorf("%s", strings.Join(errors, "; "))
	}
	return nil, nil
}

func (p *registerOutlookTokenProvider) accessToken(mailbox map[string]any, clientID, refreshToken, scope string) (string, error) {
	address := strings.ToLower(strings.TrimSpace(util.Clean(mailbox["address"])))
	p.tokenCacheMu.Lock()
	if byScope := p.tokenCache[address]; byScope != nil {
		if cached, ok := byScope[scope]; ok && time.Now().Before(cached.ExpiresAt) && cached.AccessToken != "" {
			token := cached.AccessToken
			p.tokenCacheMu.Unlock()
			return token, nil
		}
	}
	p.tokenCacheMu.Unlock()

	token, err := p.exchangeRefreshToken(clientID, refreshToken, scope)
	if err != nil {
		return "", err
	}
	p.tokenCacheMu.Lock()
	if p.tokenCache[address] == nil {
		p.tokenCache[address] = map[string]outlookCachedToken{}
	}
	p.tokenCache[address][scope] = outlookCachedToken{
		AccessToken: token,
		ExpiresAt:   time.Now().Add(outlookAccessTokenTTLSec * time.Second),
	}
	p.tokenCacheMu.Unlock()
	return token, nil
}

func (p *registerOutlookTokenProvider) exchangeRefreshToken(clientID, refreshToken, scope string) (string, error) {
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("scope", scope)
	req, err := http.NewRequest(http.MethodPost, outlookTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", p.conf.UserAgent)
	resp, err := p.client.Do(req)
	if err != nil {
		return "", &OutlookTokenError{Msg: fmt.Sprintf("OutlookToken 刷新失败: %v", err)}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var data map[string]any
	_ = json.Unmarshal(body, &data)
	if resp.StatusCode != http.StatusOK {
		detail := firstNonEmpty(util.Clean(data["error_description"]), util.Clean(data["error"]), string(body))
		if len(detail) > 300 {
			detail = detail[:300]
		}
		return "", &OutlookTokenError{Msg: fmt.Sprintf("OutlookToken 刷新失败: HTTP %d, %s", resp.StatusCode, detail)}
	}
	accessToken := util.Clean(data["access_token"])
	if accessToken == "" {
		return "", &OutlookTokenError{Msg: "OutlookToken 刷新响应缺少 access_token"}
	}
	return accessToken, nil
}

func (p *registerOutlookTokenProvider) graphMessages(mailbox map[string]any, accessToken string) ([]map[string]any, error) {
	query := url.Values{}
	query.Set("$top", fmt.Sprintf("%d", p.messageLimit))
	query.Set("$orderby", "receivedDateTime desc")
	query.Set("$select", "subject,receivedDateTime,from,body,bodyPreview")
	req, err := http.NewRequest(http.MethodGet, outlookGraphMessagesURL+"?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", p.conf.UserAgent)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	var data map[string]any
	_ = json.Unmarshal(body, &data)
	if resp.StatusCode != http.StatusOK {
		detail := string(body)
		if errObj := util.StringMap(data["error"]); len(errObj) > 0 {
			detail = firstNonEmpty(util.Clean(errObj["message"]), detail)
		}
		if len(detail) > 300 {
			detail = detail[:300]
		}
		return nil, fmt.Errorf("OutlookToken Graph 失败: HTTP %d, %s", resp.StatusCode, detail)
	}
	items := util.AsMapSlice(data["value"])
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, p.normalizeGraphItem(mailbox, item))
	}
	return out, nil
}

func (p *registerOutlookTokenProvider) normalizeGraphItem(mailbox, item map[string]any) map[string]any {
	body := util.StringMap(item["body"])
	contentType := strings.ToLower(util.Clean(body["contentType"]))
	content := util.Clean(body["content"])
	textContent := content
	htmlContent := ""
	if contentType == "html" {
		textContent = util.Clean(item["bodyPreview"])
		htmlContent = content
	}
	return map[string]any{
		"provider":     "outlook_token",
		"mailbox":      util.Clean(mailbox["address"]),
		"message_id":   util.Clean(item["id"]),
		"subject":      util.Clean(item["subject"]),
		"sender":       outlookGraphSender(item),
		"text_content": textContent,
		"html_content": htmlContent,
		"received_at":  util.Clean(item["receivedDateTime"]),
		"raw":          item,
	}
}

func outlookGraphSender(message map[string]any) string {
	sender := util.StringMap(message["from"])
	address := util.StringMap(sender["emailAddress"])
	return firstNonEmpty(util.Clean(address["address"]), util.Clean(address["name"]))
}

func markRegisterMailboxResult(mailbox map[string]any, success bool, err error) error {
	provider := util.Clean(mailbox["provider"])
	if provider == "icloud_api" || provider == "icloud_local" {
		_ = UpdateICloudClaim(mailbox, success)
		return nil
	}
	if provider != "outlook_token" {
		return nil
	}
	address := util.Clean(mailbox["address"])
	if address == "" {
		return nil
	}
	if success {
		return setOutlookTokenState(address, outlookStateUsed, "")
	}
	reason := ""
	if err != nil {
		reason = err.Error()
	}
	if isOutlookTokenError(err) || strings.Contains(reason, "OutlookToken 刷新失败") || strings.Contains(reason, "access_token") {
		return setOutlookTokenState(address, outlookStateTokenInvalid, reason)
	}
	return setOutlookTokenState(address, outlookStateFailed, reason)
}

func releaseRegisterMailbox(mailbox map[string]any) error {
	provider := util.Clean(mailbox["provider"])
	if provider == "icloud_api" || provider == "icloud_local" {
		_ = UpdateICloudClaim(mailbox, false)
		return nil
	}
	if provider != "outlook_token" {
		return nil
	}
	return releaseOutlookTokenState(util.Clean(mailbox["address"]))
}

func isOutlookTokenError(err error) bool {
	if err == nil {
		return false
	}
	if _, ok := err.(*OutlookTokenError); ok {
		return true
	}
	return strings.Contains(err.Error(), "OutlookToken 刷新失败")
}

func maskOutlookEmail(email string) string {
	email = strings.TrimSpace(email)
	local, domain, ok := strings.Cut(email, "@")
	if !ok {
		return "***"
	}
	var masked string
	if len(local) > 2 {
		masked = local[:2] + "***" + local[len(local)-1:]
	} else if len(local) > 0 {
		masked = local[:1] + "***"
	} else {
		masked = "***"
	}
	return masked + "@" + domain
}
