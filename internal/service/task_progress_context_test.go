package service

import (
	"strings"
	"testing"
)

func TestShortTokenHashIsStableAndDoesNotExposeTokenSuffix(t *testing.T) {
	token := "secret-access-token-tail123"
	got := shortTokenHash(token)
	if len(got) != 12 {
		t.Fatalf("shortTokenHash() length = %d, want 12", len(got))
	}
	if got != shortTokenHash(token) {
		t.Fatal("shortTokenHash() is not stable")
	}
	if strings.Contains(got, "tail123") || strings.Contains(got, token) {
		t.Fatalf("shortTokenHash() leaked token material: %q", got)
	}
	if got == shortTokenHash(token+"-other") {
		t.Fatalf("shortTokenHash() collision for test inputs: %q", got)
	}
}
