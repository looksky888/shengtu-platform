package app

import (
	"errors"
	"testing"
	"time"
)

func TestPublicSessionMarksExpiredICloudWebCookie(t *testing.T) {
	now := time.Now()
	session := ICloudSession{
		IsICloudPlus: true,
		CanCreateHME: true,
		Cookies: []SessionCookie{{
			Name:    "X-APPLE-WEBAUTH-USER",
			Value:   "saved-but-expired",
			Domain:  ".icloud.com.cn",
			Path:    "/",
			Expires: float64(now.Add(-time.Hour).Unix()),
		}},
		LoginStates: []LoginState{{
			Kind:          LoginStateICloudWeb,
			LastCheckedAt: now.Add(-24 * time.Hour),
			LastCheckOK:   true,
		}},
	}

	got := publicSession(&session)
	if got.ICloudWebLoginState != loginChannelExpired {
		t.Fatalf("ICloudWebLoginState = %q, want %q", got.ICloudWebLoginState, loginChannelExpired)
	}
	if got.ICloudWebLoginOK {
		t.Fatal("ICloudWebLoginOK = true for an expired critical cookie")
	}
	if got.ProviderConfigured {
		t.Fatal("ProviderConfigured = true for an expired critical cookie")
	}
}

func TestValidateICloudWebRequestCookiesRejectsExpiredCriticalCookie(t *testing.T) {
	now := time.Now()
	session := ICloudSession{Cookies: []SessionCookie{{
		Name:    "X-APPLE-WEBAUTH-USER",
		Value:   "saved-but-expired",
		Domain:  ".icloud.com.cn",
		Path:    "/",
		Expires: float64(now.Add(-time.Minute).Unix()),
	}}}

	err := validateICloudWebRequestCookies(session, "https://p211-maildomainws.icloud.com.cn/v2/hme/list", now)
	var coded codedError
	if !errors.As(err, &coded) {
		t.Fatalf("error type = %T, want codedError", err)
	}
	if coded.code != "icloud_web_login_expired" {
		t.Fatalf("error code = %q, want icloud_web_login_expired", coded.code)
	}
}

func TestValidateICloudWebRequestCookiesAcceptsUsableCriticalCookie(t *testing.T) {
	now := time.Now()
	session := ICloudSession{Cookies: []SessionCookie{{
		Name:    "X-APPLE-WEBAUTH-USER",
		Value:   "current",
		Domain:  ".icloud.com.cn",
		Path:    "/",
		Expires: float64(now.Add(time.Hour).Unix()),
	}}}

	if err := validateICloudWebRequestCookies(session, "https://p211-maildomainws.icloud.com.cn/v2/hme/list", now); err != nil {
		t.Fatalf("validateICloudWebRequestCookies() error = %v", err)
	}
}
