package util

import (
	"encoding/hex"
	"strings"
	"testing"
)

func TestSecureRandomIdentifiersHaveExpectedShape(t *testing.T) {
	uuid := NewUUID()
	if len(uuid) != 36 || uuid[14] != '4' || !strings.Contains("89ab", strings.ToLower(uuid[19:20])) {
		t.Fatalf("NewUUID() = %q, want RFC 4122 v4 shape", uuid)
	}
	hexValue := NewHex(31)
	if len(hexValue) != 31 {
		t.Fatalf("NewHex(31) length = %d", len(hexValue))
	}
	if _, err := hex.DecodeString(hexValue + "0"); err != nil {
		t.Fatalf("NewHex(31) returned non-hex value %q: %v", hexValue, err)
	}
	if token := RandomTokenURL(24); len(token) != 32 {
		t.Fatalf("RandomTokenURL(24) length = %d, want 32", len(token))
	}
}
