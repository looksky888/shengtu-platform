package service

import (
	"compress/gzip"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/validators"
	"github.com/wechatpay-apiv3/wechatpay-go/core/consts"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
)

type wechatPayProvider struct{ api native.NativeApiService }

type wechatPayBillProvider struct {
	client         *core.Client
	downloadClient *core.Client
}

const maxWechatTradeBillBytes int64 = 512 << 20

func newWechatPayProvider(ctx context.Context, credentials paymentRuntimeCredentials) (PaymentProvider, error) {
	privateKey, err := parsePrivateKeyPEM(credentials.MerchantPrivateKeyPEM)
	if err != nil {
		return nil, err
	}
	publicKey, err := parsePublicKeyPEM(credentials.WechatPayPublicKeyPEM)
	if err != nil {
		return nil, err
	}
	client, err := core.NewClient(ctx, option.WithWechatPayPublicKeyAuthCipher(credentials.MerchantID, credentials.MerchantCertSerial, privateKey, credentials.WechatPayPublicKeyID, publicKey))
	if err != nil {
		return nil, err
	}
	return &wechatPayProvider{api: native.NativeApiService{Client: client}}, nil
}

func newWechatPayBillProvider(ctx context.Context, credentials paymentRuntimeCredentials) (PaymentBillProvider, error) {
	privateKey, err := parsePrivateKeyPEM(credentials.MerchantPrivateKeyPEM)
	if err != nil {
		return nil, err
	}
	publicKey, err := parsePublicKeyPEM(credentials.WechatPayPublicKeyPEM)
	if err != nil {
		return nil, err
	}
	httpClient := &http.Client{Timeout: 5 * time.Minute}
	client, err := core.NewClient(ctx,
		option.WithWechatPayPublicKeyAuthCipher(credentials.MerchantID, credentials.MerchantCertSerial, privateKey, credentials.WechatPayPublicKeyID, publicKey),
		option.WithHTTPClient(httpClient),
	)
	if err != nil {
		return nil, err
	}
	return &wechatPayBillProvider{
		client: client, downloadClient: core.NewClientWithValidator(client, &validators.NullValidator{}),
	}, nil
}

// errPaymentBillNotFound reports that WeChat has no bill file for the requested
// date and type. It is a normal outcome (a day without a single refund) and
// must not be confused with a failed reconciliation.
var errPaymentBillNotFound = errors.New("微信交易账单不存在")

// wechatBillNotExist classifies the SDK error structurally instead of matching
// response text: 404 / NO_BILL_EXIST is the "no bill for this date" answer.
func wechatBillNotExist(err error) bool {
	var apiErr *core.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	return apiErr.StatusCode == http.StatusNotFound || strings.EqualFold(strings.TrimSpace(apiErr.Code), "NO_BILL_EXIST")
}

func (p *wechatPayBillProvider) DownloadTradeBill(ctx context.Context, billDate, billType string, target io.Writer) (PaymentBillDownload, error) {
	billType = strings.ToUpper(strings.TrimSpace(billType))
	if billType != paymentBillTypeSuccess && billType != paymentBillTypeRefund {
		return PaymentBillDownload{}, errors.New("微信交易账单类型无效")
	}
	if p == nil || p.client == nil || p.downloadClient == nil || target == nil {
		return PaymentBillDownload{}, errors.New("微信交易账单下载器未就绪")
	}
	query := url.Values{"bill_date": {billDate}, "bill_type": {billType}, "tar_type": {"GZIP"}}
	result, err := p.client.Get(ctx, "https://api.mch.weixin.qq.com/v3/bill/tradebill?"+query.Encode())
	if err != nil {
		if wechatBillNotExist(err) {
			return PaymentBillDownload{}, errPaymentBillNotFound
		}
		return PaymentBillDownload{}, fmt.Errorf("申请微信交易账单: %w", err)
	}
	var metadata struct {
		HashType    string `json:"hash_type"`
		HashValue   string `json:"hash_value"`
		DownloadURL string `json:"download_url"`
	}
	if result == nil || result.Response == nil {
		return PaymentBillDownload{}, errors.New("申请微信交易账单未返回响应")
	}
	if err := json.NewDecoder(result.Response.Body).Decode(&metadata); err != nil {
		_ = result.Response.Body.Close()
		return PaymentBillDownload{}, fmt.Errorf("解析微信交易账单响应: %w", err)
	}
	_ = result.Response.Body.Close()
	metadata.HashType = strings.ToUpper(strings.TrimSpace(metadata.HashType))
	metadata.HashValue = strings.ToLower(strings.TrimSpace(metadata.HashValue))
	if metadata.HashType != "SHA1" || len(metadata.HashValue) != sha1.Size*2 {
		return PaymentBillDownload{}, errors.New("微信交易账单摘要格式无效")
	}
	if err := validateWechatBillDownloadURL(metadata.DownloadURL); err != nil {
		return PaymentBillDownload{}, err
	}
	download, err := p.downloadClient.Get(ctx, metadata.DownloadURL)
	if err != nil {
		return PaymentBillDownload{}, fmt.Errorf("下载微信交易账单: %w", err)
	}
	if download == nil || download.Response == nil || download.Response.Body == nil {
		return PaymentBillDownload{}, errors.New("下载微信交易账单未返回文件")
	}
	defer download.Response.Body.Close()
	hash := sha1.New()
	compressed := &io.LimitedReader{R: download.Response.Body, N: maxWechatTradeBillBytes + 1}
	decompressed, err := gzip.NewReader(compressed)
	if err != nil {
		return PaymentBillDownload{}, fmt.Errorf("解压微信交易账单: %w", err)
	}
	defer decompressed.Close()
	limited := &io.LimitedReader{R: decompressed, N: maxWechatTradeBillBytes + 1}
	written, err := io.Copy(io.MultiWriter(target, hash), limited)
	if err != nil {
		return PaymentBillDownload{}, fmt.Errorf("写入微信交易账单: %w", err)
	}
	if written > maxWechatTradeBillBytes || compressed.N == 0 {
		return PaymentBillDownload{}, errors.New("微信交易账单超过 512 MiB 限制")
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != metadata.HashValue {
		return PaymentBillDownload{}, errors.New("微信交易账单 SHA1 校验失败")
	}
	return PaymentBillDownload{HashType: metadata.HashType, HashValue: actual, Bytes: written}, nil
}

func validateWechatBillDownloadURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() != "api.mch.weixin.qq.com" || !strings.HasPrefix(parsed.EscapedPath(), "/v3/billdownload/") || parsed.User != nil {
		return errors.New("微信交易账单下载地址无效")
	}
	return nil
}

func (p *wechatPayProvider) Query(ctx context.Context, outTradeNo, merchantID string) (PaymentResult, error) {
	transaction, _, err := p.api.QueryOrderByOutTradeNo(ctx, native.QueryOrderByOutTradeNoRequest{OutTradeNo: core.String(outTradeNo), Mchid: core.String(merchantID)})
	if err != nil {
		return PaymentResult{}, err
	}
	if transaction == nil {
		return PaymentResult{}, errors.New("微信支付查单未返回订单")
	}
	result := PaymentResult{Provider: "wechatpay", OutTradeNo: stringValue(transaction.OutTradeNo), TransactionID: stringValue(transaction.TransactionId), AppID: stringValue(transaction.Appid), MerchantID: stringValue(transaction.Mchid), TradeState: stringValue(transaction.TradeState), TradeStateDesc: stringValue(transaction.TradeStateDesc), SuccessTime: stringValue(transaction.SuccessTime), Currency: "CNY"}
	if transaction.Amount != nil {
		result.AmountFen = int64Value(transaction.Amount.Total)
		if currency := stringValue(transaction.Amount.Currency); currency != "" {
			result.Currency = currency
		}
	}
	return result, nil
}

func (p *wechatPayProvider) Close(ctx context.Context, outTradeNo, merchantID string) error {
	_, err := p.api.CloseOrder(ctx, native.CloseOrderRequest{
		OutTradeNo: core.String(outTradeNo),
		Mchid:      core.String(merchantID),
	})
	return err
}

func (p *wechatPayProvider) Prepay(ctx context.Context, input PaymentPrepayProviderInput) (PaymentPrepayProviderResult, error) {
	resp, result, err := p.api.Prepay(ctx, native.PrepayRequest{Appid: core.String(input.AppID), Mchid: core.String(input.MerchantID), Description: core.String(input.Description), OutTradeNo: core.String(input.OutTradeNo), TimeExpire: &input.ExpiresAt, NotifyUrl: core.String(input.NotifyURL), Amount: &native.Amount{Total: core.Int64(input.AmountFen), Currency: core.String("CNY")}})
	if err != nil {
		return PaymentPrepayProviderResult{}, err
	}
	if resp == nil || resp.CodeUrl == nil || strings.TrimSpace(*resp.CodeUrl) == "" {
		return PaymentPrepayProviderResult{}, errors.New("微信支付未返回 code_url")
	}
	requestID := ""
	if result != nil && result.Response != nil {
		requestID = strings.TrimSpace(result.Response.Header.Get(consts.RequestID))
	}
	return PaymentPrepayProviderResult{CodeURL: strings.TrimSpace(*resp.CodeUrl), RequestID: requestID}, nil
}
