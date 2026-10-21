package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminSystemRestartRequestsGracefulShutdown(t *testing.T) {
	app := newTestApp(t)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/system/restart", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()

	app.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("restart status = %d body = %s", res.Code, res.Body.String())
	}
	select {
	case <-app.ShutdownRequested():
	default:
		t.Fatal("restart did not request graceful shutdown")
	}
	app.requestShutdown()
}
