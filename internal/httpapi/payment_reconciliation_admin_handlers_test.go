package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestAdminPaymentReconciliationsContract(t *testing.T) {
	resetAuthRateLimiterForTest()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "payment-reconciliation-http.db")))
	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	auth := adminAuthHeader(t, app)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/payment-reconciliations?page=1&page_size=10", nil)
	req.Header.Set("Authorization", auth)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", res.Code, res.Body.String())
	}
	var page struct {
		Items    []any `json:"items"`
		Total    int   `json:"total"`
		Page     int   `json:"page"`
		PageSize int   `json:"page_size"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.Items == nil || page.Total != 0 || page.Page != 1 || page.PageSize != 10 {
		t.Fatalf("page=%#v", page)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/payment-reconciliations", strings.NewReader(`{"channel_id":"","bill_date":""}`))
	req.Header.Set("Authorization", auth)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("invalid trigger status=%d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/payment-reconciliations/missing?page=1&page_size=10", nil)
	req.Header.Set("Authorization", auth)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("missing detail status=%d body=%s", res.Code, res.Body.String())
	}
}
