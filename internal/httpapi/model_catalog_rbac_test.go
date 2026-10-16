package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDefaultUserCanReadModelCatalog(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, token, err := app.auth.RegisterPasswordUser("model-user", "Password123", "Model User")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/model-catalog", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("model catalog status = %d body = %s", res.Code, res.Body.String())
	}
}
