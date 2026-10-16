package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestAdminUsersManageLocalUsers(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "user:alice", Name: "alice", Provider: service.AuthProviderLocal}
	_, ownerAPIKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice api", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey(owner) error = %v", err)
	}
	local, localKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "local user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(local) error = %v", err)
	}
	localID := local.ID
	app.logs.Add("文生图调用完成", map[string]any{
		"subject_id":  owner.ID,
		"key_id":      "alice-api",
		"status":      "success",
		"endpoint":    "/v1/images/generations",
		"duration_ms": 120,
		"urls":        []string{"https://example.test/a.png", "https://example.test/b.png"},
	})
	app.logs.Add("文生图调用失败", map[string]any{
		"subject_id": owner.ID,
		"key_id":     "alice-api",
		"status":     "failed",
		"endpoint":   "/v1/images/generations",
	})
	app.logs.Add("图生图调用完成", map[string]any{
		"key_id":   localID,
		"status":   "success",
		"endpoint": "/api/creation-tasks/image-edits",
	})

	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+ownerAPIKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("non-admin users status = %d body = %s", res.Code, res.Body.String())
	}

	// Scheme B: list is usage-free; load usage via /api/admin/users/usage?ids=...
	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin users json: %v", err)
	}
	ownedUser := findHTTPItem(logItems(list), owner.ID)
	localUser := findHTTPItem(logItems(list), localID)
	if ownedUser == nil || ownedUser["provider"] != service.AuthProviderLocal || ownedUser["has_api_key"] != true {
		t.Fatalf("owned user = %#v", ownedUser)
	}
	if localUser == nil || localUser["provider"] != service.AuthProviderLocal || localUser["has_api_key"] != true {
		t.Fatalf("local user = %#v", localUser)
	}
	if _, has := ownedUser["call_count"]; has {
		t.Fatalf("list must not include call_count: %#v", ownedUser)
	}
	if _, has := ownedUser["usage_curve"]; has {
		t.Fatalf("list must not include usage_curve: %#v", ownedUser)
	}

	usageURL := "/api/admin/users/usage?ids=" + url.QueryEscape(owner.ID+","+localID) + "&days=14"
	req = httptest.NewRequest(http.MethodGet, usageURL, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users usage status = %d body = %s", res.Code, res.Body.String())
	}
	var usageBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &usageBody); err != nil {
		t.Fatalf("usage json: %v", err)
	}
	if usageBody["ready"] != true {
		t.Fatalf("usage ready = %#v", usageBody["ready"])
	}
	items, _ := usageBody["items"].(map[string]any)
	ownedStats, _ := items[owner.ID].(map[string]any)
	localStats, _ := items[localID].(map[string]any)
	if ownedStats["call_count"] != float64(2) || ownedStats["success_count"] != float64(1) ||
		ownedStats["failure_count"] != float64(1) || ownedStats["quota_used"] != float64(2) {
		t.Fatalf("owned usage = %#v", ownedStats)
	}
	if curve, ok := ownedStats["usage_curve"].([]any); !ok || len(curve) != 14 {
		t.Fatalf("owned usage_curve = %#v", ownedStats["usage_curve"])
	}
	if localStats["call_count"] != float64(1) || localStats["quota_used"] != float64(1) {
		t.Fatalf("local usage = %#v", localStats)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/users", strings.NewReader(`{"username":"created_local","name":"Created Local","password":"Password123","enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create password user status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create password user json: %v", err)
	}
	createdItem, _ := created["item"].(map[string]any)
	if createdItem["username"] != "created_local" || createdItem["name"] != "Created Local" || createdItem["has_api_key"] != false || createdItem["has_session"] != false {
		t.Fatalf("create password user body = %#v", created)
	}
	if _, ok := created["items"]; ok {
		t.Fatalf("create password user should not return full items: %#v", created)
	}
	if _, ok := created["key"]; ok {
		t.Fatalf("password user creation should not issue an API key: %#v", created)
	}
	createdID, _ := createdItem["id"].(string)
	createdPath := "/api/admin/users/" + url.PathEscape(createdID)

	req = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(authJSON(`{"username":"created_local","password":"Password123"}`)))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("created password user login status = %d body = %s", res.Code, res.Body.String())
	}
	var createdLogin map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createdLogin); err != nil {
		t.Fatalf("created password user login json: %v", err)
	}
	if createdLogin["subject_id"] != createdID || createdLogin["name"] != "Created Local" {
		t.Fatalf("created password user login body = %#v", createdLogin)
	}

	req = httptest.NewRequest(http.MethodGet, createdPath+"/key", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("initial password user key reveal status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, createdPath+"/reset-key", strings.NewReader(`{"name":"rotated local"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("reset local managed key status = %d body = %s", res.Code, res.Body.String())
	}
	var reset map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &reset); err != nil {
		t.Fatalf("reset local managed key json: %v", err)
	}
	rotatedLocalKey, _ := reset["key"].(string)
	if rotatedLocalKey == "" || reset["item"] == nil || reset["api_key"] == nil {
		t.Fatalf("reset local managed key body = %#v", reset)
	}
	if _, ok := reset["items"]; ok {
		t.Fatalf("reset local managed key should not return full items: %#v", reset)
	}
	if identity := app.auth.Authenticate(rotatedLocalKey); identity == nil || identity.ID != createdID {
		t.Fatalf("rotated local managed key identity = %#v", identity)
	}

	ownerPath := "/api/admin/users/" + url.PathEscape(owner.ID)
	req = httptest.NewRequest(http.MethodPost, ownerPath+"/reset-key", strings.NewReader(`{"name":"managed token"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("reset owned managed key status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &reset); err != nil {
		t.Fatalf("reset owned managed key json: %v", err)
	}
	if _, ok := reset["items"]; ok {
		t.Fatalf("reset owned managed key should not return full items: %#v", reset)
	}
	rotatedOwnerKey, _ := reset["key"].(string)
	if rotatedOwnerKey == "" || rotatedOwnerKey == ownerAPIKey {
		t.Fatalf("reset owned managed key body = %#v old=%q", reset, ownerAPIKey)
	}
	if app.auth.Authenticate(ownerAPIKey) != nil {
		t.Fatal("old owned API key still authenticated after admin reset")
	}
	if identity := app.auth.Authenticate(rotatedOwnerKey); identity == nil || identity.ID != owner.ID {
		t.Fatalf("rotated owned managed key identity = %#v", identity)
	}
	ownerAPIKey = rotatedOwnerKey

	req = httptest.NewRequest(http.MethodGet, ownerPath+"/key", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	// Hash-only storage: plaintext is not retained after issue, so reveal may 404.
	if res.Code != http.StatusOK && res.Code != http.StatusNotFound {
		t.Fatalf("reveal owned managed key status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, ownerPath, strings.NewReader(`{"enabled":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("disable managed user status = %d body = %s", res.Code, res.Body.String())
	}
	var updated map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &updated); err != nil {
		t.Fatalf("disable managed user json: %v", err)
	}
	if updated["item"] == nil {
		t.Fatalf("disable managed user missing item: %#v", updated)
	}
	if _, ok := updated["items"]; ok {
		t.Fatalf("disable managed user should not return full items: %#v", updated)
	}
	if app.auth.Authenticate(ownerAPIKey) != nil {
		t.Fatal("disabled owned user credentials still authenticate")
	}
	if app.auth.Authenticate(localKey) == nil {
		t.Fatal("disabling owned user should not affect local user")
	}

	req = httptest.NewRequest(http.MethodPost, ownerPath, strings.NewReader(`{"enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable managed user status = %d body = %s", res.Code, res.Body.String())
	}
	if app.auth.Authenticate(ownerAPIKey) == nil {
		t.Fatal("enabled owned user credentials should authenticate")
	}

	req = httptest.NewRequest(http.MethodDelete, ownerPath, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete managed user status = %d body = %s", res.Code, res.Body.String())
	}
	if app.auth.Authenticate(ownerAPIKey) != nil {
		t.Fatal("deleted owned user credentials still authenticate")
	}
	if app.auth.Authenticate(localKey) == nil {
		t.Fatal("deleting owned user should not affect local user")
	}
	var deleted map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &deleted); err != nil {
		t.Fatalf("delete managed user json: %v", err)
	}
	if deleted["deleted_id"] != owner.ID {
		t.Fatalf("delete managed user body = %#v", deleted)
	}
	if _, ok := deleted["items"]; ok {
		t.Fatalf("delete managed user should not return full items: %#v", deleted)
	}
}

func TestAdminUserDeleteWritesAccountabilityAudit(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, err := app.auth.CreatePasswordUser("del_audit_u", "Password123", "Del Audit", "", true)
	if err != nil {
		t.Fatalf("CreatePasswordUser: %v", err)
	}
	// Seed credits so audit captures balance snapshot.
	if _, _, _, err := app.credits.AddOnce(user.ID, 7, service.CreditReasonSignup, user.ID); err != nil {
		t.Fatalf("seed credits: %v", err)
	}

	req := httptest.NewRequest(
		http.MethodDelete,
		"/api/admin/users/"+url.PathEscape(user.ID)+"?cleanup=inactive15_or_credit0&reason=cleanup-test",
		nil,
	)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	req.Header.Set("User-Agent", "audit-delete-test")
	req.RemoteAddr = "203.0.113.40:9999"
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs?summary="+url.QueryEscape("管理端删除用户"), nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logs status=%d body=%s", res.Code, res.Body.String())
	}
	var logs map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
		t.Fatalf("logs json: %v", err)
	}
	items := logItems(logs)
	item := findLogBySummary(items, "管理端删除用户")
	if item == nil {
		// Summary filter may match partial; also scan details.
		item = findLogByDetail(items, "deleted_user_id", user.ID)
	}
	if item == nil {
		t.Fatalf("expected 管理端删除用户 audit, got %#v", items)
	}
	detail, _ := item["detail"].(map[string]any)
	if detail == nil {
		// Some list shapes flatten detail onto item.
		detail = item
	}
	if detail["deleted_user_id"] != user.ID {
		t.Fatalf("deleted_user_id = %#v item=%#v", detail["deleted_user_id"], item)
	}
	if detail["cleanup"] != "inactive15_or_credit0" {
		t.Fatalf("cleanup context missing: %#v", detail)
	}
	if detail["cleanup_context"] != true {
		t.Fatalf("cleanup_context want true: %#v", detail)
	}
	if detail["operation_type"] != "删除用户" {
		t.Fatalf("operation_type = %#v", detail["operation_type"])
	}
	if detail["reason"] != "cleanup-test" {
		t.Fatalf("reason = %#v", detail["reason"])
	}
	// Balance snapshot (float from JSON).
	switch bal := detail["deleted_credit_balance"].(type) {
	case float64:
		if bal != 7 {
			t.Fatalf("deleted_credit_balance = %v want 7", bal)
		}
	case int:
		if bal != 7 {
			t.Fatalf("deleted_credit_balance = %v want 7", bal)
		}
	default:
		t.Fatalf("deleted_credit_balance type = %T value=%#v", detail["deleted_credit_balance"], detail["deleted_credit_balance"])
	}
	if detail["deleted_username"] != "del_audit_u" {
		t.Fatalf("deleted_username = %#v", detail["deleted_username"])
	}
}
