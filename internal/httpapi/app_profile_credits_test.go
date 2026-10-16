package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestProfileCreditsSignupCheckinAndInvite(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	adminToken := loginTestUser(t, app, "admin", "AdminPass123!")
	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration status = %d body = %s", res.Code, res.Body.String())
	}

	aliceToken := registerTestUser(t, app, "alice", "Alice", "")
	credits := getProfileCredits(t, app, aliceToken)
	if credits["balance"] != float64(service.DefaultSignupCreditAmount) || credits["checked_in_today"] != false {
		t.Fatalf("alice signup credits = %#v", credits)
	}

	checkin := postProfileCheckin(t, app, aliceToken)
	if checkin["awarded"] != true || checkin["balance"] != float64(service.DefaultSignupCreditAmount+service.DefaultDailyCheckinCreditAmount) {
		t.Fatalf("first checkin = %#v", checkin)
	}
	checkin = postProfileCheckin(t, app, aliceToken)
	if checkin["awarded"] != false || checkin["balance"] != float64(service.DefaultSignupCreditAmount+service.DefaultDailyCheckinCreditAmount) {
		t.Fatalf("duplicate checkin = %#v", checkin)
	}

	invite := getProfileInvite(t, app, aliceToken)
	code, _ := invite["code"].(string)
	if code == "" || invite["link"] != "/login?register=1&invite_code="+code {
		t.Fatalf("invite response = %#v", invite)
	}
	_ = registerTestUser(t, app, "bob", "Bob", code)
	aliceCredits := getProfileCredits(t, app, aliceToken)
	// Valid invite rewards inviter once.
	wantAliceBalance := service.DefaultSignupCreditAmount + service.DefaultDailyCheckinCreditAmount + service.DefaultInviteCreditAmount
	if aliceCredits["balance"] != float64(wantAliceBalance) {
		t.Fatalf("alice credits after invite = %#v, want balance %d", aliceCredits, wantAliceBalance)
	}

	carolToken := registerTestUser(t, app, "carol", "Carol", "invalid-code")
	carolCredits := getProfileCredits(t, app, carolToken)
	if carolCredits["balance"] != float64(service.DefaultSignupCreditAmount) {
		t.Fatalf("invalid invite affected signup credits = %#v", carolCredits)
	}

	_, unownedKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "legacy user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(unowned) error = %v", err)
	}
	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/profile/credits"},
		{http.MethodPost, "/api/profile/checkin"},
		{http.MethodGet, "/api/profile/invite"},
	} {
		req = httptest.NewRequest(tc.method, tc.path, nil)
		req.Header.Set("Authorization", "Bearer "+unownedKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusForbidden {
			t.Fatalf("unowned key %s %s status = %d body = %s", tc.method, tc.path, res.Code, res.Body.String())
		}
	}
}

func TestAccountRegisterDoesNotFailWhenCreditRewardFails(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	blockedDataDir := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blockedDataDir, []byte("block mkdir"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	app.credits = service.NewCreditService(blockedDataDir)

	adminToken := loginTestUser(t, app, "admin", "AdminPass123!")
	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration status = %d body = %s", res.Code, res.Body.String())
	}

	deviceCookie := sendTestRegistrationEmailCode(t, app, "dave@example.test", "", "", "")
	req = httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(authJSON(`{"email":"dave@example.test","email_code":"123456","password":"Password123","name":"Dave"}`)))
	req.AddCookie(&http.Cookie{Name: service.DeviceCookieName(), Value: deviceCookie})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("register with credit failure status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("register json: %v", err)
	}
	if body["token"] == "" || body["name"] != "Dave" {
		t.Fatalf("register response = %#v", body)
	}
}

func TestProfileCreditRedeemAndAdminCreditCards(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	adminToken := loginTestUser(t, app, "admin", "AdminPass123!")
	user, userToken, err := app.auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/admin/credits/cards/generate", strings.NewReader(`{"amount":12,"count":2}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("generate cards status = %d body = %s", res.Code, res.Body.String())
	}
	var generated map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &generated); err != nil {
		t.Fatalf("generate cards json: %v", err)
	}
	items := logItems(generated)
	if len(items) != 2 {
		t.Fatalf("generated items = %#v", generated)
	}
	key, _ := items[0]["key"].(string)
	cardID, _ := items[1]["id"].(string)
	if key == "" || items[0]["code_hash"] != nil {
		t.Fatalf("generated item leaked or missed key: %#v", items[0])
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/credits/redeem", strings.NewReader(fmt.Sprintf(`{"key":%q}`, key)))
	req.Header.Set("Authorization", "Bearer "+userToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("redeem status = %d body = %s", res.Code, res.Body.String())
	}
	var redeemed map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &redeemed); err != nil {
		t.Fatalf("redeem json: %v", err)
	}
	if redeemed["balance"] != float64(12) {
		t.Fatalf("redeem body = %#v", redeemed)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/credits/redeem", strings.NewReader(fmt.Sprintf(`{"key":%q}`, key)))
	req.Header.Set("Authorization", "Bearer "+userToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusConflict {
		t.Fatalf("duplicate redeem status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/credits/cards", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list cards status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("list cards json: %v", err)
	}
	// Admin list must not leak plaintext keys or code hashes.
	if cards := logItems(list); len(cards) != 2 || cards[0]["key"] != nil || cards[0]["code_hash"] != nil {
		t.Fatalf("list cards admin payload = %#v", list)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/credits/cards/"+cardID+"/disable", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("disable card status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/credits/ledger", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("ledger status = %d body = %s", res.Code, res.Body.String())
	}
	var ledger map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &ledger); err != nil {
		t.Fatalf("ledger json: %v", err)
	}
	if entries := logItems(ledger); len(entries) != 1 || entries[0]["reason"] != service.CreditReasonCardRedeem || entries[0]["user_id"] != user.ID {
		t.Fatalf("ledger = %#v", ledger)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/credits/users", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("credit users status = %d body = %s", res.Code, res.Body.String())
	}
	var users map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &users); err != nil {
		t.Fatalf("credit users json: %v", err)
	}
	if items := logItems(users); len(items) != 1 || items[0]["balance"] != float64(12) {
		t.Fatalf("credit users = %#v", users)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/credits/users/"+user.ID+"/adjust", strings.NewReader(`{"delta":5}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("credit adjust status = %d body = %s", res.Code, res.Body.String())
	}
	var adjusted map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &adjusted); err != nil {
		t.Fatalf("credit adjust json: %v", err)
	}
	if adjusted["account"].(map[string]any)["balance"] != float64(17) {
		t.Fatalf("credit adjust body = %#v", adjusted)
	}

	_, unownedKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "legacy user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(unowned) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/admin/credits/cards/generate", strings.NewReader(`{"amount":1}`))
	req.Header.Set("Authorization", "Bearer "+unownedKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("non-admin generate status = %d body = %s", res.Code, res.Body.String())
	}
}
