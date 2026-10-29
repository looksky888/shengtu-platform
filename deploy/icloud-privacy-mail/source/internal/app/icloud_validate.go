package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const iCloudSetupBuildNumber = "2622Build20"

type ICloudSessionValidator struct {
	httpClient *http.Client
}

type validateResult struct {
	AppleID            string
	DSID               string
	ClientID           string
	ClientBuildNumber  string
	MasteringNumber    string
	PremiumMailBaseURL string
	MailGatewayBaseURL string
	MailBaseURL        string
	IsICloudPlus       bool
	CanCreateHME       bool
}

func NewICloudSessionValidator() *ICloudSessionValidator {
	return &ICloudSessionValidator{httpClient: &http.Client{Timeout: 15 * time.Second}}
}

func (c *ICloudSessionValidator) Validate(ctx context.Context, cookies []SessionCookie, defaultHost string) (validateResult, error) {
	return c.ValidateWithClientID(ctx, cookies, defaultHost, "")
}

func (c *ICloudSessionValidator) ValidateWithClientID(ctx context.Context, cookies []SessionCookie, defaultHost, clientID string) (validateResult, error) {
	rawHost := strings.TrimSpace(defaultHost)
	if rawHost == "" {
		rawHost = "www.icloud.com.cn"
	}

	var u url.URL
	sessionHost := rawHost
	if strings.HasPrefix(rawHost, "http://") || strings.HasPrefix(rawHost, "https://") {
		parsed, err := url.Parse(strings.TrimRight(rawHost, "/") + "/validate")
		if err != nil {
			return validateResult{}, err
		}
		u = *parsed
		sessionHost = parsed.Hostname()
	} else {
		setupHost := "setup.icloud.com.cn"
		if strings.HasSuffix(rawHost, "icloud.com") && !strings.HasSuffix(rawHost, "icloud.com.cn") {
			setupHost = "setup.icloud.com"
		}
		u = url.URL{
			Scheme: "https",
			Host:   setupHost,
			Path:   "/setup/ws/1/validate",
		}
	}

	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		var err error
		clientID, err = randomUUID()
		if err != nil {
			return validateResult{}, err
		}
	}
	requestID, err := randomUUID()
	if err != nil {
		return validateResult{}, err
	}
	buildNumber := iCloudSetupBuildNumber
	masteringNumber := buildNumber

	q := u.Query()
	q.Set("clientBuildNumber", buildNumber)
	q.Set("clientMasteringNumber", masteringNumber)
	q.Set("clientId", clientID)
	q.Set("requestId", requestID)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), nil)
	if err != nil {
		return validateResult{}, err
	}
	session := ICloudSession{Host: sessionHost, Cookies: cookies}
	setICloudFetchHeaders(req, session, "*/*", "text/plain;charset=UTF-8")
	if cookie := cookieHeader(cookies, u.String()); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	httpClient := c.httpClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return validateResult{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return validateResult{}, err
	}
	if resp.StatusCode == http.StatusMisdirectedRequest && isUninitializedICloudValidateBody(data) {
		homeHost := "www.icloud.com.cn"
		if strings.HasSuffix(sessionHost, "icloud.com") && !strings.HasSuffix(sessionHost, "icloud.com.cn") {
			homeHost = "www.icloud.com"
		}
		return validateResult{}, errCode(
			"icloud_web_setup_required",
			fmt.Sprintf("该 Apple ID 尚未初始化网页版 iCloud 会话（HTTP 421）：请先在浏览器打开 https://%s 登录一次、同意服务条款并进入「iCloud 邮件」后再试；若只需创建隐私邮箱，直接使用「新接口 · Apple Account」即可", homeHost),
			false,
		)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return validateResult{}, errCode("icloud_validate_failed", fmt.Sprintf("iCloud 登录态校验失败，HTTP %d: %s", resp.StatusCode, appleDebugBody(data)), true)
	}
	var account struct {
		DSInfo struct {
			DSID                            string `json:"dsid"`
			AppleID                         string `json:"appleId"`
			PrimaryEmail                    string `json:"primaryEmail"`
			IsHideMyEmailSubscriptionActive bool   `json:"isHideMyEmailSubscriptionActive"`
			IsHideMyEmailFeatureAvailable   bool   `json:"isHideMyEmailFeatureAvailable"`
		} `json:"dsInfo"`
		Webservices map[string]struct {
			URL    string `json:"url"`
			Status string `json:"status"`
		} `json:"webservices"`
	}
	if err := json.Unmarshal(data, &account); err != nil {
		return validateResult{}, errCode("icloud_validate_bad_response", "iCloud 登录态校验返回无法解析", true)
	}
	premium := account.Webservices["premiummailsettings"].URL
	mailGateway := account.Webservices["mccgateway"].URL
	mail := account.Webservices["mail"].URL
	appleID := account.DSInfo.AppleID
	if appleID == "" {
		appleID = account.DSInfo.PrimaryEmail
	}
	return validateResult{
		AppleID:            appleID,
		DSID:               account.DSInfo.DSID,
		ClientID:           clientID,
		ClientBuildNumber:  buildNumber,
		MasteringNumber:    masteringNumber,
		PremiumMailBaseURL: premium,
		MailGatewayBaseURL: mailGateway,
		MailBaseURL:        mail,
		IsICloudPlus:       account.DSInfo.IsHideMyEmailSubscriptionActive,
		CanCreateHME:       account.DSInfo.IsHideMyEmailFeatureAvailable,
	}, nil
}

func isUninitializedICloudValidateBody(data []byte) bool {
	var payload struct {
		Success     *bool    `json:"success"`
		TrustTokens []string `json:"trustTokens"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(data), &payload); err != nil {
		return false
	}
	return payload.Success != nil && !*payload.Success
}
