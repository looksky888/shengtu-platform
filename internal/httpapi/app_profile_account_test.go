package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProfileAccountNameAndPasswordUpdates(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	if user.Name != "Alice" || token == "" {
		t.Fatalf("registered identity=%#v token=%q", user, token)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/profile", strings.NewReader(`{"name":"Alice Updated"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile name update status = %d body = %s", res.Code, res.Body.String())
	}
	var profile map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("profile update json: %v", err)
	}
	if profile["name"] != "Alice Updated" || profile["subject_id"] != user.ID {
		t.Fatalf("profile update body = %#v", profile)
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("session after profile update status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("session after profile update json: %v", err)
	}
	if profile["name"] != "Alice Updated" {
		t.Fatalf("session did not reflect updated name: %#v", profile)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/password", strings.NewReader(`{"current_password":"wrong-password","new_password":"NewPassword123"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("wrong current password status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/password", strings.NewReader(`{"current_password":"Password123","new_password":"NewPassword123"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("password update status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(authJSON(`{"username":"alice","password":"Password123"}`)))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("old password login status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(authJSON(`{"username":"alice","password":"NewPassword123"}`)))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("new password login status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("new password login json: %v", err)
	}
	if profile["name"] != "Alice Updated" || profile["subject_id"] != user.ID {
		t.Fatalf("new password login body = %#v", profile)
	}
}
