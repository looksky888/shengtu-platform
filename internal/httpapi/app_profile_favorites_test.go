package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestProfilePromptFavoritesArePersonalAndPermissionIndependent(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, _, err := app.auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser(alice) error = %v", err)
	}
	role, err := app.auth.CreateRole(service.ManagedRoleCreate{
		Name:           "models only",
		MenuPaths:      []string{"/image"},
		APIPermissions: []string{service.APIPermissionKey("GET", "/v1/models")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if updated, _ := app.auth.UpdateUser(user.ID, service.ManagedUserUpdate{RoleID: service.StringPtr(role.ID)}); updated.ID == "" {
		t.Fatal("UpdateUser(role) returned empty user")
	}
	_, aliceToken, err := app.auth.LoginPassword("alice", "Password123")
	if err != nil {
		t.Fatalf("LoginPassword(alice) error = %v", err)
	}

	other, otherToken, err := app.auth.RegisterPasswordUser("bob", "Password123", "Bob")
	if err != nil {
		t.Fatalf("RegisterPasswordUser(bob) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/profile/prompt-favorites", nil)
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("initial list status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("initial list json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("initial list should be empty: %#v", list)
	}

	body := `{
		"prompt_id":"manual:prompt-a",
		"source":"manual",
		"title":"Prompt A",
		"preview":"https://example.test/a.png",
		"reference_image_urls":["https://example.test/ref.png"],
		"prompt":"draw a cat",
		"author":"Alice",
		"mode":"edit",
		"category":"Animals",
		"sub_category":"Cats",
		"source_label":"manual",
		"is_nsfw":false,
		"localizations":{"zh-CN":{"title":"提示 A","prompt":"画猫","category":"动物","sub_category":"猫"}}
	}`
	req = httptest.NewRequest(http.MethodPost, "/api/profile/prompt-favorites", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create favorite status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create favorite json: %v", err)
	}
	item, _ := created["item"].(map[string]any)
	favoriteID, _ := item["id"].(string)
	if favoriteID == "" || item["title"] != "Prompt A" || item["prompt_id"] != "manual:prompt-a" {
		t.Fatalf("create favorite body = %#v", created)
	}
	if items := logItems(created); len(items) != 1 {
		t.Fatalf("created items length = %d body = %#v", len(items), created)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/prompt-favorites", strings.NewReader(strings.Replace(body, "Prompt A", "Prompt A Updated", 1)))
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("duplicate favorite status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("duplicate favorite json: %v", err)
	}
	if items := logItems(created); len(items) != 1 || items[0]["title"] != "Prompt A Updated" {
		t.Fatalf("duplicate favorite should update in place: %#v", created)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/profile/prompt-favorites", nil)
	req.Header.Set("Authorization", "Bearer "+otherToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("other list status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("other list json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("other user saw favorites, user=%s other=%s list=%#v", user.ID, other.ID, list)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/profile/prompt-favorites/"+favoriteID, nil)
	req.Header.Set("Authorization", "Bearer "+otherToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("other delete status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/profile/prompt-favorites/"+favoriteID, nil)
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete favorite status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("delete favorite json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("favorite remained after delete: %#v", list)
	}

	_, unownedKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "legacy user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(unowned) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/profile/prompt-favorites", nil)
	req.Header.Set("Authorization", "Bearer "+unownedKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("unowned key list status = %d body = %s", res.Code, res.Body.String())
	}
}
