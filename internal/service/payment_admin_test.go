package service

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestPaymentAdminServiceValidatesAndHidesCredentials(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	key := []byte(strings.Repeat("k", 32))
	merchantPrivateKey, platformPublicKey := paymentTestPEMs(t)
	svc := NewPaymentAdminService(backend, key)
	svc.now = func() time.Time { return time.Date(2026, 8, 30, 1, 2, 3, 0, time.UTC) }
	channel, version, err := svc.CreateChannel(PaymentChannelInput{
		Code: "wechat", Name: "微信支付", Provider: "wechatpay", PaymentMethod: "native",
		Enabled: true, IsDefault: true, NotifyBaseURL: "https://pay.example.test/notify", OrderExpireMinutes: 15,
	}, PaymentCredentialsInput{
		AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial-1",
		MerchantPrivateKeyPEM: merchantPrivateKey, APIv3Key: strings.Repeat("a", 32),
		VerifyMode: "platform_public_key", WechatPayPublicKeyID: "platform-1", WechatPayPublicKeyPEM: platformPublicKey,
	}, "admin")
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	if channel.ActiveVersionID != version.ID || !version.HasAPIv3Key || !version.HasMerchantPrivateKey || !version.HasWechatPayPublicKey {
		t.Fatalf("created public config = %#v %#v", channel, version)
	}
	if strings.Contains(string(mustJSON(t, version)), "BEGIN") || strings.Contains(string(mustJSON(t, version)), strings.Repeat("a", 32)) {
		t.Fatal("public version leaked credential material")
	}
	if _, _, err := svc.CreateChannel(PaymentChannelInput{Code: "bad", Name: "bad", Provider: "wechatpay", PaymentMethod: "native", NotifyBaseURL: "http://insecure.test"}, PaymentCredentialsInput{}, "admin"); err == nil {
		t.Fatal("insecure notify URL accepted")
	}
	if _, _, err := svc.CreateChannel(PaymentChannelInput{Code: "private", Name: "private", Provider: "wechatpay", PaymentMethod: "native", NotifyBaseURL: "https://127.0.0.1/notify"}, PaymentCredentialsInput{}, "admin"); err == nil {
		t.Fatal("private notify URL accepted")
	}
	if _, _, err := svc.CreateChannel(PaymentChannelInput{Code: "bad-key", Name: "bad-key", Provider: "wechatpay", PaymentMethod: "native", NotifyBaseURL: "https://pay.example.test/notify"}, PaymentCredentialsInput{AppID: "wx", MerchantID: "mch", MerchantCertSerial: "serial", MerchantPrivateKeyPEM: merchantPrivateKey, APIv3Key: "short", WechatPayPublicKeyID: "platform", WechatPayPublicKeyPEM: platformPublicKey}, "admin"); err == nil {
		t.Fatal("short API v3 key accepted")
	}
	rotated, err := svc.RotateChannel(channel.ID, PaymentCredentialsInput{
		AppID: "wx-app", MerchantID: "mch-1", MerchantCertSerial: "serial-2", MerchantPrivateKeyPEM: merchantPrivateKey,
		APIv3Key: strings.Repeat("b", 32), WechatPayPublicKeyID: "platform-2", WechatPayPublicKeyPEM: platformPublicKey,
	}, "admin")
	if err != nil {
		t.Fatalf("RotateChannel() error = %v", err)
	}
	if rotated.Version != 2 || rotated.Status != "active" {
		t.Fatalf("rotated version = %#v", rotated)
	}
	old, err := backend.LoadPaymentChannelVersion(version.ID)
	if err != nil || old.Status != "archived" {
		t.Fatalf("old version = %#v, err = %v", old, err)
	}
}

func TestPaymentAdminServiceCreatesAlipayChannel(t *testing.T) {
	dataDir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "payment.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	key := []byte(strings.Repeat("p", 32))
	applicationPrivateKey, alipayPublicKey := paymentTestPEMs(t)
	svc := NewPaymentAdminService(backend, key)
	channel, version, err := svc.CreateChannel(PaymentChannelInput{
		Code: "alipay", Name: "支付宝", Provider: storage.PaymentProviderAlipay, PaymentMethod: storage.PaymentMethodNative,
		Enabled: true, IsDefault: true, NotifyBaseURL: "https://pay.example.test/notify", OrderExpireMinutes: 15,
	}, PaymentCredentialsInput{
		AppID: "2021000000000000", AlipayPrivateKeyPEM: applicationPrivateKey, AlipayPublicKeyPEM: alipayPublicKey,
		AlipayGateway: "https://openapi.alipay.com/gateway.do", AlipaySellerID: "2088000000000000",
	}, "admin")
	if err != nil {
		t.Fatalf("CreateChannel(alipay) error = %v", err)
	}
	if channel.Provider != storage.PaymentProviderAlipay || version.AppID != "2021000000000000" || version.MerchantID != "2088000000000000" || !version.HasAlipayPrivateKey || !version.HasAlipayPublicKey {
		t.Fatalf("alipay public config = %#v %#v", channel, version)
	}
	if strings.Contains(string(mustJSON(t, version)), "PRIVATE KEY") || strings.Contains(string(mustJSON(t, version)), "PUBLIC KEY") {
		t.Fatal("alipay credential material leaked")
	}
	if _, _, err := svc.CreateChannel(PaymentChannelInput{Code: "invalid-alipay", Name: "支付宝", Provider: storage.PaymentProviderAlipay, PaymentMethod: storage.PaymentMethodNative, NotifyBaseURL: "https://pay.example.test/notify"}, PaymentCredentialsInput{AppID: "app", AlipayPrivateKeyPEM: "short", AlipayPublicKeyPEM: alipayPublicKey}, "admin"); err == nil {
		t.Fatal("invalid alipay private key accepted")
	}
}

func paymentTestPEMs(t *testing.T) (string, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER})),
		string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestPaymentAdminServiceRequiresDatabase(t *testing.T) {
	dataDir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dataDir, "accounts.json"), filepath.Join(dataDir, "auth_keys.json"))
	svc, err := NewPaymentAdminServiceFromBackend(dataDir, backend)
	if err != nil {
		t.Fatal(err)
	}
	if svc == nil || svc.Available() {
		t.Fatal("JSON backend should not expose payment admin service")
	}
	if _, err := os.Stat(filepath.Join(dataDir, "payment_settings.secret")); err == nil {
		t.Fatal("unsupported backend created payment key")
	}
}

func TestPaymentCredentialFieldsAreSanitizedFromAuditValues(t *testing.T) {
	payload := map[string]any{
		"api_v3_key":               strings.Repeat("a", 32),
		"merchant_private_key_pem": "private-pem",
		"wechatpay_public_key_pem": "public-pem-material",
	}
	sanitized := SanitizeLogValue(payload).(map[string]any)
	for key, raw := range payload {
		if sanitized[key] == raw {
			t.Fatalf("%s was not sanitized", key)
		}
	}
}
