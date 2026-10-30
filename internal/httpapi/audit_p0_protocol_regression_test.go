package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
)

func TestWriteProtocolSettlesChatAndResponsesImagePayloads(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, _, err := app.auth.CreateAPIKey(service.AuthRoleUser, "p0-1-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if _, _, err := app.credits.Add(user.ID, 100, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	identity := service.Identity{ID: user.ID, Role: service.AuthRoleUser, Name: user.Name}

	// Case 1: Non-streaming /v1/chat/completions delivering markdown image must return 200 and keep charge.
	charge1, err := app.deductImageCredits(
		identity,
		map[string]any{"model": "gpt-image-2", "n": 1, "client_task_id": "p0-1-chat-sync"},
		service.CreditReasonImageGeneration,
		"/v1/chat/completions",
	)
	if err != nil {
		t.Fatalf("deductImageCredits(chat sync) error = %v", err)
	}
	balAfterDeduct1, _ := app.credits.Account(user.ID)
	req1 := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	res1 := httptest.NewRecorder()
	chatResult := map[string]any{
		"id":     "chatcmpl-1",
		"object": "chat.completion",
		"choices": []map[string]any{
			{
				"index": 0,
				"message": map[string]any{
					"role":    "assistant",
					"content": "Here is your image:\n\n![image](https://example.test/images/generated-1.png)",
				},
			},
		},
	}
	app.writeProtocol(res1, req1, chatResult, nil, nil, "openai", "/v1/chat/completions", "gpt-image-2", identity, "文生图", service.ImageVisibilityPrivate, charge1)
	if res1.Code != http.StatusOK {
		t.Fatalf("chat sync image status = %d body = %s, want 200", res1.Code, res1.Body.String())
	}
	balAfterSettle1, _ := app.credits.Account(user.ID)
	if balAfterSettle1.Balance != balAfterDeduct1.Balance {
		t.Fatalf("chat sync image unexpectedly refunded credits: got %d, want %d", balAfterSettle1.Balance, balAfterDeduct1.Balance)
	}

	// Case 2: Streaming /v1/responses delivering inline b64_json across multiple events
	// for a 3-image charge must count 1 unique image and refund only 2/3, never 100%.
	charge2, err := app.deductImageCredits(
		identity,
		map[string]any{"model": "gpt-image-2", "n": 3, "client_task_id": "p0-1-resp-stream"},
		service.CreditReasonImageGeneration,
		"/v1/responses",
	)
	if err != nil {
		t.Fatalf("deductImageCredits(responses stream) error = %v", err)
	}
	unitCost := charge2.Amount / 3
	items := make(chan map[string]any, 3)
	errs := make(chan error, 1)
	items <- map[string]any{
		"type": "response.output_item.done",
		"item": map[string]any{
			"type":   "image_generation_call",
			"result": "cG5nLWlubGluZS1pbWFnZQ==",
		},
	}
	items <- map[string]any{
		"type": "response.completed",
		"response": map[string]any{
			"output": []map[string]any{
				{
					"type":   "image_generation_call",
					"result": "cG5nLWlubGluZS1pbWFnZQ==",
				},
			},
		},
	}
	close(items)
	errs <- nil
	close(errs)

	req2 := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	res2 := httptest.NewRecorder()
	app.writeProtocol(
		res2,
		req2,
		nil,
		&protocol.StreamResult{Kind: "openai", Items: items, Err: errs},
		nil,
		"openai",
		"/v1/responses",
		"gpt-5",
		identity,
		"文生图",
		service.ImageVisibilityPrivate,
		charge2,
	)
	if res2.Code != http.StatusOK || strings.Contains(res2.Body.String(), "image_generation_empty_stream") {
		t.Fatalf("responses stream status = %d body = %s", res2.Code, res2.Body.String())
	}
	balAfterSettle2, _ := app.credits.Account(user.ID)
	wantBalance := balAfterSettle1.Balance - unitCost
	if balAfterSettle2.Balance != wantBalance {
		t.Fatalf("responses stream settled balance = %d, want %d (charged 1 delivered of 3)", balAfterSettle2.Balance, wantBalance)
	}
}

func TestCreationTaskChatCompletionsRejectsImageRequests(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "p0-2-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	for _, body := range []string{
		`{"client_task_id":"bypass-1","model":"gpt-image-2","messages":[{"role":"user","content":"draw a cat"}]}`,
		`{"client_task_id":"bypass-2","model":"grok-imagine-image","messages":[{"role":"user","content":"draw a dog"}]}`,
		`{"client_task_id":"bypass-3","model":"gpt-5","tools":[{"type":"image_generation"}],"messages":[{"role":"user","content":"draw"}]}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 rejecting zero-credit image bypass on chat-completions, got %d body=%s", res.Code, res.Body.String())
		}
		var payload map[string]any
		_ = json.Unmarshal(res.Body.Bytes(), &payload)
		if account, _ := app.credits.Account(user.ID); account.Balance != 0 {
			t.Fatalf("unexpected credit mutation on rejected task: %#v", account)
		}
	}
}
