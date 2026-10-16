package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestImageTaskCreditsChargeOnSuccess(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	userID := user.ID
	if _, _, err := app.credits.Add(userID, 10, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	app.tasks = service.NewImageTaskService(filepath.Join(t.TempDir(), "tasks.json"), func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		return app.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-generations", "text-to-image", func(context.Context, map[string]any) (map[string]any, error) {
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		})
	}, nil, nil, func() int { return 1 }, func() int { return 4 }, func() int { return 4 }, func() int { return 60 })

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"credit-success","prompt":"draw","image_resolution":"2k","n":1}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d body = %s", res.Code, res.Body.String())
	}
	waitCreationTaskStatus(t, app, token, "credit-success", service.TaskStatusSuccess)
	account, err := app.credits.Account(userID)
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 8 {
		t.Fatalf("balance = %d, want 8", account.Balance)
	}
}

func TestImageTaskCreditsRefundOnFailure(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	userID := user.ID
	if _, _, err := app.credits.Add(userID, 10, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	app.tasks = service.NewImageTaskService(filepath.Join(t.TempDir(), "tasks.json"), func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		return app.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-generations", "text-to-image", func(context.Context, map[string]any) (map[string]any, error) {
			return map[string]any{"data": []any{}}, errors.New("upstream failed")
		})
	}, nil, nil, func() int { return 1 }, func() int { return 4 }, func() int { return 4 }, func() int { return 60 })

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"credit-failure","prompt":"draw","image_resolution":"4k"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d body = %s", res.Code, res.Body.String())
	}
	waitCreationTaskStatus(t, app, token, "credit-failure", service.TaskStatusError)
	account, err := app.credits.Account(userID)
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 10 {
		t.Fatalf("balance = %d, want refunded 10", account.Balance)
	}
}

func TestImageTaskCreditsInsufficientBalanceSkipsUpstream(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	app.tasks = service.NewImageTaskService(filepath.Join(t.TempDir(), "tasks.json"), func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
		return app.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-generations", "text-to-image", func(context.Context, map[string]any) (map[string]any, error) {
			t.Fatal("upstream handler was called despite insufficient credits")
			return nil, nil
		})
	}, nil, nil, func() int { return 1 }, func() int { return 4 }, func() int { return 4 }, func() int { return 60 })

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"credit-insufficient","prompt":"draw","image_resolution":"4k"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d body = %s", res.Code, res.Body.String())
	}
	waitCreationTaskStatus(t, app, token, "credit-insufficient", service.TaskStatusError)
}

func TestDirectImageStreamCreditsChargeOnSuccess(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity, charge := seedImageCreditCharge(t, app, 5, 1)
	stream := imageTestStream([]map[string]any{{"data": []map[string]any{{"url": "https://example.test/image.png"}}}}, nil)
	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	res := httptest.NewRecorder()
	app.writeProtocol(res, req, nil, stream, nil, "openai", "/v1/images/generations", util.ImageModelAuto, identity, "text-to-image", service.ImageVisibilityPrivate, charge)

	if account, err := app.credits.Account(identity.ID); err != nil || account.Balance != 4 {
		t.Fatalf("account = %#v err = %v, want charged balance 4", account, err)
	}
}

func TestDirectImageResponseRefundsMissingImages(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	identity, charge := seedImageCreditCharge(t, app, 5, 3)
	charge.N = 3
	result := map[string]any{"data": []map[string]any{{"url": "https://example.test/one.png"}}}
	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	res := httptest.NewRecorder()
	app.writeProtocol(res, req, result, nil, nil, "openai", "/v1/images/generations", util.ImageModelAuto, identity, "text-to-image", service.ImageVisibilityPrivate, charge)
	account, err := app.credits.Account(identity.ID)
	if err != nil || account.Balance != 4 {
		t.Fatalf("account = %#v err=%v, want one billed image and two refunded", account, err)
	}
}

func TestDirectImageStreamCreditsRefundOnUpstreamError(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity, charge := seedImageCreditCharge(t, app, 5, 1)
	stream := imageTestStream(nil, errors.New("upstream failed"))
	req := httptest.NewRequest(http.MethodPost, "/v1/images/edits", nil)
	res := httptest.NewRecorder()
	app.writeProtocol(res, req, nil, stream, nil, "openai", "/v1/images/edits", util.ImageModelAuto, identity, "image-edit", service.ImageVisibilityPrivate, charge)

	if account, err := app.credits.Account(identity.ID); err != nil || account.Balance != 5 {
		t.Fatalf("account = %#v err = %v, want refunded balance 5", account, err)
	}
}

func TestDirectImageStreamCreditsRefundOnEmptyStream(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity, charge := seedImageCreditCharge(t, app, 5, 1)
	stream := imageTestStream([]map[string]any{{"object": "image.generation.message", "message": "working"}}, nil)
	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	res := httptest.NewRecorder()
	app.writeProtocol(res, req, nil, stream, nil, "openai", "/v1/images/generations", util.ImageModelAuto, identity, "text-to-image", service.ImageVisibilityPrivate, charge)

	if account, err := app.credits.Account(identity.ID); err != nil || account.Balance != 5 {
		t.Fatalf("account = %#v err = %v, want empty stream refunded balance 5", account, err)
	}
	if !strings.Contains(res.Body.String(), "image_generation_empty_stream") {
		t.Fatalf("empty stream response = %s", res.Body.String())
	}
}

func TestAuthProvidersOmitsLinuxDo(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/auth/providers", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("providers status = %d body = %s", res.Code, res.Body.String())
	}
	var providers map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &providers); err != nil {
		t.Fatalf("providers json: %v", err)
	}
	if _, ok := providers["linuxdo"]; ok {
		t.Fatalf("linuxdo provider should be removed: %#v", providers)
	}
	if _, ok := providers["registration"]; !ok {
		t.Fatalf("registration provider missing: %#v", providers)
	}

	for _, path := range []string{"/auth/linuxdo/start?redirect=/settings", "/auth/linuxdo/oauth/callback?code=oauth-code&state=state"} {
		req = httptest.NewRequest(http.MethodGet, path, nil)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusNotFound {
			t.Fatalf("%s status = %d body = %s", path, res.Code, res.Body.String())
		}
	}
}

func TestCreationTaskPollingDisablesCaching(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=missing", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("creation task list status = %d body = %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if got := res.Header().Get("Pragma"); got != "no-cache" {
		t.Fatalf("Pragma = %q, want no-cache", got)
	}
}
