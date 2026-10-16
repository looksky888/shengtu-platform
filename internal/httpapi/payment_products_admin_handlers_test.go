package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestAdminRechargeProductCreateUpdateAndArchive(t *testing.T) {
	resetAuthRateLimiterForTest()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "sqlite:///"+filepath.ToSlash(filepath.Join(root, "data", "payment-products.db")))
	app, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() })
	auth := adminAuthHeader(t, app)

	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", auth)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		return res
	}

	created := request(http.MethodPost, "/api/admin/recharge-products", `{"sku":"credits-100","name":"100 积分","amount_fen":400,"credits":100,"enabled":true,"sort_order":1,"product_type":"credits"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	var createBody struct {
		Item struct {
			ID string `json:"id"`
		} `json:"item"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &createBody); err != nil || createBody.Item.ID == "" {
		t.Fatalf("create body=%s err=%v", created.Body.String(), err)
	}

	path := "/api/admin/recharge-products/" + createBody.Item.ID
	updated := request(http.MethodPatch, path, `{"sku":"credits-100","name":"100 积分新名称","amount_fen":500,"credits":100,"enabled":true,"sort_order":2,"product_type":"credits"}`)
	if updated.Code != http.StatusOK || !strings.Contains(updated.Body.String(), "100 积分新名称") {
		t.Fatalf("update status=%d body=%s", updated.Code, updated.Body.String())
	}
	deleted := request(http.MethodDelete, path, "")
	if deleted.Code != http.StatusOK || !strings.Contains(deleted.Body.String(), `"deleted":true`) {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	listed := request(http.MethodGet, "/api/admin/recharge-products", "")
	if listed.Code != http.StatusOK || strings.Contains(listed.Body.String(), createBody.Item.ID) {
		t.Fatalf("list after delete status=%d body=%s", listed.Code, listed.Body.String())
	}
	public := request(http.MethodGet, "/api/payment/products", "")
	if public.Code != http.StatusOK || strings.Contains(public.Body.String(), createBody.Item.ID) {
		t.Fatalf("public list after delete status=%d body=%s", public.Code, public.Body.String())
	}
	secondDelete := request(http.MethodDelete, path, "")
	if secondDelete.Code != http.StatusNotFound {
		t.Fatalf("second delete status=%d body=%s", secondDelete.Code, secondDelete.Body.String())
	}
}
