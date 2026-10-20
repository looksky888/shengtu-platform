package protocol

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
)

type quotaFixtureTransport struct{}

func (quotaFixtureTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	body := "{}"
	switch r.URL.Path {
	case "/":
		body = "<html>fixture</html>"
	case "/backend-api/me":
		body = `{"email":"test@example.invalid","id":"fixture"}`
	case "/backend-api/conversation/init":
		body = `{"default_model_slug":"auto","limits_progress":[{"feature_name":"image_gen","remaining":5}]}`
	default:
		return nil, fmt.Errorf("unexpected fixture request path %s", r.URL.Path)
	}
	return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
}

type cooldownTestConfig struct{}

func (cooldownTestConfig) AutoRemoveInvalidAccounts() bool     { return true }
func (cooldownTestConfig) AutoRemoveRateLimitedAccounts() bool { return true }

func TestAutoImage404PoolUsesExistingBudgetAndKeepsQuota(t *testing.T) {
	for _, succeedAt := range []int{2, 0} {
		t.Run(fmt.Sprint(succeedAt), func(t *testing.T) {
			oldTransport := http.DefaultTransport
			http.DefaultTransport = quotaFixtureTransport{}
			t.Cleanup(func() { http.DefaultTransport = oldTransport })
			dir := t.TempDir()
			accounts := service.NewAccountService(storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "keys.json")), cooldownTestConfig{}, nil, service.NewLogService(dir))
			tokens := []string{"token-a", "token-b", "token-c", "token-d", "token-e"}
			accounts.AddAccounts(tokens)
			for _, token := range tokens {
				if _, err := accounts.UpdateAccount(token, map[string]any{"status": "正常", "quota": 5}); err != nil {
					t.Fatal(err)
				}
			}
			engine := &Engine{Accounts: accounts}
			seen := map[string]bool{}
			failures := []string{}
			attempts := 0
			run := func(ctx context.Context, client *backend.Client, request ConversationRequest, index, total int) (<-chan ImageOutput, <-chan error) {
				attempts++
				if seen[client.AccessToken] {
					t.Error("selected same failed account twice")
				}
				seen[client.AccessToken] = true
				if request.UpstreamModel != "auto" {
					t.Errorf("changed actual auto model to %s", request.UpstreamModel)
				}
				out := make(chan ImageOutput, 1)
				errs := make(chan error, 1)
				if attempts == succeedAt {
					out <- ImageOutput{Kind: "result", Data: []map[string]any{{"url": "fixture"}}}
					errs <- nil
				} else {
					failures = append(failures, client.AccessToken)
					errs <- fmt.Errorf("wrapped: %w", backend.ErrAutoImageModelNotFound)
				}
				close(out)
				close(errs)
				return out, errs
			}
			outputs, errs := engine.streamImageOutputsWithPool(context.Background(), ConversationRequest{Model: "auto", UpstreamModel: "auto", FallbackModels: []string{"gpt-5.5"}, Prompt: "fixture", N: 1}, run)
			results := 0
			for output := range outputs {
				if output.Kind == "result" {
					results++
				}
			}
			err := <-errs
			if succeedAt > 0 && (err != nil || results != 1 || attempts != succeedAt) {
				t.Fatalf("success path: %v results=%d attempts=%d", err, results, attempts)
			}
			if succeedAt == 0 && (err == nil || attempts != 1+maxImageStreamTransientRetries) {
				t.Fatalf("budget: %v attempts=%d", err, attempts)
			}
			for _, token := range failures {
				account := accounts.GetAccount(token)
				if account == nil || fmt.Sprint(account["quota"]) != "5" || account["status"] != "正常" || fmt.Sprint(account["fail"]) != "0" {
					t.Fatalf("failed account mutated: token omitted, quota/status/fail unexpected")
				}
				selected, err := accounts.GetAvailableAccessTokenFor(context.Background(), func(item map[string]any) bool { return item["access_token"] == token })
				if err == nil {
					accounts.ReleaseImageReservation(selected)
					t.Error("failed account not cooled")
				}
			}
		})
	}
}
