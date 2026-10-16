package service

import (
	"testing"
)

func TestImageFailureDoesNotCooldownAccountSelection(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.mu.Lock()
	accounts.items = accountsFromMaps([]map[string]any{
		{"access_token": "token-a", "quota": 1, "type": "Free"},
		{"access_token": "token-b", "quota": 1, "type": "Free"},
	})
	accounts.mu.Unlock()

	accounts.MarkImageResult("token-a", false)
	reservation, err := accounts.reserveNextCandidateToken(nil, nil)
	if err != nil {
		t.Fatalf("reserve token: %v", err)
	}
	if reservation.token != "token-a" {
		t.Fatalf("reserved token = %q, want token-a", reservation.token)
	}
	accounts.MarkImageResult(reservation.token, false)
}

func TestImageChallengeCooldownSkipsAccountSelection(t *testing.T) {
	accounts := newTestAccountService(t)
	accounts.mu.Lock()
	accounts.items = accountsFromMaps([]map[string]any{
		{"access_token": "token-a", "quota": 1, "type": "Free"},
		{"access_token": "token-b", "quota": 1, "type": "Free"},
	})
	accounts.mu.Unlock()

	cooldown := accounts.MarkImageChallenge("token-a")
	if cooldown.Duration != defaultImageChallengeCooldown {
		t.Fatalf("challenge cooldown duration = %s, want %s", cooldown.Duration, defaultImageChallengeCooldown)
	}
	reservation, err := accounts.reserveNextCandidateToken(nil, nil)
	if err != nil {
		t.Fatalf("reserve token: %v", err)
	}
	if reservation.token != "token-b" {
		t.Fatalf("reserved token = %q, want token-b", reservation.token)
	}
	accounts.MarkImageResult(reservation.token, false)
}
