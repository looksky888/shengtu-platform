package service

import (
	"testing"
	"time"
)

func newTestRegistrationQuotaService(t *testing.T, dir string, cfg RegistrationQuotaConfig) *RegistrationQuotaService {
	t.Helper()
	if cfg.DeviceSecret == "" {
		cfg.DeviceSecret = "test-secret"
	}
	service, err := NewRegistrationQuotaService(dir, nil, cfg)
	if err != nil {
		t.Fatalf("NewRegistrationQuotaService() error = %v", err)
	}
	return service
}

func riskInput(ip, device, email string) RegistrationRiskInput {
	return RegistrationRiskInput{ClientIP: ip, DeviceID: device, Email: email}
}

func TestRegistrationRiskReleaseKeepsAttempt(t *testing.T) {
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{})
	input := riskInput("203.0.113.20", "dev-release", "user@example.com")
	reserveID, err := q.Reserve(input)
	if err != nil {
		t.Fatal(err)
	}
	q.Release(reserveID)
	q.mu.Lock()
	events, attempts := len(q.state.Events), len(q.state.Attempts)
	q.mu.Unlock()
	if events != 0 || attempts != 1 {
		t.Fatalf("events=%d attempts=%d, want 0/1", events, attempts)
	}
	if _, err := q.Reserve(input); riskErrorCode(err) != "pair_attempts" {
		t.Fatalf("second attempt error=%v, want pair_attempts", err)
	}
}

func TestDeviceTokenSignVerify(t *testing.T) {
	dir := t.TempDir()
	q := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{DeviceSecret: "s3cret"})
	id := IssueDeviceID()
	token := q.SignDeviceID(id)
	got, ok := q.VerifyDeviceToken(token)
	if !ok || got != id {
		t.Fatalf("verify failed got=%q ok=%v", got, ok)
	}
	if _, ok := q.VerifyDeviceToken(id); ok {
		t.Fatal("bare id must not verify")
	}
	if _, ok := q.VerifyDeviceToken(token + "x"); ok {
		t.Fatal("tampered token must not verify")
	}
}

func TestDeviceTokenRotationPreviousSecret(t *testing.T) {
	dir := t.TempDir()
	old := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{DeviceSecret: "old-secret"})
	id := IssueDeviceID()
	oldToken := old.SignDeviceID(id)
	hard := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{DeviceSecret: "new-secret"})
	if _, ok := hard.VerifyDeviceToken(oldToken); ok {
		t.Fatal("hard rotation must reject old cookie")
	}
	soft := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{
		DeviceSecret: "new-secret", DeviceSecretPrevious: "old-secret",
	})
	got, ok, current := soft.VerifyDeviceTokenDetailed(oldToken)
	if !ok || got != id || current || !soft.DeviceTokenNeedsRefresh(oldToken) {
		t.Fatalf("previous secret verify = id=%q ok=%v current=%v", got, ok, current)
	}
	fresh := soft.SignDeviceID(id)
	cut := newTestRegistrationQuotaService(t, dir, RegistrationQuotaConfig{DeviceSecret: "new-secret"})
	if _, ok := cut.VerifyDeviceToken(oldToken); ok {
		t.Fatal("cleared previous secret must reject old cookie")
	}
	if _, ok := cut.VerifyDeviceToken(fresh); !ok {
		t.Fatal("current cookie must verify")
	}
}

func TestNormalizeClientIPv6Prefix(t *testing.T) {
	a := NormalizeClientIP("2001:db8:1:2:3:4:5:6")
	b := NormalizeClientIP("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
	if a != b {
		t.Fatalf("expected same /64 prefix, got %q vs %q", a, b)
	}
	if NormalizeClientIP("192.0.2.1") != "192.0.2.1" {
		t.Fatal("ipv4 normalization failed")
	}
}

func TestRegistrationRiskPrunesState(t *testing.T) {
	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	q := newTestRegistrationQuotaService(t, t.TempDir(), RegistrationQuotaConfig{Now: func() time.Time { return now }})
	q.mu.Lock()
	q.state.Events = []RegistrationQuotaEvent{
		{UserID: "old", CreatedAt: now.AddDate(0, 0, -31).Format(time.RFC3339Nano)},
		{ReserveID: "stale", CreatedAt: now.Add(-time.Hour).Format(time.RFC3339Nano)},
		{UserID: "new", CreatedAt: now.Format(time.RFC3339Nano)},
	}
	q.state.Attempts = []RegistrationAttempt{
		{ID: "old", CreatedAt: now.Add(-25 * time.Hour).Format(time.RFC3339Nano)},
		{ID: "new", CreatedAt: now.Format(time.RFC3339Nano)},
	}
	q.state.Blocks = []RegistrationRiskBlock{
		{ID: "expired", ExpiresAt: now.Add(-time.Minute).Format(time.RFC3339Nano)},
		{ID: "active", ExpiresAt: now.Add(time.Hour).Format(time.RFC3339Nano)},
	}
	removed := q.pruneStateLocked(now)
	counts := []int{len(q.state.Events), len(q.state.Attempts), len(q.state.Blocks)}
	q.mu.Unlock()
	if removed != 4 || counts[0] != 1 || counts[1] != 1 || counts[2] != 1 {
		t.Fatalf("removed=%d counts=%v", removed, counts)
	}
}

func riskErrorCode(err error) string {
	if riskErr, ok := err.(*RegistrationRiskError); ok {
		return riskErr.Code
	}
	return ""
}
