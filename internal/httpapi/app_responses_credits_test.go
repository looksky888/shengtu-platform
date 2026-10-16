package httpapi

import (
	"chatgpt2api/internal/service"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResponsesImageToolBillsCredits(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "responses user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	userID := user.ID

	// Zero balance: image tool must be rejected before upstream.
	body := `{"model":"gpt-image-2","input":"draw a cat","tools":[{"type":"image_generation"}],"n":1,"client_task_id":"resp-bill-1"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusPaymentRequired {
		t.Fatalf("responses image status = %d body = %s, want 402", res.Code, res.Body.String())
	}
	if account, err := app.credits.Account(userID); err != nil || account.Balance != 0 {
		t.Fatalf("balance should stay 0: %#v err=%v", account, err)
	}

	if _, _, err := app.credits.Add(userID, 100, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)

	found := false
	for _, e := range app.credits.Ledger(userID) {
		if e.Reason == service.CreditReasonImageGeneration {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected image_generation ledger after responses image; status=%d body=%s", res.Code, res.Body.String())
	}
}

func TestResponsesTextDoesNotBillImageCredits(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "text user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	userID := user.ID
	if _, _, err := app.credits.Add(userID, 10, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	body := `{"model":"gpt-5","input":"hello"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	for _, e := range app.credits.Ledger(userID) {
		if e.Reason == service.CreditReasonImageGeneration || e.Reason == service.CreditReasonImageEdit {
			t.Fatalf("text responses should not image-bill: %#v status=%d", e, res.Code)
		}
	}
	if account, _ := app.credits.Account(userID); account.Balance != 10 {
		t.Fatalf("balance = %d, want 10", account.Balance)
	}
}
