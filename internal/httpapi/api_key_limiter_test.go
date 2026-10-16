package httpapi

import (
	"testing"
	"time"

	"chatgpt2api/internal/service"
)

func testAPIKeyIdentity(id string) service.Identity {
	return service.Identity{ID: id, CredentialID: id, Kind: service.AuthKindAPIKey, Role: service.AuthRoleUser}
}

func TestAPIKeyLimiterIsolatesKeysAndReleasesConcurrency(t *testing.T) {
	limiter := newAPIKeyLimiter(nil, nil)
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	release, status, message := limiter.acquire(testAPIKeyIdentity("key-a"), 2, 1, 0, now)
	if status != 0 || release == nil || message != "" {
		t.Fatalf("first acquire = status %d release=%v message=%q", status, release != nil, message)
	}
	if _, status, _ := limiter.acquire(testAPIKeyIdentity("key-a"), 2, 1, 0, now); status != 429 {
		t.Fatalf("same key should hit concurrency limit, status=%d", status)
	}
	if _, status, _ := limiter.acquire(testAPIKeyIdentity("key-b"), 2, 1, 0, now); status != 0 {
		t.Fatalf("different key should be isolated, status=%d", status)
	}
	release()
	if _, status, _ := limiter.acquire(testAPIKeyIdentity("key-a"), 2, 1, 0, now); status != 0 {
		t.Fatalf("released slot should be reusable, status=%d", status)
	}
}

func TestAPIKeyLimiterEnforcesRPMAndDailyRequestLimit(t *testing.T) {
	limiter := newAPIKeyLimiter(nil, nil)
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	identity := testAPIKeyIdentity("key-rpm")
	for i := 0; i < 2; i++ {
		release, status, _ := limiter.acquire(identity, 2, 0, 2, now)
		if status != 0 {
			t.Fatalf("acquire %d status=%d", i, status)
		}
		release()
	}
	if _, status, _ := limiter.acquire(identity, 2, 0, 2, now); status != 429 {
		t.Fatalf("expected daily limit status=429, got %d", status)
	}
	// The daily window is based on China time and resets on the next day.
	nextDay := now.Add(24 * time.Hour)
	if release, status, _ := limiter.acquire(identity, 2, 0, 2, nextDay); status != 0 {
		t.Fatalf("next day should reset daily usage, status=%d", status)
	} else {
		release()
	}
}

func TestAPIKeyLimiterSkipsSessionsAndAdmins(t *testing.T) {
	limiter := newAPIKeyLimiter(nil, nil)
	now := time.Now()
	for _, identity := range []service.Identity{
		{ID: "session", CredentialID: "session", Kind: service.AuthKindSession, Role: service.AuthRoleUser},
		{ID: "admin", CredentialID: "admin", Kind: service.AuthKindAPIKey, Role: service.AuthRoleAdmin},
	} {
		if release, status, message := limiter.acquire(identity, 1, 1, 1, now); status != 0 || release == nil || message != "" {
			t.Fatalf("identity %#v unexpectedly limited: status=%d message=%q", identity, status, message)
		}
	}
}
