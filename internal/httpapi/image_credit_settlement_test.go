package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/service"
)

func TestLoggedImageTaskSettlesActualSuccessCount(t *testing.T) {
	for _, test := range []struct {
		name  string
		count int
		err   error
		want  int
	}{
		{"partial-success", 1, nil, 49}, {"all-success", 3, nil, 47},
		{"partial-error", 1, errors.New("upstream stopped"), 49}, {"empty", 0, nil, 50},
	} {
		t.Run(test.name, func(t *testing.T) {
			app := newTestApp(t)
			defer app.Close()
			identity := service.Identity{ID: "settlement-user", Role: service.AuthRoleUser}
			if _, _, err := app.credits.Add(identity.ID, 50, "seed", "seed"); err != nil {
				t.Fatal(err)
			}
			data := make([]map[string]any, test.count)
			for i := range data {
				data[i] = map[string]any{"b64_json": "fixture"}
			}
			payload := map[string]any{"client_task_id": test.name, "n": 3, "image_resolution": "1080p"}
			_, _ = app.runLoggedImageTask(context.Background(), identity, payload, "/api/creation-tasks/image-generations", "audit", func(context.Context, map[string]any) (map[string]any, error) {
				return map[string]any{"data": data}, test.err
			})
			account, err := app.credits.Account(identity.ID)
			if err != nil || account.Balance != test.want {
				t.Fatalf("balance=%d want=%d err=%v", account.Balance, test.want, err)
			}
		})
	}
}

func TestImageStreamsSettleMissingImages(t *testing.T) {
	for _, kind := range []string{"openai", "anthropic"} {
		for _, test := range []struct {
			name string
			data []map[string]any
			want int
		}{
			{"one-url", []map[string]any{{"url": "https://example.test/one.png"}}, 9},
			{"two-inline", []map[string]any{{"b64_json": "one"}, {"b64_json": "two"}}, 8},
			{"all-inline", []map[string]any{{"b64_json": "one"}, {"b64_json": "two"}, {"b64_json": "three"}}, 7},
		} {
			t.Run(kind+"/"+test.name, func(t *testing.T) {
				app := newTestApp(t)
				defer app.Close()
				identity, charge := seedImageCreditCharge(t, app, 10, 3)
				charge.N = 3
				item := map[string]any{"data": test.data}
				stream := imageTestStream([]map[string]any{item, item}, nil)
				req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
				app.writeProtocol(httptest.NewRecorder(), req, nil, stream, nil, kind, req.URL.Path, "gpt-image-1", identity, "audit", service.ImageVisibilityPrivate, charge)
				account, err := app.credits.Account(identity.ID)
				if err != nil || account.Balance != test.want {
					t.Fatalf("balance=%d want=%d err=%v", account.Balance, test.want, err)
				}
			})
		}
	}
}
