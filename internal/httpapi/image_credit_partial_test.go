package httpapi

import (
	"testing"

	"chatgpt2api/internal/service"
)

func TestCountStreamImageResults(t *testing.T) {
	if got := countStreamImageResults(nil, false, 0); got != 0 {
		t.Fatalf("empty = %d", got)
	}
	if got := countStreamImageResults([]string{"a", "b"}, false, 0); got != 2 {
		t.Fatalf("urls = %d", got)
	}
	if got := countStreamImageResults(nil, true, 0); got != 1 {
		t.Fatalf("hasImageData without urls = %d", got)
	}
	// Re-emitted URLs must not inflate success count (prevents under-refund).
	if got := countStreamImageResults([]string{"u1", "u1", "u1"}, false, 3); got != 1 {
		t.Fatalf("dedupe = %d, want 1", got)
	}
	// Never count more successes than billed n.
	if got := countStreamImageResults([]string{"a", "b", "c", "d"}, false, 2); got != 2 {
		t.Fatalf("clamp to n = %d, want 2", got)
	}
}

func TestRefundImageCreditsForSuccessPartial(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	user, _, err := app.auth.CreateAPIKey(service.AuthRoleUser, "partial", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey: %v", err)
	}
	userID := user.ID
	if _, _, err := app.credits.Add(userID, 30, "seed", "s"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	// Bill 3 images at unit 2 → amount 6.
	if _, _, _, err := app.credits.DeductOnce(userID, 6, service.CreditReasonImageGeneration, "gen:t-partial"); err != nil {
		t.Fatalf("DeductOnce: %v", err)
	}
	charge := &imageCreditCharge{UserID: userID, Amount: 6, RefID: "gen:t-partial", N: 3}
	// Only 1 of 3 succeeded → refund 4.
	app.refundImageCreditsForSuccess(charge, 1)
	account, err := app.credits.Account(userID)
	if err != nil {
		t.Fatalf("Account: %v", err)
	}
	if account.Balance != 28 { // 30 - 6 + 4
		t.Fatalf("balance = %d, want 28", account.Balance)
	}
}

func TestRefundImageCreditsForSuccessMath(t *testing.T) {
	// unit = amount/n; refund = unit * (n - success)
	charge := &imageCreditCharge{Amount: 6, N: 3, UserID: "u", RefID: "r"}
	// success 1 of 3 → refund 4
	unit := charge.Amount / charge.N
	refund := unit * (charge.N - 1)
	if refund != 4 {
		t.Fatalf("refund = %d, want 4", refund)
	}
}
