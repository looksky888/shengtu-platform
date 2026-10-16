package service

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
)

func parseAlipayNotification(request *http.Request, publicKey *rsa.PublicKey, now time.Time) (PaymentResult, string, error) {
	if request == nil || request.Body == nil {
		return PaymentResult{}, "", errors.New("支付宝回调请求为空")
	}
	if err := request.ParseForm(); err != nil {
		return PaymentResult{}, "", errors.New("解析支付宝回调参数失败")
	}
	values := request.PostForm
	if err := validateAlipayNotifyTimestamp(values.Get("notify_time"), now); err != nil {
		return PaymentResult{}, "", err
	}
	if err := verifyAlipayNotification(values, values.Get("sign"), publicKey); err != nil {
		return PaymentResult{}, "", err
	}
	amount, err := parseYuanToFen(values.Get("total_amount"))
	if err != nil {
		return PaymentResult{}, "", err
	}
	state := normalizeAlipayTradeState(values.Get("trade_status"))
	successTime := ""
	if raw := strings.TrimSpace(values.Get("gmt_payment")); raw != "" {
		successTime, err = normalizeAlipayTime(raw)
		if err != nil {
			return PaymentResult{}, "", err
		}
	}
	eventID := strings.TrimSpace(values.Get("notify_id"))
	if eventID == "" {
		digest := sha256.Sum256([]byte(values.Get("out_trade_no") + "\x00" + values.Get("trade_no") + "\x00" + values.Get("notify_time")))
		eventID = hex.EncodeToString(digest[:])
	}
	return PaymentResult{Provider: storage.PaymentProviderAlipay, OutTradeNo: strings.TrimSpace(values.Get("out_trade_no")), TransactionID: strings.TrimSpace(values.Get("trade_no")), AppID: strings.TrimSpace(values.Get("app_id")), MerchantID: strings.TrimSpace(values.Get("seller_id")), TradeState: state, TradeStateDesc: strings.TrimSpace(values.Get("trade_status")), Currency: "CNY", SuccessTime: successTime, AmountFen: amount}, eventID, nil
}

func verifyAlipayNotification(values map[string][]string, encoded string, publicKey *rsa.PublicKey) error {
	if publicKey == nil || strings.TrimSpace(encoded) == "" {
		return errors.New("支付宝回调签名缺失")
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil || len(signature) == 0 {
		return errors.New("支付宝回调签名格式无效")
	}
	content := alipayNotificationSignContent(values)
	digest := sha256.Sum256([]byte(content))
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, digest[:], signature); err != nil {
		return errors.New("支付宝回调签名验证失败")
	}
	return nil
}

func alipayNotificationSignContent(values map[string][]string) string {
	keys := make([]string, 0, len(values))
	for key, entries := range values {
		if key != "sign" && key != "sign_type" && len(entries) > 0 && entries[0] != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	var builder strings.Builder
	for index, key := range keys {
		if index > 0 {
			builder.WriteByte('&')
		}
		builder.WriteString(key)
		builder.WriteByte('=')
		builder.WriteString(values[key][0])
	}
	return builder.String()
}

func normalizeAlipayNotifyTime(raw string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02 15:04:05", strings.TrimSpace(raw), time.FixedZone("CST", 8*3600))
}

// validateAlipayNotifyTimestamp limits replay of an otherwise valid signed
// notification. Alipay may retry notifications for a long period, so the
// window is deliberately wider than the short request-signature window; the
// event/order idempotency checks remain the authoritative duplicate guard.
func validateAlipayNotifyTimestamp(raw string, now time.Time) error {
	if strings.TrimSpace(raw) == "" {
		return errors.New("支付宝回调时间戳缺失")
	}
	parsed, err := normalizeAlipayNotifyTime(raw)
	if err != nil {
		return errors.New("支付宝回调时间戳无效")
	}
	delta := now.Sub(parsed)
	if delta < -5*time.Minute || delta > 26*time.Hour {
		return errors.New("支付宝回调时间戳已过期或来自未来")
	}
	return nil
}
