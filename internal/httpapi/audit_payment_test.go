package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPaymentCallbackAuditOmitsSignedPayload(t *testing.T) {
	for _, path := range []string{
		"/api/payment/wechat/notify/channel/order",
		"/api/payment/alipay/notify/channel/order",
	} {
		t.Run(path, func(t *testing.T) {
			body := "sign=private-signature&buyer_id=private-buyer&out_trade_no=order"
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

			if got := captureAuditRequestArgs(request); got != nil {
				t.Fatalf("captureAuditRequestArgs() = %#v, want nil", got)
			}
			remaining, err := io.ReadAll(request.Body)
			if err != nil {
				t.Fatal(err)
			}
			if string(remaining) != body {
				t.Fatalf("callback body changed: %q", remaining)
			}
		})
	}
}
