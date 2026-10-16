package httpapi

import (
	"errors"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestDeductImageCreditsBlocksFreeRerun(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	user, _, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bill user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey: %v", err)
	}
	userID := user.ID
	if _, _, err := app.credits.Add(userID, 50, "test", "seed"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	identity := service.Identity{ID: userID, OwnerID: userID, Role: service.AuthRoleUser}
	payload := map[string]any{"client_task_id": "same-task", "n": 1, "image_resolution": "1080p"}
	c1, err := app.deductImageCredits(identity, payload, service.CreditReasonImageGeneration, "/v1/images/generations")
	if err != nil || c1 == nil {
		t.Fatalf("first deduct err=%v charge=%v", err, c1)
	}
	// Second deduct same ref must refuse free re-run.
	if _, err := app.deductImageCredits(identity, payload, service.CreditReasonImageGeneration, "/v1/images/generations"); !errors.Is(err, ErrImageChargeAlreadySettled) {
		t.Fatalf("second deduct err=%v, want ErrImageChargeAlreadySettled", err)
	}
	// Full refund then allow re-bill under retry ref.
	app.refundImageCredits(c1)
	c2, err := app.deductImageCredits(identity, payload, service.CreditReasonImageGeneration, "/v1/images/generations")
	if err != nil || c2 == nil {
		t.Fatalf("retry after refund err=%v charge=%v", err, c2)
	}
	if c2.RefID == c1.RefID {
		t.Fatalf("retry ref should differ: %q", c2.RefID)
	}
	if !strings.Contains(c2.RefID, ":retry:") {
		t.Fatalf("retry ref = %q, want :retry: suffix", c2.RefID)
	}
	if _, err := app.deductImageCredits(identity, payload, service.CreditReasonImageGeneration, "/v1/images/generations"); !errors.Is(err, ErrImageChargeAlreadySettled) {
		t.Fatalf("third deduct after one retry err=%v, want ErrImageChargeAlreadySettled", err)
	}
}
