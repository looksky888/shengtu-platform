package app

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (c *ICloudClient) CreatePrivacyMailbox(ctx context.Context, session ICloudSession, label, note string) (ICloudRemoteMailbox, error) {
	if strings.TrimSpace(session.PremiumMailBaseURL) == "" || strings.TrimSpace(session.DSID) == "" || !iCloudWebLoginSaved(session) {
		return ICloudRemoteMailbox{}, errCode("icloud_session_missing", "未保存 iCloud 登录态，请先协议登录", true)
	}
	if !session.IsICloudPlus || !session.CanCreateHME {
		return ICloudRemoteMailbox{}, errCode("icloud_hme_unavailable", "当前登录态没有可创建隐私邮箱的 iCloud+ 权限", false)
	}

	generated, err := c.generate(ctx, session)
	if err != nil {
		return ICloudRemoteMailbox{}, err
	}
	label = strings.TrimSpace(label)
	if label == "" {
		label = "UPI-" + time.Now().Format("0102-150405")
	}
	return c.reserve(ctx, session, generated, label, strings.TrimSpace(note))
}

func (c *ICloudClient) CreatePrivacyMailboxWithAppleAccount(ctx context.Context, session ICloudSession, fallbackAPIKey, label, note string) (ICloudRemoteMailbox, ICloudSession, error) {
	loginState, ok := appleAccountLoginState(session)
	if !ok {
		return ICloudRemoteMailbox{}, session, errCode("apple_account_session_missing", "当前登录态缺少 Apple Account 管理态，请重新协议登录", true)
	}
	release, err := acquireAppleAccountOperationGate(ctx, appleAccountOperationKey(session, loginState))
	if err != nil {
		return ICloudRemoteMailbox{}, session, err
	}
	defer release()

	fallbackAPIKey = strings.TrimSpace(fallbackAPIKey)
	refreshedBeforeCreate := false
	if appleAccountManageNeedsCreateRefresh(loginState, time.Now()) {
		refreshedBeforeCreate = true
		loginState, session, err = c.refreshAppleAccountManageStateForCreate(ctx, session, loginState, fallbackAPIKey)
		if err != nil {
			return ICloudRemoteMailbox{}, session, err
		}
	}

	remote, updatedSession, err := c.createPrivacyMailboxWithAppleAccountState(ctx, session, loginState, fallbackAPIKey, label, note)
	if err == nil || !isCodedError(err, "apple_account_auth_failed") || refreshedBeforeCreate {
		return remote, updatedSession, err
	}

	retryState, ok := appleAccountLoginState(updatedSession)
	if !ok {
		retryState = loginState
	}
	retryState, updatedSession, refreshErr := c.refreshAppleAccountManageStateForCreate(ctx, updatedSession, retryState, fallbackAPIKey)
	if refreshErr != nil {
		return ICloudRemoteMailbox{}, updatedSession, refreshErr
	}
	return c.createPrivacyMailboxWithAppleAccountState(ctx, updatedSession, retryState, fallbackAPIKey, label, note)
}

func (c *ICloudClient) refreshAppleAccountManageStateForCreate(ctx context.Context, session ICloudSession, loginState LoginState, fallbackAPIKey string) (LoginState, ICloudSession, error) {
	refreshed, err := c.refreshAppleAccountManageStateUnlocked(ctx, loginState)
	loginState = refreshed
	session = withAppleAccountLoginState(session, loginState)
	if err != nil && (fallbackAPIKey == "" || !isCodedError(err, "apple_account_api_key_missing")) {
		return loginState, session, err
	}
	return loginState, session, nil
}

func (c *ICloudClient) createPrivacyMailboxWithAppleAccountState(ctx context.Context, session ICloudSession, loginState LoginState, fallbackAPIKey, label, note string) (ICloudRemoteMailbox, ICloudSession, error) {
	apiKey := strings.TrimSpace(firstNonEmpty(loginState.APIKey, fallbackAPIKey))
	if apiKey == "" {
		return ICloudRemoteMailbox{}, session, errCode("apple_account_api_key_missing", "Apple Account 管理态缺少 api_key，请重新完成 Apple Account 登录流程", true)
	}
	loginState.APIKey = apiKey
	session = withAppleAccountLoginState(session, loginState)
	label = strings.TrimSpace(label)
	if label == "" {
		label = "UPI-" + time.Now().Format("0102-150405")
	}
	note = strings.TrimSpace(note)

	var generated struct {
		EmailAddress string `json:"emailAddress"`
	}
	generatedRaw, err := c.callAppleAccountRaw(ctx, &loginState, apiKey, http.MethodPost, "/account/manage/email/private/add", map[string]any{}, &generated)
	if err != nil {
		return ICloudRemoteMailbox{}, withAppleAccountLoginState(session, loginState), err
	}
	if strings.TrimSpace(generated.EmailAddress) == "" {
		return ICloudRemoteMailbox{}, withAppleAccountLoginState(session, loginState), errCode("apple_account_generate_empty", "Apple Account 未返回候选隐私邮箱；"+appleAccountRawResponseDetail("生成候选隐私邮箱", generatedRaw), true)
	}

	var completed struct {
		EmailAddress string `json:"emailAddress"`
		Label        string `json:"label"`
		Note         string `json:"note"`
		ID           string `json:"id"`
		Active       bool   `json:"active"`
	}
	completedRaw, err := c.callAppleAccountRaw(ctx, &loginState, apiKey, http.MethodPut, "/account/manage/email/private/add/complete", map[string]string{
		"emailAddress": generated.EmailAddress,
		"label":        label,
		"note":         note,
	}, &completed)
	if err != nil {
		return ICloudRemoteMailbox{}, withAppleAccountLoginState(session, loginState), err
	}

	remote := ICloudRemoteMailbox{
		AnonymousID: strings.TrimSpace(completed.ID),
		Email:       strings.ToLower(strings.TrimSpace(firstNonEmpty(completed.EmailAddress, generated.EmailAddress))),
		Label:       strings.TrimSpace(firstNonEmpty(completed.Label, label)),
		Note:        strings.TrimSpace(firstNonEmpty(completed.Note, note, "created by Apple Account private email API")),
		IsActive:    completed.Active,
		Origin:      "APPLE_ACCOUNT",
	}
	if remote.AnonymousID != "" {
		var confirmed struct {
			EmailAddress   string `json:"emailAddress"`
			Label          string `json:"label"`
			Note           string `json:"note"`
			ID             string `json:"id"`
			ForwardToEmail string `json:"forwardToEmail"`
			Active         bool   `json:"active"`
		}
		path := "/account/manage/email/private/" + url.PathEscape(remote.AnonymousID) + ".em"
		if err := c.callAppleAccount(ctx, &loginState, apiKey, http.MethodGet, path, nil, &confirmed); err == nil {
			remote.Email = strings.ToLower(strings.TrimSpace(firstNonEmpty(confirmed.EmailAddress, remote.Email)))
			remote.Label = strings.TrimSpace(firstNonEmpty(confirmed.Label, remote.Label))
			remote.Note = strings.TrimSpace(firstNonEmpty(confirmed.Note, remote.Note))
			remote.ForwardToEmail = strings.TrimSpace(confirmed.ForwardToEmail)
			remote.IsActive = confirmed.Active
		}
	}
	if remote.Email == "" {
		return ICloudRemoteMailbox{}, session, errCode("apple_account_create_empty", "Apple Account 创建后未返回隐私邮箱；"+appleAccountRawResponseDetail("确认创建隐私邮箱", completedRaw), true)
	}
	markAppleAccountManageOK(&loginState)
	session = withAppleAccountLoginState(session, loginState)
	return remote, session, nil
}
