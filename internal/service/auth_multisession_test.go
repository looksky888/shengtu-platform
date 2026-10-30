package service

import (
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestMultiSessionAllowsUpToFiveDevicesAndEvictsLRU(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.ToSlash(filepath.Join(dir, "auth.db"))
	backend, err := storage.NewDatabaseBackend("sqlite:///" + dbPath)
	if err != nil {
		t.Fatalf("NewDatabaseBackend: %v", err)
	}
	defer backend.Close()

	auth := NewAuthService(backend)
	user, firstToken, err := auth.RegisterPasswordUserWithRemember("multi_user", "Password123", "Multi", false)
	if err != nil {
		t.Fatalf("RegisterPasswordUserWithRemember: %v", err)
	}
	tokens := make([]string, 0, 5)
	tokens = append(tokens, firstToken)

	for i := 1; i < MaxSessionsPerAccount; i++ {
		time.Sleep(2 * time.Millisecond)
		_, tok, err := auth.LoginPasswordWithRemember("multi_user", "Password123", i%2 == 0)
		if err != nil {
			t.Fatalf("LoginPassword #%d: %v", i+1, err)
		}
		tokens = append(tokens, tok)
	}

	// Touch token[0] so token[1] becomes the least-recently-used active session.
	time.Sleep(2 * time.Millisecond)
	firstIdentity := auth.Authenticate(tokens[0])
	if firstIdentity == nil || firstIdentity.RememberMe != false {
		t.Fatalf("Authenticate(tokens[0]) = %#v, want non-nil with RememberMe=false", firstIdentity)
	}
	for i := 1; i < len(tokens); i++ {
		ident := auth.Authenticate(tokens[i])
		if ident == nil {
			t.Fatalf("expected session #%d to remain active within 5-device limit", i+1)
		}
		wantRemember := i%2 == 0
		if ident.RememberMe != wantRemember {
			t.Fatalf("session #%d RememberMe = %v, want %v", i+1, ident.RememberMe, wantRemember)
		}
	}

	// Make token[1] strictly older than tokens[0,2,3,4] and log in a 6th device.
	auth.mu.Lock()
	for idx := range auth.items {
		if auth.items[idx].ID == firstIdentity.CredentialID {
			auth.items[idx].LastUsedAt = "2099-01-01T00:00:00Z"
		}
	}
	auth.mu.Unlock()
	// Ensure tokens[2..4] also have recent LastUsedAt while tokens[1] has oldest.
	ident1 := auth.Authenticate(tokens[1])
	if ident1 == nil {
		t.Fatal("expected tokens[1] to authenticate before 6th login")
	}
	auth.mu.Lock()
	for idx := range auth.items {
		if auth.items[idx].ID == ident1.CredentialID {
			auth.items[idx].LastUsedAt = "2000-01-01T00:00:00Z"
		}
	}
	auth.mu.Unlock()

	_, sixthToken, err := auth.LoginPasswordWithRemember("multi_user", "Password123", true)
	if err != nil {
		t.Fatalf("6th LoginPassword: %v", err)
	}
	if auth.Authenticate(tokens[1]) != nil {
		t.Fatal("expected LRU session tokens[1] to be evicted on 6th login")
	}
	if auth.Authenticate(tokens[0]) == nil {
		t.Fatal("expected recently-used tokens[0] to remain active")
	}
	sixthIdentity := auth.Authenticate(sixthToken)
	if sixthIdentity == nil || !sixthIdentity.RememberMe {
		t.Fatalf("Authenticate(sixthToken) = %#v, want RememberMe=true", sixthIdentity)
	}

	// Changing password from sixthIdentity keeps sixthToken active while revoking other sessions.
	if err := auth.ChangeProfilePassword(*sixthIdentity, "Password123", "NewPassword456"); err != nil {
		t.Fatalf("ChangeProfilePassword: %v", err)
	}
	if auth.Authenticate(sixthToken) == nil {
		t.Fatal("expected caller session sixthToken to stay active after ChangeProfilePassword")
	}
	if auth.Authenticate(tokens[0]) != nil || auth.Authenticate(tokens[2]) != nil {
		t.Fatal("expected other device sessions to be revoked after ChangeProfilePassword")
	}
	if user.ID != sixthIdentity.ID {
		t.Fatalf("identity ID mismatch: %s vs %s", user.ID, sixthIdentity.ID)
	}
}
