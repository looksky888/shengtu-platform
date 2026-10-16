package service

import (
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestManagedUserCleanupFilterOR(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	auth := NewAuthService(backend)

	// fresh: active today, credit will be high
	fresh, err := auth.CreatePasswordUser("fresh_user", "Password123", "Fresh", "", true)
	if err != nil {
		t.Fatal(err)
	}
	freshID := fresh.ID

	// idle: last login long ago
	idle, err := auth.CreatePasswordUser("idle_user", "Password123", "Idle", "", true)
	if err != nil {
		t.Fatal(err)
	}
	idleID := idle.ID
	// Force old last login via UpdateUser path if available — set via password accounts raw.
	auth.mu.Lock()
	for i := range auth.accounts {
		if auth.accounts[i].ID == idleID {
			auth.accounts[i].LastLoginAt = time.Now().AddDate(0, 0, -20).Format("2006-01-02 15:04:05")
		}
		if auth.accounts[i].ID == freshID {
			auth.accounts[i].LastLoginAt = time.Now().Format("2006-01-02 15:04:05")
		}
	}
	_ = auth.savePasswordAccountsLocked()
	auth.mu.Unlock()

	// zero-credit user who is still active
	zero, err := auth.CreatePasswordUser("zero_user", "Password123", "Zero", "", true)
	if err != nil {
		t.Fatal(err)
	}
	zeroID := zero.ID
	auth.mu.Lock()
	for i := range auth.accounts {
		if auth.accounts[i].ID == zeroID {
			auth.accounts[i].LastLoginAt = time.Now().Format("2006-01-02 15:04:05")
		}
	}
	_ = auth.savePasswordAccountsLocked()
	auth.mu.Unlock()

	zeroBal := 0
	query := AdminListQuery{
		Page:            1,
		PageSize:        50,
		InactiveDaysMin: 15,
		CreditMax:       &zeroBal,
		CleanupMatchAny: true, // OR
	}
	// Exclude set: balances strictly above credit_max (0) — not a full BalanceIndex.
	creditAbove := CreditAboveMaxSet(map[string]int{
		freshID: 100,
		idleID:  50,
		zeroID:  0,
	}, zeroBal)
	page, err := auth.QueryManagedUsersPage(query, creditAbove)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, item := range page.Items {
		got[item.ID] = true
	}
	if !got[idleID] {
		t.Fatalf("idle user should match inactive>=15: %#v", page.Items)
	}
	if !got[zeroID] {
		t.Fatalf("zero credit active user should match credit<=0: %#v", page.Items)
	}
	if got[freshID] {
		t.Fatalf("fresh high-credit user must not match OR cleanup: %#v", page.Items)
	}
	// inactive_days attached
	for _, item := range page.Items {
		if item.ID == idleID && item.InactiveDays < 15 {
			t.Fatalf("idle inactive_days=%d", item.InactiveDays)
		}
	}
}

func TestIDsWithBalanceAboveMatchesCreditMaxFilter(t *testing.T) {
	dir := t.TempDir()
	credits := NewCreditService(dir, nil)
	if _, _, err := credits.Add("u-high", 10, CreditReasonSignup, "s1"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := credits.Add("u-zero", 1, CreditReasonSignup, "s2"); err != nil {
		t.Fatal(err)
	}
	// Drain zero user to 0.
	if _, _, err := credits.Adjust("u-zero", -1, CreditReasonAdminManualAdjust, "adj"); err != nil {
		t.Fatal(err)
	}
	above := credits.IDsWithBalanceAbove(0)
	if _, ok := above["u-high"]; !ok {
		t.Fatalf("u-high should be above 0: %#v", above)
	}
	if _, ok := above["u-zero"]; ok {
		t.Fatalf("u-zero at 0 must not be above 0: %#v", above)
	}
	if _, ok := above["u-missing"]; ok {
		t.Fatal("missing users are not listed (balance 0)")
	}
	// Adapter from full map matches service output for present rows.
	idx := credits.BalanceIndex()
	fromMap := CreditAboveMaxSet(idx, 0)
	if len(fromMap) != len(above) {
		t.Fatalf("CreditAboveMaxSet size %d vs IDsWithBalanceAbove %d", len(fromMap), len(above))
	}
	for id := range above {
		if _, ok := fromMap[id]; !ok {
			t.Fatalf("missing %s in map adapter", id)
		}
	}
}

func TestIsProtectedManagedUserAdmin(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	auth := NewAuthService(backend)
	_ = auth // ensure admin bootstrap
	// CreatePasswordUser creates role user; protect username admin via role
	u, err := auth.CreatePasswordUser("normal", "Password123", "N", "", true)
	if err != nil {
		t.Fatal(err)
	}
	if auth.IsProtectedManagedUser(u.ID) {
		t.Fatal("normal user should not be protected")
	}
}
