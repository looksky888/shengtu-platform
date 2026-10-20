package service

import (
	"context"
	"errors"
	"io"
	"time"
)

// PaymentCallbackHealthPublic is a small operational view of the callback
// inbox. It intentionally excludes provider payloads and credentials.
type PaymentCallbackHealthPublic struct {
	Available       bool   `json:"available"`
	Status          string `json:"status"`
	PendingEvents   int    `json:"pending_events"`
	FailedEvents    int    `json:"failed_events"`
	OldestPendingAt string `json:"oldest_pending_at,omitempty"`
	Error           string `json:"error,omitempty"`
}

type PaymentProvider interface {
	Prepay(context.Context, PaymentPrepayProviderInput) (PaymentPrepayProviderResult, error)
	Query(context.Context, string, string) (PaymentResult, error)
	Close(context.Context, string, string) error
}

// WeChat trade bill types. SUCCESS is the payment-side bill, REFUND the
// refund-side bill; both are reconciled so a merchant-side refund that never
// reached the local order shows up as a difference.
const (
	paymentBillTypeSuccess = "SUCCESS"
	paymentBillTypeRefund  = "REFUND"
)

type PaymentBillProvider interface {
	DownloadTradeBill(ctx context.Context, billDate, billType string, target io.Writer) (PaymentBillDownload, error)
}

type PaymentBillDownload struct {
	HashType  string
	HashValue string
	Bytes     int64
}

type PaymentPrepayProviderInput struct {
	AppID, MerchantID, Description, OutTradeNo, NotifyURL string
	AmountFen                                             int64
	ExpiresAt                                             time.Time
}

type PaymentPrepayProviderResult struct {
	CodeURL, RequestID string
}

type paymentRuntimeCredentials struct {
	Provider, AppID, MerchantID, MerchantCertSerial, MerchantPrivateKeyPEM, APIv3Key string
	WechatPayPublicKeyID, WechatPayPublicKeyPEM                                      string
	AlipayPrivateKeyPEM, AlipayPublicKeyPEM, AlipayGateway, AlipaySellerID           string
}

type PaymentOrderPublic struct {
	ID           string `json:"id"`
	ChannelID    string `json:"channel_id"`
	OutTradeNo   string `json:"out_trade_no"`
	ProductID    string `json:"product_id"`
	ProductName  string `json:"product_name"`
	AmountFen    int64  `json:"amount_fen"`
	Credits      int    `json:"credits"`
	ProductType  string `json:"product_type"`
	StorageDays  int    `json:"storage_days"`
	StorageBytes int64  `json:"storage_bytes"`
	Currency     string `json:"currency"`
	ExpiresAt    string `json:"expires_at"`
	Status       string `json:"status"`
	CodeURL      string `json:"code_url,omitempty"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

var (
	ErrPaymentOrderAlreadyPaid    = errors.New("支付订单已支付，不能取消")
	ErrPaymentOrderNotCancellable = errors.New("支付订单当前状态不可取消")
)

type PaymentResult struct {
	Provider, OutTradeNo, TransactionID, AppID, MerchantID, TradeState, TradeStateDesc, Currency, SuccessTime string
	AmountFen                                                                                                 int64
	// NotFound is set only when a provider query explicitly reports that the
	// trade has not been created yet. It is not a payment failure and carries no
	// amount, so the normal paid-result validation must be skipped.
	NotFound bool
}
