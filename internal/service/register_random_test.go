package service

import (
	"strings"
	"testing"
)

func TestRegisterRandomPasswordMeetsRequiredClasses(t *testing.T) {
	password := registerRandomPassword(16)
	if len(password) != 16 {
		t.Fatalf("password length = %d, want 16", len(password))
	}
	for name, chars := range map[string]string{
		"uppercase": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
		"lowercase": "abcdefghijklmnopqrstuvwxyz",
		"digit":     "0123456789",
		"special":   "!@#$%",
	} {
		if !strings.ContainsAny(password, chars) {
			t.Errorf("password %q missing %s", password, name)
		}
	}
}

func TestGenerateRegisterPKCEReturnsVerifierAndChallenge(t *testing.T) {
	verifier, challenge := generateRegisterPKCE()
	if len(verifier) != 86 || len(challenge) != 43 {
		t.Fatalf("PKCE lengths = (%d, %d), want (86, 43)", len(verifier), len(challenge))
	}
}
