package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPaymentEndpointsRequireAuthAndDatabase(t *testing.T) {
	app := newTestApp(t)
	t.Cleanup(func() { _ = app.Close() })
	req := httptest.NewRequest(http.MethodGet, "/api/payment/products", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated products status=%d body=%s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/payment/products", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("JSON backend products status=%d body=%s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodPost, "/api/payment/orders", strings.NewReader(`{"product_id":"p1"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("JSON backend order status=%d body=%s", res.Code, res.Body.String())
	}
}

func TestCancelPaymentEndpointRequiresAuthAndDatabase(t *testing.T) {
	app := newTestApp(t)
	t.Cleanup(func() { _ = app.Close() })
	for _, authenticated := range []bool{false, true} {
		req := httptest.NewRequest(http.MethodPost, "/api/payment/orders/test-order/cancel", nil)
		want := http.StatusUnauthorized
		if authenticated {
			req.Header.Set("Authorization", adminAuthHeader(t, app))
			want = http.StatusServiceUnavailable
		}
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("cancel status=%d want=%d", res.Code, want)
		}
	}
}
