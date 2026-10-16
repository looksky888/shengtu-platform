package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestAdminPaymentOrdersReturnsStableEmptyPage(t *testing.T) {
	resetAuthRateLimiterForTest()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "payment-http.db")))
	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	req := httptest.NewRequest(http.MethodGet, "/api/admin/payment-orders?page=1", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	var body struct {
		Items    []any `json:"items"`
		Total    int   `json:"total"`
		Page     int   `json:"page"`
		PageSize int   `json:"page_size"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Items == nil || body.Total != 0 || body.Page != 1 || body.PageSize != 20 {
		t.Fatalf("body=%#v", body)
	}
}
