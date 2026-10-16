package httpapi

import (
	"context"
	"testing"

	"chatgpt2api/internal/service"
)

func TestRunLoggedImageTaskRefundsCreditsOnPanic(t *testing.T) {
	app := newTestApp(t)
	identity := service.Identity{ID: "panic-user", Name: "Panic User", Role: service.AuthRoleUser}
	if _, _, err := app.credits.Add(identity.ID, 10, "test", "panic-seed"); err != nil {
		t.Fatalf("seed credits: %v", err)
	}
	payload := map[string]any{"client_task_id": "panic-refund", "model": "gpt-image-2", "n": 1}

	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("runLoggedImageTask() did not propagate panic")
			}
		}()
		_, _ = app.runLoggedImageTask(context.Background(), identity, payload, "/api/creation-tasks/image-generations", "test panic", func(context.Context, map[string]any) (map[string]any, error) {
			panic("forced billed handler panic")
		})
	}()

	account, err := app.credits.Account(identity.ID)
	if err != nil {
		t.Fatalf("load credits: %v", err)
	}
	if account.Balance != 10 {
		t.Fatalf("balance = %d, want refunded 10", account.Balance)
	}
}
