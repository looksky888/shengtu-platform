package app

import (
	"testing"
	"time"
)

func TestLatestMailboxCodeMatchesPlatformKeywordInSender(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	messages := []Message{{
		ID:         "higgsfield-code",
		Subject:    "923530 is your verification code",
		From:       "Higgsfield AI <no-reply@higgsfield.ai>",
		Body:       "Enter the following verification code when prompted: 923530",
		ReceivedAt: now.Add(-time.Minute),
		CreatedAt:  now.Add(-time.Minute),
	}}

	message, code, ok := latestMailboxCode(messages, now.Add(-5*time.Minute), "provider:higgsfield", now)
	if !ok || code != "923530" || message.ID != "higgsfield-code" {
		t.Fatalf("latestMailboxCode() = message %q code %q ok %v", message.ID, code, ok)
	}
}

func TestLatestMailboxCodeRejectsDifferentExplicitPlatform(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	messages := []Message{{
		ID:         "higgsfield-code",
		Subject:    "923530 is your verification code",
		From:       "Higgsfield AI <no-reply@higgsfield.ai>",
		Body:       "Enter the following verification code when prompted: 923530",
		ReceivedAt: now.Add(-time.Minute),
		CreatedAt:  now.Add(-time.Minute),
	}}

	if message, code, ok := latestMailboxCode(messages, now.Add(-5*time.Minute), "provider:openai", now); ok {
		t.Fatalf("latestMailboxCode() unexpectedly matched message %q code %q", message.ID, code)
	}
}

func TestLatestMailboxCodeMatchesOpenAIProvider(t *testing.T) {
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)
	messages := []Message{{
		ID:         "openai-code",
		Subject:    "Your verification code is 481726",
		From:       "OpenAI <noreply@tm.openai.com>",
		Body:       "Use verification code 481726 to continue.",
		ReceivedAt: now.Add(-time.Minute),
		CreatedAt:  now.Add(-time.Minute),
	}}

	message, code, ok := latestMailboxCode(messages, now.Add(-5*time.Minute), "provider:openai", now)
	if !ok || code != "481726" || message.ID != "openai-code" {
		t.Fatalf("latestMailboxCode() = message %q code %q ok %v", message.ID, code, ok)
	}
}

func TestExtractOTPSupportsHiggsfieldSubject(t *testing.T) {
	if code := extractOTP("923530 is your verification code"); code != "923530" {
		t.Fatalf("extractOTP() = %q, want 923530", code)
	}
}
