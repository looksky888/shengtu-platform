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

func TestSentinelSolverFailureDoesNotPenalizeOrCoolAccounts(t *testing.T) {
	oldTransport := http.DefaultTransport
	http.DefaultTransport = quotaFixtureTransport{}
	t.Cleanup(func() { http.DefaultTransport = oldTransport })

	// Subcase 1: single-account pool recovers on transient 1st solver busy error.
	t.Run("transient_busy_single_account_recovers", func(t *testing.T) {
		dir := t.TempDir()
		accounts := service.NewAccountService(storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "keys.json")), cooldownTestConfig{}, nil, service.NewLogService(dir))
		accounts.AddAccounts([]string{"token-only"})
		if _, err := accounts.UpdateAccount("token-only", map[string]any{"status": "正常", "quota": 5}); err != nil {
			t.Fatal(err)
		}
		engine := &Engine{Accounts: accounts}
		attempts := 0
		run := func(ctx context.Context, client *backend.Client, request ConversationRequest, index, total int) (<-chan ImageOutput, <-chan error) {
			attempts++
			out := make(chan ImageOutput, 1)
			errs := make(chan error, 1)
			if attempts == 1 {
				errs <- &backend.SentinelSolverError{StatusCode: 503, Message: "private sentinel solver failed (solver_status=503)"}
			} else {
				out <- ImageOutput{Kind: "result", Data: []map[string]any{{"url": "fixture"}}}
				errs <- nil
			}
			close(out)
			close(errs)
			return out, errs
		}
		outputs, errs := engine.streamImageOutputsWithPool(context.Background(), ConversationRequest{Model: "gpt-image-2", Prompt: "fixture", N: 1}, run)
		results := 0
		for output := range outputs {
			if output.Kind == "result" {
				results++
			}
		}
		if err := <-errs; err != nil || results != 1 || attempts != 2 {
			t.Fatalf("err=%v results=%d attempts=%d", err, results, attempts)
		}
	})

	// Subcase 2: persistent solver outage stops after 1 retry without burning 4 accounts or cooling any account.
	t.Run("persistent_outage_stops_early_and_preserves_pool", func(t *testing.T) {
		dir := t.TempDir()
		accounts := service.NewAccountService(storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "keys.json")), cooldownTestConfig{}, nil, service.NewLogService(dir))
		tokens := []string{"token-a", "token-b", "token-c", "token-d"}
		accounts.AddAccounts(tokens)
		for _, token := range tokens {
			if _, err := accounts.UpdateAccount(token, map[string]any{"status": "正常", "quota": 5}); err != nil {
				t.Fatal(err)
			}
		}
		engine := &Engine{Accounts: accounts}
		attempts := 0
		run := func(ctx context.Context, client *backend.Client, request ConversationRequest, index, total int) (<-chan ImageOutput, <-chan error) {
			attempts++
			out := make(chan ImageOutput)
			errs := make(chan error, 1)
			errs <- &backend.SentinelSolverError{StatusCode: 503, Message: "private sentinel solver failed (solver_status=503)"}
			close(out)
			close(errs)
			return out, errs
		}
		outputs, errs := engine.streamImageOutputsWithPool(context.Background(), ConversationRequest{Model: "gpt-image-2", Prompt: "fixture", N: 1}, run)
		for range outputs {
			t.Fatal("unexpected output")
		}
		err := <-errs
		imageErr, ok := err.(*ImageGenerationError)
		if !ok || imageErr.Code != "sentinel_solver_unavailable" {
			t.Fatalf("err = %#v, want ImageGenerationError with code sentinel_solver_unavailable", err)
		}
		if attempts != 2 {
			t.Fatalf("attempts = %d, want 2 (initial + 1 solver retry, not 4 account switches)", attempts)
		}
		for _, token := range tokens {
			account := accounts.GetAccount(token)
			if account == nil || account["status"] != "正常" || fmt.Sprint(account["quota"]) != "5" || fmt.Sprint(account["fail"]) != "0" {
				t.Fatalf("innocent account %s mutated: %#v", token, account)
			}
			selected, selErr := accounts.GetAvailableAccessTokenFor(context.Background(), func(item map[string]any) bool { return item["access_token"] == token })
			if selErr != nil {
				t.Fatalf("innocent account %s was cooled down: %v", token, selErr)
			}
			accounts.ReleaseImageReservation(selected)
		}
	})
}
