package app

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ICloudClient struct {
	client *http.Client
}

type ICloudRemoteMailbox struct {
	AnonymousID    string
	Email          string
	Label          string
	Note           string
	ForwardToEmail string
	IsActive       bool
	Origin         string
}

type ICloudSyncedMessage struct {
	RemoteID   string
	UID        string
	Subject    string
	From       string
	Body       string
	ReceivedAt time.Time
}

type ICloudMailCleanupResult struct {
	MovedToTrash int `json:"moved_to_trash"`
	Destroyed    int `json:"destroyed"`
	Skipped      int `json:"skipped"`
}

func NewICloudClient() *ICloudClient {
	return &ICloudClient{client: &http.Client{Timeout: 30 * time.Second}}
}

const mailboxSyncCursorOverlap = 2 * time.Minute
const appleAccountManageRefreshSkew = 0 * time.Second
const appleAccountKeepAliveDefaultInterval = 4 * time.Minute
const appleAccountKeepAliveTimeout = 25 * time.Second

var appleAccountManageBaseURL = "https://appleid.apple.com"
var appleAccountOperationMu sync.Mutex
var appleAccountOperationGates = make(map[string]chan struct{})

const (
	appleAccountManageOrigin     = "https://account.apple.com"
	appleAccountManageUserAgent  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
	appleAccountManageRequestCtx = "ca"
	appleAccountManageLanguage   = "zh"
	appleAccountManageTimeZone   = "Asia/Shanghai"
	appleAccountManageGMTOffset  = "GMT+08:00"
	appleAccountManagePlatform   = `"macOS"`
	appleAccountManageTZOffset   = 8 * 60 * 60
)

const appleAccountHTTPStatusSessionTimeout = 419

func appleAccountManageHostForICloudHost(host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if strings.Contains(host, "appleid.apple.com.cn") {
		return "appleid.apple.com.cn"
	}
	return "appleid.apple.com"
}

func appleAccountManageOriginForHost(host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if strings.Contains(host, "account.apple.com.cn") || strings.Contains(host, "appleid.apple.com.cn") {
		return "https://account.apple.com.cn"
	}
	return appleAccountManageOrigin
}

func appleAccountManageBaseForState(state LoginState) string {
	baseURL := strings.TrimSpace(appleAccountManageBaseURL)
	if baseURL == "" {
		baseURL = "https://appleid.apple.com"
	}
	if strings.TrimRight(baseURL, "/") != "https://appleid.apple.com" {
		return baseURL
	}
	host := strings.TrimSpace(state.Host)
	if host == "" {
		return baseURL
	}
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	host = strings.Trim(host, "/")
	if host == "" {
		return baseURL
	}
	return "https://" + host
}

func appleAccountPortalBaseForState(state LoginState) string {
	baseURL := strings.TrimSpace(appleAccountManageBaseURL)
	if baseURL != "" && strings.TrimRight(baseURL, "/") != "https://appleid.apple.com" {
		return baseURL
	}
	return strings.TrimRight(firstNonEmpty(state.Origin, appleAccountManageOriginForHost(state.Host), appleAccountManageOrigin), "/")
}

func appleAccountStateHasSavedMaterial(state LoginState) bool {
	return strings.TrimSpace(state.Scnt) != "" ||
		strings.TrimSpace(state.APIKey) != "" ||
		len(state.Cookies) > 0
}

func appleAccountLoginState(session ICloudSession) (LoginState, bool) {
	for _, state := range session.LoginStates {
		if state.Kind != LoginStateAppleAccount {
			continue
		}
		if !appleAccountStateHasSavedMaterial(state) {
			continue
		}
		return state, true
	}
	return LoginState{}, false
}

func appleAccountManageReady(session ICloudSession) bool {
	state, ok := appleAccountLoginState(session)
	return ok && strings.TrimSpace(state.APIKey) != ""
}

func appleAccountManageNeedsCreateRefresh(loginState LoginState, now time.Time) bool {
	return !appleAccountManageRecentStateUsable(loginState, now)
}

func appleAccountManageRecentStateUsable(loginState LoginState, now time.Time) bool {
	if strings.TrimSpace(loginState.Scnt) == "" && len(loginState.Cookies) == 0 {
		return false
	}
	if strings.TrimSpace(loginState.APIKey) == "" {
		return false
	}
	if loginState.LastCheckedAt.IsZero() {
		return false
	}
	if loginState.ManageExpiresAt.IsZero() {
		return false
	}
	return now.Before(loginState.ManageExpiresAt.Add(-appleAccountManageRefreshSkew))
}

func appleAccountManageRecentlyOK(loginState LoginState, now time.Time) bool {
	return loginState.LastCheckOK && appleAccountManageRecentStateUsable(loginState, now)
}

func markAppleAccountManageOK(loginState *LoginState) {
	if loginState == nil {
		return
	}
	loginState.LastCheckedAt = time.Now()
	loginState.LastCheckOK = true
	loginState.LastStatusMessage = "新接口登录态正常"
}

func markAppleAccountManageTokenTTL(loginState *LoginState, timeoutMinutes int, now time.Time) {
	if loginState == nil || timeoutMinutes <= 0 {
		return
	}
	loginState.ManageExpiresAt = now.Add(time.Duration(timeoutMinutes) * time.Minute)
}

func (c *ICloudClient) CheckAppleAccountManageSession(ctx context.Context, session ICloudSession) (ICloudSession, error) {
	loginState, ok := appleAccountLoginState(session)
	if !ok {
		return session, errCode("apple_account_session_missing", "未保存新接口登录态，请先完成新接口登录", true)
	}
	now := time.Now()
	if appleAccountManageRecentlyOK(loginState, now) && !appleAccountKeepAliveDue(loginState, now, appleAccountKeepAliveDefaultInterval) {
		return withAppleAccountLoginState(session, loginState), nil
	}
	release, err := acquireAppleAccountOperationGate(ctx, appleAccountOperationKey(session, loginState))
	if err != nil {
		return session, err
	}
	defer release()
	kept, err := c.keepAliveAppleAccountManageStateUnlocked(ctx, loginState)
	if err != nil {
		return session, err
	}
	return withAppleAccountLoginState(session, kept), nil
}

func withAppleAccountLoginState(session ICloudSession, next LoginState) ICloudSession {
	next.Kind = LoginStateAppleAccount
	for i, state := range session.LoginStates {
		if state.Kind == LoginStateAppleAccount {
			session.LoginStates[i] = next
			return session
		}
	}
	session.LoginStates = append(session.LoginStates, next)
	return session
}
