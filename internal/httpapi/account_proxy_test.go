package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAccountProxyCanBeConfiguredWithoutSecretReadback(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	app.accounts.AddAccounts([]string{"proxy-account"})
	accountID := app.accounts.ListAccountsTyped()[0].ID

	body := `{"account_id":"` + accountID + `","proxy_url":"http://session-user:secret@proxy.example:8080","proxy_timezone":"America/Los_Angeles"}`
	req := httptest.NewRequest(http.MethodPost, "/api/accounts/update", strings.NewReader(body))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("update status=%d body=%s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "secret") || strings.Contains(res.Body.String(), "session-user") {
		t.Fatalf("proxy credential leaked: %s", res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	item := payload["item"].(map[string]any)
	if item["proxy_configured"] != true || item["proxy_timezone"] != "America/Los_Angeles" {
		t.Fatalf("public proxy state=%#v", item)
	}
	stored := app.accounts.GetAccount("proxy-account")
	if stored["proxy_url"] != "http://session-user:secret@proxy.example:8080" {
		t.Fatal("full proxy was not persisted internally")
	}

	clearReq := httptest.NewRequest(http.MethodPost, "/api/accounts/update", strings.NewReader(`{"account_id":"`+accountID+`","clear_proxy":true}`))
	clearReq.Header.Set("Authorization", adminAuthHeader(t, app))
	clearRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(clearRes, clearReq)
	if clearRes.Code != http.StatusOK || app.accounts.GetAccount("proxy-account")["proxy_url"] != nil {
		t.Fatalf("clear proxy failed: status=%d body=%s", clearRes.Code, clearRes.Body.String())
	}
}
