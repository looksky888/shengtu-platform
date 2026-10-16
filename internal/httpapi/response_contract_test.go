package httpapi

import (
	"encoding/json"
	"testing"

	"chatgpt2api/internal/service"
)

func TestLoginResponseTokenPresenceContract(t *testing.T) {
	withoutToken := responseObject(t, loginResponse{OK: true, Version: "3.7", MenuPaths: []string{}, APIPermissions: []string{}, Menus: []service.MenuPermission{}})
	if _, exists := withoutToken["token"]; exists {
		t.Fatal("empty login token must stay omitted")
	}
	for _, key := range []string{"ok", "version", "role", "role_id", "role_name", "subject_id", "name", "provider", "credential_id", "credential_name", "menu_paths", "api_permissions", "menus"} {
		if _, exists := withoutToken[key]; !exists {
			t.Fatalf("login response missing key %q", key)
		}
	}

	withToken := responseObject(t, loginResponse{OK: true, Version: "3.7", Token: "session-token"})
	if withToken["token"] != "session-token" {
		t.Fatalf("login token = %#v", withToken["token"])
	}
}

func TestAccountPayloadZeroAndEmptyListContract(t *testing.T) {
	payload := map[string]any{
		"added": 0, "skipped": 0, "refreshed": 0,
		"items": []service.AccountPublic{}, "errors": []map[string]string{},
	}
	object := responseObject(t, accountPayloadResponseFromMap(payload))
	for _, key := range []string{"added", "skipped", "refreshed", "items", "errors"} {
		if _, exists := object[key]; !exists {
			t.Fatalf("account response missing key %q", key)
		}
	}
	if items, ok := object["items"].([]any); !ok || len(items) != 0 {
		t.Fatalf("items = %#v, want []", object["items"])
	}
	if errors, ok := object["errors"].([]any); !ok || len(errors) != 0 {
		t.Fatalf("errors = %#v, want []", object["errors"])
	}
}

func TestICloudBridgeStatusFieldPresenceContract(t *testing.T) {
	withoutStatus := responseObject(t, iCloudBridgeStatusResponse{Enabled: true, BaseURL: "http://icloud", Error: "unreachable"})
	if _, exists := withoutStatus["status_code"]; exists {
		t.Fatal("status_code must stay omitted before an HTTP response exists")
	}
	if withoutStatus["error"] != "unreachable" {
		t.Fatalf("error = %#v", withoutStatus["error"])
	}

	status := 200
	withStatus := responseObject(t, iCloudBridgeStatusResponse{Enabled: true, Reachable: true, BaseURL: "http://icloud", StatusCode: &status, Error: ""})
	if withStatus["status_code"] != float64(200) {
		t.Fatalf("status_code = %#v", withStatus["status_code"])
	}
	if _, exists := withStatus["error"]; !exists {
		t.Fatal("final bridge response must keep empty error field")
	}
}

func TestUpstreamClearanceOptionalFieldContract(t *testing.T) {
	status := responseObject(t, service.UpstreamClearanceStatusPublic{CachedClearanceHosts: []string{}})
	if hosts, ok := status["cached_clearance_hosts"].([]any); !ok || len(hosts) != 0 {
		t.Fatalf("cached_clearance_hosts = %#v, want []", status["cached_clearance_hosts"])
	}
	if _, exists := status["cookie_count"]; exists {
		t.Fatal("cookie_count must stay omitted without cached bundle")
	}

	zero := 0
	noAgent := false
	status = responseObject(t, service.UpstreamClearanceStatusPublic{
		CachedClearanceHosts: []string{}, CookieCount: &zero, HasUserAgent: &noAgent,
	})
	if _, exists := status["cookie_count"]; !exists {
		t.Fatal("cookie_count=0 must stay present when cached bundle exists")
	}
	if _, exists := status["has_user_agent"]; !exists {
		t.Fatal("has_user_agent=false must stay present when cached bundle exists")
	}
}

func responseObject(t *testing.T, value any) map[string]any {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	var object map[string]any
	if err := json.Unmarshal(data, &object); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	return object
}
