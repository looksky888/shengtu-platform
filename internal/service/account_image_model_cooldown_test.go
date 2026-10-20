package service

import (
	"reflect"
	"testing"
	"time"
)

func TestImageModelUnavailableCooldownPreservesAccountAndReleasesSlot(t *testing.T) {
	s := newTestAccountService(t)
	s.items = accountsFromMaps([]map[string]any{
		{"access_token": "a", "quota": 5, "type": "Free", "status": "正常"},
		{"access_token": "b", "quota": 5, "type": "Free", "status": "正常"},
	})
	reservation, err := s.reserveNextCandidateToken(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	token := reservation.token
	before := s.GetAccount(token)
	start := time.Now()
	cooldown := s.CooldownImageModelUnavailable(token)
	if cooldown.Duration != 10*time.Minute || cooldown.Until.Before(start.Add(10*time.Minute)) {
		t.Fatal("incorrect cooldown")
	}
	if after := s.GetAccount(token); !reflect.DeepEqual(before, after) {
		t.Fatal("cooldown modified persistent account values")
	}
	if s.imageReservations[token] != 0 {
		t.Fatal("reservation not released")
	}
	selected, err := s.reserveNextCandidateToken(nil, nil)
	if err != nil || selected.token == token {
		t.Fatalf("cooled account selected: %v", err)
	}
	s.ReleaseImageReservation(selected.token)
	s.mu.Lock()
	if s.isImageCooldownActiveLocked(token, cooldown.Until) {
		t.Error("cooldown did not expire")
	}
	s.mu.Unlock()
}

func TestOtherInFlightSuccessDoesNotClearModelCooldown(t *testing.T) {
	s := newTestAccountService(t)
	s.AddAccounts([]string{"a"})
	if _, err := s.UpdateAccount("a", map[string]any{"quota": 5, "status": "正常"}); err != nil {
		t.Fatal(err)
	}
	s.CooldownImageModelUnavailable("a")
	s.MarkImageResult("a", true)
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.isImageCooldownActiveLocked("a", time.Now()) {
		t.Fatal("concurrent success cleared model cooldown")
	}
}
