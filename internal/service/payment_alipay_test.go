package service

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"testing"
	"time"
)

func TestAlipayAmountFormattingAndParsing(t *testing.T) {
	for _, test := range []struct {
		fen  int64
		yuan string
	}{
		{0, "0.00"}, {1, "0.01"}, {123, "1.23"}, {10000, "100.00"},
	} {
		if got := formatFenAsYuan(test.fen); got != test.yuan {
			t.Fatalf("format(%d) = %q, want %q", test.fen, got, test.yuan)
		}
		got, err := parseAlipayAmount(test.yuan)
		if err != nil || got != test.fen {
			t.Fatalf("parse(%q) = %d, %v", test.yuan, got, err)
		}
	}
	for _, raw := range []string{"", "1.001", "-1.00", "1.2.3"} {
		if _, err := parseAlipayAmount(raw); err == nil {
			t.Fatalf("invalid amount %q accepted", raw)
		}
	}
}

func TestAlipaySignContentAndNotificationSignature(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	values := url.Values{"z": {"last"}, "a": {"first"}, "sign": {"ignored"}, "empty": {""}}
	if got := alipaySignContent(values); got != "a=first&z=last" {
		t.Fatalf("sign content = %q", got)
	}
	callback := url.Values{"app_id": {"app"}, "out_trade_no": {"trade"}, "total_amount": {"1.00"}, "trade_status": {"TRADE_SUCCESS"}, "trade_no": {"tx"}, "seller_id": {"seller"}, "sign_type": {"RSA2"}}
	callback.Set("notify_time", "2026-08-30 09:00:00")
	digest := sha256.Sum256([]byte(alipayNotificationSignContent(callback)))
	rawSignature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	callback.Set("sign", base64.StdEncoding.EncodeToString(rawSignature))
	if err := verifyAlipayNotification(callback, callback.Get("sign"), &key.PublicKey); err != nil {
		t.Fatalf("valid callback rejected: %v", err)
	}
	callback.Set("total_amount", "9.00")
	if err := verifyAlipayNotification(callback, callback.Get("sign"), &key.PublicKey); err == nil {
		t.Fatal("tampered callback accepted")
	}
}

func TestAlipayNotificationTimestampWindow(t *testing.T) {
	now := time.Date(2026, 8, 30, 1, 0, 0, 0, time.UTC)
	if err := validateAlipayNotifyTimestamp("2026-08-29 07:00:00", now); err != nil {
		t.Fatalf("26 hour old notification rejected: %v", err)
	}
	if err := validateAlipayNotifyTimestamp("2026-08-29 06:59:59", now); err == nil {
		t.Fatal("old notification accepted")
	}
	if err := validateAlipayNotifyTimestamp("2026-08-30 09:05:01", now); err == nil {
		t.Fatal("future notification accepted")
	}
	if err := validateAlipayNotifyTimestamp("", now); err == nil {
		t.Fatal("missing notification timestamp accepted")
	}
}

func TestNormalizeAlipayTradeState(t *testing.T) {
	if normalizeAlipayTradeState("TRADE_SUCCESS") != "SUCCESS" || normalizeAlipayTradeState("TRADE_FINISHED") != "SUCCESS" || normalizeAlipayTradeState("TRADE_CLOSED") != "CLOSED" || normalizeAlipayTradeState("WAIT_BUYER_PAY") != "NOTPAY" {
		t.Fatal("unexpected state mapping")
	}
}
