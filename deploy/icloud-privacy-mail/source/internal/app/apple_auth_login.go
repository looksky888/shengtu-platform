package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

func (c *AppleAuthClient) StartLogin(ctx context.Context, appleID, password, defaultHost, clientID string, pendingStore *appleAuthPendingStore, twoFactorMethod string) (appleAuthStartResult, error) {
	appleID = strings.ToLower(strings.TrimSpace(appleID))
	if appleID == "" || strings.TrimSpace(password) == "" {
		return appleAuthStartResult{}, errCode("apple_credentials_missing", "缺少 Apple ID 或密码", false)
	}
	method := normalizeAppleTwoFactorMethod(twoFactorMethod)
	result, err := c.startLoginOnHost(ctx, appleID, password, defaultHost, clientID, pendingStore, method)
	if err == nil {
		return result, nil
	}
	var redirect appleDomainRedirectError
	if !errors.As(err, &redirect) || redirect.Host == "" {
		return appleAuthStartResult{}, err
	}
	currentHost := appleAuthEndpointsForHost(defaultHost).Host
	nextHost := appleAuthEndpointsForHost(redirect.Host).Host
	if currentHost == nextHost {
		return appleAuthStartResult{}, err
	}
	return c.startLoginOnHost(ctx, appleID, password, nextHost, clientID, pendingStore, method)
}

func (c *AppleAuthClient) StartAppleAccountManageLogin(ctx context.Context, appleID, password string, pendingStore *appleAuthPendingStore, twoFactorMethod string) (appleAuthStartResult, error) {
	appleID = strings.ToLower(strings.TrimSpace(appleID))
	if appleID == "" || strings.TrimSpace(password) == "" {
		return appleAuthStartResult{}, errCode("apple_credentials_missing", "缺少 Apple ID 或密码", false)
	}
	method := normalizeAppleTwoFactorMethod(twoFactorMethod)
	frameID, err := randomUUID()
	if err != nil {
		return appleAuthStartResult{}, err
	}
	session := &appleAuthSession{
		Endpoints: appleAccountManageAuthEndpoints(),
		AppleID:   appleID,
		ClientID:  appleAccountManageOAuthClientID,
		FrameID:   strings.ToLower(frameID),
		UserAgent: appleAccountManageUserAgent,
	}
	if err := c.primeAppleAccountManageState(ctx, session); err != nil {
		return appleAuthStartResult{}, err
	}
	if err := c.authStart(ctx, session); err != nil {
		return appleAuthStartResult{}, err
	}
	if err := c.authDeviceKeyChallenge(ctx, session); err != nil {
		return appleAuthStartResult{}, err
	}
	if err := c.authFederate(ctx, session); err != nil {
		return appleAuthStartResult{}, err
	}
	needs2FA, err := c.authSRP(ctx, session, password)
	if err != nil {
		return appleAuthStartResult{}, err
	}
	if needs2FA {
		session.TwoFactorMethod = method
		message := "Apple Account 已向受信任设备发送验证码；收到 6 位验证码后提交"
		if err := c.refreshAuthState(ctx, session); err != nil {
			message = "Apple Account 已要求 2FA；请查看受信任设备验证码"
		}
		if method == appleTwoFactorMethodPhone {
			if err := c.requestPhoneSecurityCode(ctx, session, nil); err != nil {
				return appleAuthStartResult{}, err
			}
			message = "Apple Account 已向受信任手机号发送短信验证码；收到 6 位验证码后提交"
		}
		pending, err := pendingStore.put(session)
		if err != nil {
			return appleAuthStartResult{}, err
		}
		return appleAuthStartResult{
			PendingID: pending.ID,
			Needs2FA:  true,
			Message:   message,
			AppleID:   strings.TrimSpace(appleID),
			ExpiresAt: pending.ExpiresAt,
		}, nil
	}
	icloudSession, err := c.authWithAppleAccountManage(ctx, session)
	if err != nil {
		return appleAuthStartResult{}, err
	}
	return appleAuthStartResult{
		Session:  icloudSession,
		Needs2FA: false,
		Message:  "Apple Account 管理态登录成功",
		AppleID:  strings.TrimSpace(appleID),
	}, nil
}

func (c *AppleAuthClient) startLoginOnHost(ctx context.Context, appleID, password, host, clientID string, pendingStore *appleAuthPendingStore, twoFactorMethod string) (appleAuthStartResult, error) {
	frameID, err := randomUUID()
	if err != nil {
		return appleAuthStartResult{}, err
	}
	session := &appleAuthSession{
		Endpoints: appleAuthEndpointsForHost(host),
		AppleID:   appleID,
		ClientID:  firstNonEmpty(clientID, defaultAppleOAuthClientID),
		FrameID:   strings.ToLower(frameID),
	}
	if err := c.authStart(ctx, session); err != nil {
		return appleAuthStartResult{}, err
	}
	if err := c.authFederate(ctx, session); err != nil {
		return appleAuthStartResult{}, err
	}
	needs2FA, err := c.authSRP(ctx, session, password)
	if err != nil {
		return appleAuthStartResult{}, err
	}
	if redirect, ok := session.redirectForAccountCountry(); ok {
		return appleAuthStartResult{}, redirect
	}
	if session.SessionToken == "" {
		return appleAuthStartResult{}, errCode("apple_session_token_missing", "Apple 登录未返回 Session Token，请重新协议登录或检查账号安全状态", true)
	}
	if needs2FA {
		session.TwoFactorMethod = normalizeAppleTwoFactorMethod(twoFactorMethod)
		message := "已触发 Apple 2FA，请在受信任设备允许后输入 6 位验证码"
		if session.TwoFactorMethod == appleTwoFactorMethodPhone {
			_ = c.refreshAuthState(ctx, session)
			if err := c.requestPhoneSecurityCode(ctx, session, nil); err != nil {
				return appleAuthStartResult{}, err
			}
			message = "已向受信任手机号发送短信验证码，请输入 6 位验证码"
		} else if err := c.requestTrustedDeviceCode(ctx, session); err != nil {
			var redirect appleDomainRedirectError
			if errors.As(err, &redirect) {
				return appleAuthStartResult{}, err
			}
			message = "Apple 已要求 2FA；自动触发验证码未确认，请查看受信任设备后输入验证码"
		}
		pending, err := pendingStore.put(session)
		if err != nil {
			return appleAuthStartResult{}, err
		}
		return appleAuthStartResult{
			PendingID: pending.ID,
			Needs2FA:  true,
			Message:   message,
			AppleID:   strings.TrimSpace(appleID),
			ExpiresAt: pending.ExpiresAt,
		}, nil
	}

	icloudSession, err := c.authWithTokenAndValidate(ctx, session)
	if err != nil {
		var redirect appleDomainRedirectError
		if errors.As(err, &redirect) {
			return appleAuthStartResult{}, err
		}
		pending, putErr := pendingStore.put(session)
		if putErr != nil {
			return appleAuthStartResult{}, putErr
		}
		return appleAuthStartResult{
			PendingID: pending.ID,
			Needs2FA:  true,
			Message:   "登录已进入二次验证；如果设备已弹码，请输入验证码继续",
			AppleID:   strings.TrimSpace(appleID),
			ExpiresAt: pending.ExpiresAt,
		}, nil
	}
	return appleAuthStartResult{
		Session:  icloudSession,
		Needs2FA: false,
		Message:  "Apple 协议登录成功，登录态已生成",
		AppleID:  strings.TrimSpace(appleID),
	}, nil
}

func (c *AppleAuthClient) Submit2FA(ctx context.Context, pending appleAuthPending, code string) (ICloudSession, error) {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return ICloudSession{}, errCode("invalid_2fa_code", "2FA 验证码必须是 6 位", false)
	}
	session := pending.Session
	for attempt := 0; attempt < 2; attempt++ {
		icloudSession, err := c.submit2FAWithSession(ctx, session, code)
		if err == nil {
			return icloudSession, nil
		}
		var redirect appleDomainRedirectError
		if !errors.As(err, &redirect) || !session.switchHost(redirect.Host) {
			return ICloudSession{}, err
		}
	}
	return ICloudSession{}, errCode("apple_domain_switch_failed", "Apple 登录域切换后仍未完成 2FA，请重新发起协议登录", true)
}

func (c *AppleAuthClient) SubmitAppleAccountManage2FA(ctx context.Context, pending appleAuthPending, code string, phoneNumber json.RawMessage) (ICloudSession, error) {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return ICloudSession{}, errCode("invalid_2fa_code", "2FA 验证码必须是 6 位", false)
	}
	session := pending.Session
	switch session.TwoFactorMethod {
	case appleTwoFactorMethodPhone:
		if err := c.validatePhoneSecurityCode(ctx, session, code, phoneNumber); err != nil {
			return ICloudSession{}, err
		}
	default:
		if err := c.validateTrustedDeviceCode(ctx, session, code); err != nil {
			return ICloudSession{}, err
		}
	}
	if err := c.trustSession(ctx, session); err != nil && os.Getenv("IPM_DEBUG_APPLE_ACCOUNT") == "1" {
		fmt.Fprintf(os.Stderr, "APPLE_ACCOUNT_TRUST_DEBUG status=skipped err=%s\n", err.Error())
	}
	return c.authWithAppleAccountManage(ctx, session)
}

func (c *AppleAuthClient) submit2FAWithSession(ctx context.Context, session *appleAuthSession, code string) (ICloudSession, error) {
	switch session.TwoFactorMethod {
	case appleTwoFactorMethodPhone:
		if err := c.validatePhoneSecurityCode(ctx, session, code, nil); err != nil {
			return ICloudSession{}, err
		}
	default:
		if err := c.validateTrustedDeviceCode(ctx, session, code); err != nil {
			return ICloudSession{}, err
		}
	}
	if err := c.trustSession(ctx, session); err != nil {
		return ICloudSession{}, err
	}
	return c.authWithTokenAndValidate(ctx, session)
}
