package service

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestAlipayProviderPrepayAgainstSignedGateway(t *testing.T) {
	applicationKey := generateRSAKey(t)
	platformKey := generateRSAKey(t)
	gateway := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("method = %s", request.Method)
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		verifyAlipayGatewayRequest(t, request.PostForm, &applicationKey.PublicKey)
		if request.PostForm.Get("app_id") != "test-app" || request.PostForm.Get("method") != "alipay.trade.precreate" || request.PostForm.Get("sign_type") != "RSA2" {
			t.Fatalf("unexpected gateway form: %#v", request.PostForm)
		}
		if request.PostForm.Get("notify_url") != "https://pay.example.test/api/payment/alipay/notify/channel/version" {
			t.Fatalf("notify_url = %q", request.PostForm.Get("notify_url"))
		}
		var biz map[string]any
		if err := json.Unmarshal([]byte(request.PostForm.Get("biz_content")), &biz); err != nil {
			t.Fatal(err)
		}
		if biz["out_trade_no"] != "ST202608300001" || biz["total_amount"] != "12.34" || biz["subject"] != "1000 积分" || biz["seller_id"] != "2088000000000000" {
			t.Fatalf("unexpected biz_content: %#v", biz)
		}
		writeSignedAlipayResponse(t, response, platformKey, "alipay_trade_precreate_response", map[string]any{
			"code": "10000", "msg": "Success", "out_trade_no": "ST202608300001", "qr_code": "https://qr.alipay.test/order",
		})
	}))
	defer gateway.Close()

	provider := newAlipayProviderForTest(t, applicationKey, &platformKey.PublicKey, gateway)
	provider.now = func() time.Time { return time.Date(2026, 8, 30, 1, 0, 0, 0, time.UTC) }
	result, err := provider.Prepay(context.Background(), PaymentPrepayProviderInput{
		OutTradeNo: "ST202608300001", Description: "1000 积分", AmountFen: 1234,
		NotifyURL: "https://pay.example.test/api/payment/alipay/notify/channel/version",
		ExpiresAt: time.Date(2026, 8, 30, 1, 15, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Prepay() error = %v", err)
	}
	if result.CodeURL != "https://qr.alipay.test/order" || result.RequestID != "trace-test" {
		t.Fatalf("Prepay() result = %#v", result)
	}
}

func TestAlipayProviderRejectsGatewayFailureAndEmptyQRCode(t *testing.T) {
	for _, test := range []struct {
		name     string
		business map[string]any
		contains string
	}{
		{name: "gateway business error", business: map[string]any{"code": "40004", "msg": "Business Failed", "sub_code": "ACQ.ACCESS_FORBIDDEN"}, contains: "40004"},
		{name: "missing qr code", business: map[string]any{"code": "10000", "msg": "Success"}, contains: "qr_code"},
	} {
		t.Run(test.name, func(t *testing.T) {
			applicationKey := generateRSAKey(t)
			platformKey := generateRSAKey(t)
			gateway := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				if err := request.ParseForm(); err != nil {
					t.Fatal(err)
				}
				verifyAlipayGatewayRequest(t, request.PostForm, &applicationKey.PublicKey)
				writeSignedAlipayResponse(t, response, platformKey, "alipay_trade_precreate_response", test.business)
			}))
			defer gateway.Close()
			provider := newAlipayProviderForTest(t, applicationKey, &platformKey.PublicKey, gateway)
			provider.now = func() time.Time { return time.Date(2026, 8, 30, 1, 0, 0, 0, time.UTC) }
			_, err := provider.Prepay(context.Background(), PaymentPrepayProviderInput{OutTradeNo: "ST1", Description: "test", AmountFen: 1, ExpiresAt: provider.now().Add(15 * time.Minute)})
			if err == nil || !strings.Contains(err.Error(), test.contains) {
				t.Fatalf("Prepay() error = %v, want containing %q", err, test.contains)
			}
		})
	}
}

func TestAlipayProviderTreatsMissingTradeAsPendingAndCloseAsIdempotent(t *testing.T) {
	applicationKey := generateRSAKey(t)
	platformKey := generateRSAKey(t)
	gateway := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		verifyAlipayGatewayRequest(t, request.PostForm, &applicationKey.PublicKey)
		method := request.PostForm.Get("method")
		responseKey := "alipay_trade_query_response"
		if method == "alipay.trade.close" {
			responseKey = "alipay_trade_close_response"
		}
		writeSignedAlipayResponse(t, response, platformKey, responseKey, map[string]any{
			"code": "40004", "msg": "Business Failed", "sub_code": "ACQ.TRADE_NOT_EXIST", "sub_msg": "交易不存在",
		})
	}))
	defer gateway.Close()

	provider := newAlipayProviderForTest(t, applicationKey, &platformKey.PublicKey, gateway)
	result, err := provider.Query(context.Background(), "ST-MISSING", "")
	if err != nil {
		t.Fatal(err)
	}
	if !result.NotFound || result.TradeState != "NOTPAY" || result.OutTradeNo != "ST-MISSING" {
		t.Fatalf("missing trade result = %#v", result)
	}
	if err := provider.Close(context.Background(), "ST-MISSING", ""); err != nil {
		t.Fatalf("idempotent close failed: %v", err)
	}
}

func TestAlipayProviderDoesNotHideOtherQueryFailures(t *testing.T) {
	applicationKey := generateRSAKey(t)
	platformKey := generateRSAKey(t)
	gateway := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		writeSignedAlipayResponse(t, response, platformKey, "alipay_trade_query_response", map[string]any{
			"code": "40004", "msg": "Business Failed", "sub_code": "ACQ.ACCESS_FORBIDDEN", "sub_msg": "无权限",
		})
	}))
	defer gateway.Close()

	provider := newAlipayProviderForTest(t, applicationKey, &platformKey.PublicKey, gateway)
	if _, err := provider.Query(context.Background(), "ST-DENIED", ""); err == nil || !strings.Contains(err.Error(), "ACQ.ACCESS_FORBIDDEN") {
		t.Fatalf("Query() error = %v", err)
	}
}

func newAlipayProviderForTest(t *testing.T, applicationKey *rsa.PrivateKey, platformKey *rsa.PublicKey, gateway *httptest.Server) *alipayProvider {
	t.Helper()
	privateDER, err := x509.MarshalPKCS8PrivateKey(applicationKey)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(platformKey)
	if err != nil {
		t.Fatal(err)
	}
	providerValue, err := newAlipayProvider(paymentRuntimeCredentials{
		Provider: "alipay", AppID: "test-app", MerchantID: "2088000000000000", AlipayGateway: gateway.URL,
		AlipayPrivateKeyPEM: base64.StdEncoding.EncodeToString(privateDER),
		AlipayPublicKeyPEM:  base64.StdEncoding.EncodeToString(publicDER),
	})
	if err != nil {
		t.Fatal(err)
	}
	provider := providerValue.(*alipayProvider)
	provider.httpClient = gateway.Client()
	return provider
}

func verifyAlipayGatewayRequest(t *testing.T, values url.Values, publicKey *rsa.PublicKey) {
	t.Helper()
	signature, err := base64.StdEncoding.DecodeString(values.Get("sign"))
	if err != nil {
		t.Fatalf("decode request signature: %v", err)
	}
	digest := sha256.Sum256([]byte(alipaySignContent(values)))
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, digest[:], signature); err != nil {
		t.Fatalf("verify request signature: %v", err)
	}
}

func writeSignedAlipayResponse(t *testing.T, response http.ResponseWriter, privateKey *rsa.PrivateKey, responseKey string, business any) {
	t.Helper()
	raw, err := json.Marshal(business)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(raw)
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	response.Header().Set("Content-Type", "application/json")
	response.Header().Set("Alipay-Trace-Id", "trace-test")
	_, _ = fmt.Fprintf(response, `{"%s":%s,"sign":%q}`, responseKey, raw, base64.StdEncoding.EncodeToString(signature))
}

func generateRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return key
}
