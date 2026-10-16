package app

import (
	"context"
	"net/http"
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

func (c *AppleAuthClient) authWithTokenAndValidate(ctx context.Context, session *appleAuthSession) (ICloudSession, error) {
	if session.SessionToken == "" {
		return ICloudSession{}, errCode("apple_session_token_missing", "Apple Session Token 缺失，无法换取 iCloud 登录态", true)
	}
	var account appleAccountInfo
	body := map[string]any{
		"accountCountryCode": session.AccountCountry,
		"dsWebAuthToken":     session.SessionToken,
		"extended_login":     true,
		"trustToken":         session.TrustToken,
	}
	headers := session.commonHeaders(map[string]string{})
	if err := retryAppleTransient(ctx, func() error {
		_, _, err := c.do(ctx, session, http.MethodPost, session.Endpoints.Setup+"/accountLogin", headers, body, &account, false)
		return err
	}); err != nil {
		return ICloudSession{}, err
	}
	cookies := session.cloneCookies()
	validate, err := NewICloudSessionValidator().Validate(ctx, cookies, session.Endpoints.Host)
	if err != nil {
		return ICloudSession{}, err
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
