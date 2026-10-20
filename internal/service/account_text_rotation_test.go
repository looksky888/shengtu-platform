package service

import (
	"testing"
	"time"
)

func textPoolService(t *testing.T, tokens []string) *AccountService {
	t.Helper()
	accounts := newTestAccountService(t)
	accounts.AddAccounts(tokens)
	for _, token := range tokens {
		if _, err := accounts.UpdateAccount(token, map[string]any{"status": "正常", "quota": 2}); err != nil {
			t.Fatalf("prepare %s: %v", token, err)
		}
	}
	accounts.mu.Lock()
	accounts.index = 0
	accounts.mu.Unlock()
	return accounts
}

// 3.15: text traffic used to pin every request on the first non-disabled pool row.
func TestGetTextAccessTokenRotatesAcrossPool(t *testing.T) {
	accounts := textPoolService(t, []string{"text-1", "text-2", "text-3"})
	served := map[string]int{}
	order := make([]string, 0, 6)
	for i := 0; i < 6; i++ {
		token := accounts.GetTextAccessToken()
		if token == "" {
			t.Fatal("GetTextAccessToken returned an empty token with three usable accounts")
		}
		served[token]++
		order = append(order, token)
	}
	if len(served) != 3 || served["text-1"] != 2 || served["text-2"] != 2 || served["text-3"] != 2 {
		t.Fatalf("text traffic not rotated over the pool: %v", order)
	}
	for i := 1; i < len(order); i++ {
		if order[i] == order[i-1] {
			t.Fatalf("consecutive request reused the same account: %v", order)
		}
	}
}

// 3.15: selection must honour cooldown / 限流, falling back only when nothing is left.
func TestGetTextAccessTokenSkipsCoolingAndLimitedAccounts(t *testing.T) {
	accounts := textPoolService(t, []string{"text-cool", "text-limit", "text-ok"})
	accounts.setImageCooldown("text-cool", time.Minute)
	if _, err := accounts.UpdateAccount("text-limit", map[string]any{"status": "限流"}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		if token := accounts.GetTextAccessToken(); token != "text-ok" {
			t.Fatalf("cooling/rate-limited account served text: %q", token)
		}
	}
	// Every account restricted: rotating over throttled rows is better than failing
	// every text request with an empty token.
	if _, err := accounts.UpdateAccount("text-ok", map[string]any{"status": "限流"}); err != nil {
		t.Fatal(err)
	}
	accounts.setImageCooldown("text-ok", time.Minute)
	if token := accounts.GetTextAccessToken(); token == "" {
		t.Fatal("no token served although three (throttled) accounts exist")
	}
}

func TestGetTextAccessTokenSkipsDisabledAndInvalid(t *testing.T) {
	accounts := textPoolService(t, []string{"text-disabled", "text-invalid", "text-ok"})
	if _, err := accounts.UpdateAccount("text-disabled", map[string]any{"status": "禁用"}); err != nil {
		t.Fatal(err)
	}
	if _, err := accounts.UpdateAccount("text-invalid", map[string]any{"status": "异常"}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if token := accounts.GetTextAccessToken(); token != "text-ok" {
			t.Fatalf("禁用/异常 account served text: %q", token)
		}
	}
}
