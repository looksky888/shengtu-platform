package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
)

func parseWechatPayNotification(ctx context.Context, request *http.Request, credentials paymentRuntimeCredentials) (*notify.Request, PaymentResult, string, error) {
	publicKey, err := parsePublicKeyPEM(credentials.WechatPayPublicKeyPEM)
	if err != nil {
		return nil, PaymentResult{}, "", err
	}
	handler, err := notify.NewRSANotifyHandler(credentials.APIv3Key, verifiers.NewSHA256WithRSAPubkeyVerifier(credentials.WechatPayPublicKeyID, *publicKey))
	if err != nil {
		return nil, PaymentResult{}, "", err
	}
	transaction := new(payments.Transaction)
	notification, err := handler.ParseNotifyRequest(ctx, request, transaction)
	if err != nil {
		return nil, PaymentResult{}, "", err
	}
	result := PaymentResult{Provider: storage.PaymentProviderWechatPay, OutTradeNo: stringValue(transaction.OutTradeNo), TransactionID: stringValue(transaction.TransactionId), AppID: stringValue(transaction.Appid), MerchantID: stringValue(transaction.Mchid), TradeState: stringValue(transaction.TradeState), TradeStateDesc: stringValue(transaction.TradeStateDesc), SuccessTime: stringValue(transaction.SuccessTime), Currency: "CNY"}
	if transaction.Amount != nil {
		result.AmountFen = int64Value(transaction.Amount.Total)
		if currency := stringValue(transaction.Amount.Currency); currency != "" {
			result.Currency = currency
		}
	}
	return notification, result, notification.Resource.Plaintext, nil
}

func paymentEventFromResult(notification *notify.Request, result PaymentResult, versionID, orderID, plaintext string, now time.Time) storage.PaymentEventRecord {
	digest := sha256.Sum256([]byte(plaintext))
	receivedAt := now.Format(time.RFC3339Nano)
	return storage.PaymentEventRecord{ID: notification.ID, Provider: result.Provider, ProviderEventID: notification.ID, ChannelVersionID: versionID, EventType: notification.EventType, OrderID: orderID, OutTradeNo: result.OutTradeNo, TransactionID: result.TransactionID, AppID: result.AppID, MerchantID: result.MerchantID, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc, AmountFen: result.AmountFen, Currency: result.Currency, SuccessTime: result.SuccessTime, ResourceDigest: hex.EncodeToString(digest[:]), Status: storage.PaymentEventStatusPending, ReceivedAt: receivedAt}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
func int64Value(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}
