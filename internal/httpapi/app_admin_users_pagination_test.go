package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminUsersListIsUsageFreeAndUsageIsOnDemand(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	if _, err := app.auth.CreatePasswordUser("page-user", "Password123", "Page User", "", true); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/admin/users?page=1&page_size=10", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("users status = %d body = %s", res.Code, res.Body.String())
	}
	var page map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	// Scheme B: list never marks usage ready / never attaches curves from log scan.
	if ready, _ := page["usage_ready"].(bool); ready {
		t.Fatalf("list must not report usage_ready=true: %#v", page)
	}
	items, _ := page["items"].([]any)
	if len(items) < 1 {
		t.Fatalf("expected at least one user: %#v", page)
	}
	first, _ := items[0].(map[string]any)
	if _, has := first["usage_curve"]; has {
		t.Fatalf("list item must not include usage_curve: %#v", first)
	}
	if _, has := first["call_count"]; has {
		t.Fatalf("list item must not include call_count: %#v", first)
	}

	// On-demand usage endpoint exists and accepts ids.
	id, _ := first["id"].(string)
	if id == "" {
		t.Fatalf("missing user id: %#v", first)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/users/usage?ids="+id, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("usage status = %d body = %s", res.Code, res.Body.String())
	}
	var usage map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &usage); err != nil {
		t.Fatal(err)
	}
	if _, ok := usage["ready"].(bool); !ok {
		t.Fatalf("usage response missing ready: %#v", usage)
	}
	if _, ok := usage["items"].(map[string]any); !ok && usage["items"] != nil {
		// items may be empty map when not ready
		if usage["items"] == nil {
			t.Fatalf("usage items missing: %#v", usage)
		}
	}
}
