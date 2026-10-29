package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (c *AppleAuthClient) trustSession(ctx context.Context, session *appleAuthSession) error {
	return retryAppleTransient(ctx, func() error {
		_, _, err := c.do(ctx, session, http.MethodGet, session.Endpoints.Auth+"/2sv/trust", session.authHeaders(), nil, nil, false)
		return err
	})
}

func (c *AppleAuthClient) authWithAppleAccountManage(ctx context.Context, session *appleAuthSession) (ICloudSession, error) {
	now := time.Now()
	loginState := LoginState{
		Kind:      LoginStateAppleAccount,
		Host:      "appleid.apple.com",
		Origin:    appleAccountManageOrigin,
		SavedAt:   now,
		Cookies:   session.cloneCookies(),
		Scnt:      firstNonEmpty(session.Scnt, session.ManageScnt),
		SessionID: session.SessionID,
		UserAgent: appleAccountManageUserAgent,
		Note:      "Apple Account management login state",
	}
	refreshed, err := (&ICloudClient{client: c.httpClient}).RefreshAppleAccountManageState(ctx, loginState)
	if err != nil {
		return ICloudSession{}, err
	}
	return ICloudSession{
		SavedAt:     now,
		AppleID:     session.AppleID,
		Host:        "appleid.apple.com",
		LoginStates: []LoginState{refreshed},
		Note:        "saved from Apple Account management protocol login",
	}, nil
}

func buildSetupAccountLoginURL(setupBase, webClientID string) string {
	raw := strings.TrimRight(strings.TrimSpace(setupBase), "/") + "/accountLogin"
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	q := parsed.Query()
	q.Set("clientBuildNumber", iCloudSetupBuildNumber)
	q.Set("clientMasteringNumber", iCloudSetupBuildNumber)
	if strings.TrimSpace(webClientID) != "" {
		q.Set("clientId", strings.TrimSpace(webClientID))
	}
	parsed.RawQuery = q.Encode()
	return parsed.String()
}

func (c *AppleAuthClient) authWithTokenAndValidate(ctx context.Context, session *appleAuthSession) (ICloudSession, error) {
	if session.SessionToken == "" {
		return ICloudSession{}, errCode("apple_session_token_missing", "Apple Session Token 缺失，无法换取 iCloud 登录态", true)
	}
	webClientID, err := randomUUID()
	if err != nil {
		return ICloudSession{}, err
	}

	var account appleAccountInfo
	for attempt := 0; attempt < 2; attempt++ {
		account = appleAccountInfo{}
		body := map[string]any{
			"accountCountryCode": session.AccountCountry,
			"dsWebAuthToken":     session.SessionToken,
			"extended_login":     true,
			"trustToken":         session.TrustToken,
		}
		headers := session.commonHeaders(map[string]string{})
		loginURL := buildSetupAccountLoginURL(session.Endpoints.Setup, webClientID)
		err := retryAppleTransient(ctx, func() error {
			_, _, doErr := c.do(ctx, session, http.MethodPost, loginURL, headers, body, &account, false)
			return doErr
		})
		if err != nil {
			var redirect appleDomainRedirectError
			if attempt == 0 && errors.As(err, &redirect) && session.switchHost(redirect.Host) {
				continue
			}
			return ICloudSession{}, err
		}
		if redirectHost := appleDomainToHost(account.DomainToUse); attempt == 0 && redirectHost != "" && session.switchHost(redirectHost) {
			continue
		}
		break
	}

	cookies := session.cloneCookies()
	validateTarget := session.Endpoints.Host
	if strings.HasPrefix(session.Endpoints.Setup, "http://") {
		validateTarget = session.Endpoints.Setup
	}
	validator := &ICloudSessionValidator{httpClient: c.httpClient}
	if validator.httpClient == nil {
		validator = NewICloudSessionValidator()
	}
	validate, err := validator.ValidateWithClientID(ctx, cookies, validateTarget, webClientID)
	if err != nil {
		if fallback, ok := fallbackValidateFromAccountLogin(account, cookies, webClientID, time.Now()); ok {
			validate = fallback
		} else {
			if setupErr := classifyAccountLoginSetupRequirement(account, cookies, session.Endpoints.Home, time.Now()); setupErr != nil {
				return ICloudSession{}, setupErr
			}
			return ICloudSession{}, err
		}
	}
	savedAt := time.Now()
	return ICloudSession{
		SavedAt:            savedAt,
		AppleID:            firstNonEmpty(validate.AppleID, account.DSInfo.AppleID, account.DSInfo.PrimaryEmail, session.AppleID),
		DSID:               validate.DSID,
		ClientID:           validate.ClientID,
		ClientBuildNumber:  validate.ClientBuildNumber,
		MasteringNumber:    validate.MasteringNumber,
		PremiumMailBaseURL: strings.TrimRight(validate.PremiumMailBaseURL, "/"),
		MailGatewayBaseURL: strings.TrimRight(validate.MailGatewayBaseURL, "/"),
		MailBaseURL:        strings.TrimRight(validate.MailBaseURL, "/"),
		Host:               session.Endpoints.Host,
		IsICloudPlus:       validate.IsICloudPlus,
		CanCreateHME:       validate.CanCreateHME,
		Cookies:            cookies,
		LoginStates: []LoginState{
			{
				Kind:      LoginStateICloudWeb,
				Host:      session.Endpoints.Host,
				Origin:    session.Endpoints.Home,
				SavedAt:   savedAt,
				Cookies:   append([]SessionCookie(nil), cookies...),
				UserAgent: appleAuthUserAgent,
				Note:      "iCloud webservices login state",
			},
		},
		Note: "saved from Go Apple SRP protocol login",
	}, nil
}

func fallbackValidateFromAccountLogin(account appleAccountInfo, cookies []SessionCookie, clientID string, now time.Time) (validateResult, bool) {
	if account.TermsUpdateNeeded || account.IsRepairNeeded {
		return validateResult{}, false
	}
	present, current := namedCookieValidity(cookies, iCloudWebAuthUserCookie, now)
	if !present || !current {
		return validateResult{}, false
	}
	dsid := strings.TrimSpace(account.DSInfo.DSID)
	if dsid == "" {
		return validateResult{}, false
	}
	premium := strings.TrimSpace(account.Webservices["premiummailsettings"].URL)
	mailGateway := strings.TrimSpace(account.Webservices["mccgateway"].URL)
	mail := strings.TrimSpace(account.Webservices["mail"].URL)
	if premium == "" && mail == "" {
		return validateResult{}, false
	}
	return validateResult{
		AppleID:            firstNonEmpty(account.DSInfo.AppleID, account.DSInfo.PrimaryEmail),
		DSID:               dsid,
		ClientID:           clientID,
		ClientBuildNumber:  iCloudSetupBuildNumber,
		MasteringNumber:    iCloudSetupBuildNumber,
		PremiumMailBaseURL: premium,
		MailGatewayBaseURL: mailGateway,
		MailBaseURL:        mail,
		IsICloudPlus:       account.DSInfo.IsHideMyEmailSubscriptionActive,
		CanCreateHME:       account.DSInfo.IsHideMyEmailFeatureAvailable,
	}, true
}

func classifyAccountLoginSetupRequirement(account appleAccountInfo, cookies []SessionCookie, homeURL string, now time.Time) error {
	home := strings.TrimSpace(homeURL)
	if home == "" {
		home = "https://www.icloud.com.cn"
	}
	if account.TermsUpdateNeeded {
		return errCode(
			"icloud_web_setup_required",
			fmt.Sprintf("该 Apple ID 需要先同意最新 iCloud 服务条款：请用浏览器打开 %s 登录一次、完成条款确认并进入「iCloud 邮件」后再试；若只需创建隐私邮箱，直接使用「新接口 · Apple Account」即可", home),
			false,
		)
	}
	if account.IsRepairNeeded {
		return errCode(
			"icloud_web_setup_required",
			fmt.Sprintf("该 Apple ID 需要先在网页端完成账号修复校验：请用浏览器打开 %s 登录处理后再试；若只需创建隐私邮箱，直接使用「新接口 · Apple Account」即可", home),
			false,
		)
	}
	present, current := namedCookieValidity(cookies, iCloudWebAuthUserCookie, now)
	if !present || !current {
		return errCode(
			"icloud_web_setup_required",
			fmt.Sprintf("该 Apple ID 尚未初始化网页版 iCloud 会话（未下发 Web 认证 Cookie）：请先在浏览器打开 %s 登录一次、同意服务条款并确认已开通「iCloud 邮件」后再试；若只需创建隐私邮箱，直接使用「新接口 · Apple Account」即可", home),
			false,
		)
	}
	return nil
}
