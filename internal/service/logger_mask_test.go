package service

import (
	"strings"
	"testing"
)

// TestMaskStringNeverReturnsShortSecrets is the regression pin for the leak where
// maskString(value, 10) returned values of 10 characters or fewer verbatim, so a
// short password/token landed in the log store in clear text.
func TestMaskStringNeverReturnsShortSecrets(t *testing.T) {
	for _, secret := range []string{"a", "abc123", "1234567890", "p@ssw0rd!"} {
		if got := maskString(secret, 10); strings.Contains(got, secret) {
			t.Fatalf("maskString(%q, 10) = %q still contains the secret", secret, got)
		}
	}
	if got := maskString("abc123", 10); got != "***(6)" {
		t.Fatalf("maskString(short) = %q, want a length-only placeholder", got)
	}
	if got := maskString("", 10); got != "" {
		t.Fatalf("maskString(\"\") = %q, want empty", got)
	}
}

func TestMaskStringKeepsLongSecretsIdentifiableOnly(t *testing.T) {
	const secret = "sk-abcdefghijklmnopqrstuvwxyz0123456789"
	got := maskString(secret, 10)
	if strings.Contains(got, secret) {
		t.Fatalf("maskString leaked the whole secret: %q", got)
	}
	// Long values keep the project's historical prefix + "..." contract.
	if got != secret[:10]+"..." {
		t.Fatalf("maskString(long) = %q, want the 10-char prefix followed by ...", got)
	}
	// Values that are long enough to keep a prefix but short enough that it would
	// expose most of the credential are masked completely instead.
	if got := maskString("abcdefghijkl", 10); got != "***(12)" {
		t.Fatalf("maskString(12 chars, keep=10) = %q, want full masking", got)
	}
}

func TestSanitizeLogFieldMasksCredentials(t *testing.T) {
	for _, key := range []string{"password", "Authorization", "api_key", "access_token", "refresh_token", "private_key_pem", "phone", "mobile"} {
		if got := sanitizeLogField(key, "hunter2"); strings.Contains(got.(string), "hunter2") {
			t.Fatalf("sanitizeLogField(%q) leaked the value: %#v", key, got)
		}
	}
	// Non-secret fields must survive untouched.
	if got := sanitizeLogField("model", "gpt-image-2"); got != "gpt-image-2" {
		t.Fatalf("sanitizeLogField(model) = %#v, want the original value", got)
	}
}

func TestSanitizeLogFieldMasksEmailLocalPartOnly(t *testing.T) {
	got := sanitizeLogField("email", "alice@example.com")
	if got != "a***@example.com" {
		t.Fatalf("sanitizeLogField(email) = %#v, want the local part masked and the domain kept", got)
	}
	if got := sanitizeLogField("owner_email", "bob@mail.test"); got != "b***@mail.test" {
		t.Fatalf("sanitizeLogField(owner_email) = %#v", got)
	}
	// A non-address value under an email key still gets masked, never echoed.
	if got := sanitizeLogField("email", "plainvalue"); strings.Contains(got.(string), "plainvalue") {
		t.Fatalf("sanitizeLogField(email, non-address) leaked: %#v", got)
	}
}
