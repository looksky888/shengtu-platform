package service

import (
	"testing"

	"chatgpt2api/internal/util"
)

// TestRegisterSnapshotHidesProviderAndClearanceSecrets pins the read/write
// contract for register credentials: the API never returns them, and saving the
// redacted view back (what the settings UI does) must not wipe them.
func TestRegisterSnapshotHidesProviderAndClearanceSecrets(t *testing.T) {
	dir := t.TempDir()
	svc := NewRegisterService(dir, nil)

	if _, err := svc.Update(map[string]any{
		"mail": map[string]any{
			"providers": []map[string]any{{
				"type":           "cloudflare_temp_email",
				"enable":         true,
				"api_key":        "cf-secret-key",
				"admin_password": "cf-admin-pass",
				"domain":         "mail.example.test",
			}},
		},
		"clearance": map[string]any{
			"enabled":      true,
			"mode":         "manual",
			"user_agent":   "UA/1.0",
			"cf_clearance": "clearance-cookie-value",
			"cf_cookies":   "cf_clearance=abc; other=1",
		},
	}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	// 1. No credential may appear in the API-facing snapshot.
	public := svc.GetTyped()
	if len(public.Mail.Providers) != 1 {
		t.Fatalf("providers = %#v", public.Mail.Providers)
	}
	provider := public.Mail.Providers[0]
	if util.Clean(provider["api_key"]) != "" || util.Clean(provider["admin_password"]) != "" {
		t.Fatalf("snapshot leaked provider credentials: %#v", provider)
	}
	if provider["api_key"+registerSecretMarkerSuffix] != true {
		t.Fatalf("snapshot dropped the api_key marker: %#v", provider)
	}
	if public.Clearance.CFClearance != "" || public.Clearance.CFCookies != "" {
		t.Fatalf("snapshot leaked clearance credentials: %#v", public.Clearance)
	}
	if !public.Clearance.CFCredentialsConfigured {
		t.Fatal("snapshot must report that clearance credentials are stored")
	}
	if public.Clearance.UserAgent != "UA/1.0" || public.Clearance.Mode != "manual" {
		t.Fatalf("redaction damaged non-secret clearance fields: %#v", public.Clearance)
	}

	// 2. Saving the redacted view back keeps every stored secret.
	roundTrip := map[string]any{
		"mail": map[string]any{
			"request_timeout": public.Mail.RequestTimeout,
			"wait_timeout":    public.Mail.WaitTimeout,
			"wait_interval":   public.Mail.WaitInterval,
			"user_agent":      public.Mail.UserAgent,
			"providers":       []map[string]any{util.CopyMap(provider)},
		},
		"clearance": map[string]any{
			"enabled":                   public.Clearance.Enabled,
			"mode":                      public.Clearance.Mode,
			"user_agent":                public.Clearance.UserAgent,
			"cf_clearance":              public.Clearance.CFClearance,
			"cf_cookies":                public.Clearance.CFCookies,
			"cf_credentials_configured": public.Clearance.CFCredentialsConfigured,
		},
	}
	if _, err := svc.Update(roundTrip); err != nil {
		t.Fatalf("round-trip Update() error = %v", err)
	}
	stored := readStoredRegisterConfig(svc)
	storedProvider := util.AsMapSlice(util.StringMap(stored["mail"])["providers"])[0]
	if util.Clean(storedProvider["api_key"]) != "cf-secret-key" {
		t.Fatalf("round trip wiped api_key: %#v", storedProvider["api_key"])
	}
	if util.Clean(storedProvider["admin_password"]) != "cf-admin-pass" {
		t.Fatalf("round trip wiped admin_password: %#v", storedProvider["admin_password"])
	}
	if _, ok := storedProvider["api_key"+registerSecretMarkerSuffix]; ok {
		t.Fatalf("presentation marker must never be persisted: %#v", storedProvider)
	}
	storedClearance := util.StringMap(stored["clearance"])
	if util.Clean(storedClearance["cf_clearance"]) != "clearance-cookie-value" {
		t.Fatalf("round trip wiped cf_clearance: %#v", storedClearance["cf_clearance"])
	}
	if util.Clean(storedClearance["cf_cookies"]) != "cf_clearance=abc; other=1" {
		t.Fatalf("round trip wiped cf_cookies: %#v", storedClearance["cf_cookies"])
	}

	// 3. An explicit new value still replaces the stored one, and a secret the
	//    request omits entirely is preserved.
	if _, err := svc.Update(map[string]any{
		"mail": map[string]any{
			"providers": []map[string]any{{
				"type":    "cloudflare_temp_email",
				"enable":  true,
				"api_key": "rotated-key",
				"domain":  "mail.example.test",
			}},
		},
	}); err != nil {
		t.Fatalf("rotate Update() error = %v", err)
	}
	rotated := util.AsMapSlice(util.StringMap(readStoredRegisterConfig(svc)["mail"])["providers"])[0]
	if util.Clean(rotated["api_key"]) != "rotated-key" {
		t.Fatalf("explicit rotation did not apply: %#v", rotated["api_key"])
	}
	if util.Clean(rotated["admin_password"]) != "cf-admin-pass" {
		t.Fatalf("omitted secret must survive a partial update: %#v", rotated["admin_password"])
	}
}

func readStoredRegisterConfig(svc *RegisterService) map[string]any {
	svc.mu.Lock()
	defer svc.mu.Unlock()
	return svc.config.toMap()
}
