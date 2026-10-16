package service

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
)

const defaultAlipayGateway = "https://openapi.alipay.com/gateway.do"

type alipayProvider struct {
	appID, merchantID, gateway string
	privateKey                 *rsa.PrivateKey
	publicKey                  *rsa.PublicKey
	httpClient                 *http.Client
	now                        func() time.Time
}

func newPaymentProvider(ctx context.Context, credentials paymentRuntimeCredentials) (PaymentProvider, error) {
	if credentials.Provider == "alipay" {
		return newAlipayProvider(credentials)
	}
	return newWechatPayProvider(ctx, credentials)
}

func newAlipayProvider(credentials paymentRuntimeCredentials) (PaymentProvider, error) {
	privateKey, err := parsePrivateKeyPEM(credentials.AlipayPrivateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("解析支付宝应用私钥: %w", err)
	}
	publicKey, err := parsePublicKeyPEM(credentials.AlipayPublicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("解析支付宝公钥: %w", err)
	}
	gateway := strings.TrimSpace(credentials.AlipayGateway)
	if gateway == "" {
		gateway = defaultAlipayGateway
	}
	parsed, err := url.Parse(gateway)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("支付宝网关地址无效")
	}
	return &alipayProvider{appID: credentials.AppID, merchantID: credentials.MerchantID, gateway: gateway, privateKey: privateKey, publicKey: publicKey, httpClient: &http.Client{Timeout: 30 * time.Second}, now: time.Now}, nil
}

func (p *alipayProvider) Prepay(ctx context.Context, input PaymentPrepayProviderInput) (PaymentPrepayProviderResult, error) {
	biz := map[string]any{
		"out_trade_no":    input.OutTradeNo,
		"total_amount":    formatFenAsYuan(input.AmountFen),
		"subject":         input.Description,
		"timeout_express": fmt.Sprintf("%dm", max(1, int(input.ExpiresAt.Sub(p.now()).Minutes()))),
	}
	if strings.TrimSpace(p.merchantID) != "" {
		biz["seller_id"] = strings.TrimSpace(p.merchantID)
	}
	var response alipayPrecreateResponse
	requestID, err := p.call(ctx, "alipay.trade.precreate", input.NotifyURL, biz, "alipay_trade_precreate_response", &response)
	if err != nil {
		return PaymentPrepayProviderResult{}, err
	}
	if err := response.check(); err != nil {
		return PaymentPrepayProviderResult{}, err
	}
	if strings.TrimSpace(response.QRCode) == "" {
		return PaymentPrepayProviderResult{}, errors.New("支付宝未返回 qr_code")
	}
	return PaymentPrepayProviderResult{CodeURL: strings.TrimSpace(response.QRCode), RequestID: requestID}, nil
}

func (p *alipayProvider) Query(ctx context.Context, outTradeNo, _ string) (PaymentResult, error) {
	var response alipayTradeResponse
	_, err := p.call(ctx, "alipay.trade.query", "", map[string]any{"out_trade_no": outTradeNo}, "alipay_trade_query_response", &response)
	if err != nil {
		return PaymentResult{}, err
	}
	if err := response.check(); err != nil {
		if isAlipayTradeNotExist(response.alipayBaseResponse) {
			return PaymentResult{
				Provider: storage.PaymentProviderAlipay, OutTradeNo: outTradeNo,
				AppID: p.appID, MerchantID: p.merchantID, TradeState: "NOTPAY",
				TradeStateDesc: "交易尚未创建（ACQ.TRADE_NOT_EXIST）", Currency: "CNY", NotFound: true,
			}, nil
		}
		return PaymentResult{}, err
	}
	amount, err := parseAlipayAmount(response.TotalAmount)
	if err != nil {
		return PaymentResult{}, fmt.Errorf("支付宝查单金额无效: %w", err)
	}
	state := normalizeAlipayTradeState(response.TradeStatus)
	successTime := ""
	if response.SendPayDate != "" {
		successTime, err = normalizeAlipayTime(response.SendPayDate)
		if err != nil {
			return PaymentResult{}, err
		}
	}
	return PaymentResult{Provider: "alipay", OutTradeNo: response.OutTradeNo, TransactionID: response.TradeNo, AppID: p.appID, MerchantID: p.merchantID, TradeState: state, TradeStateDesc: response.TradeStatus, Currency: "CNY", SuccessTime: successTime, AmountFen: amount}, nil
}

func (p *alipayProvider) Close(ctx context.Context, outTradeNo, _ string) error {
	var response alipayTradeResponse
	_, err := p.call(ctx, "alipay.trade.close", "", map[string]any{"out_trade_no": outTradeNo}, "alipay_trade_close_response", &response)
	if err != nil {
		return err
	}
	if err := response.check(); err != nil && !isAlipayTradeNotExist(response.alipayBaseResponse) {
		return err
	}
	return nil
}

type alipayBaseResponse struct {
	Code    string `json:"code"`
	Msg     string `json:"msg"`
	SubCode string `json:"sub_code"`
	SubMsg  string `json:"sub_msg"`
}
type alipayPrecreateResponse struct {
	alipayBaseResponse
	QRCode     string `json:"qr_code"`
	OutTradeNo string `json:"out_trade_no"`
}
type alipayTradeResponse struct {
	alipayBaseResponse
	TradeNo     string `json:"trade_no"`
	OutTradeNo  string `json:"out_trade_no"`
	TradeStatus string `json:"trade_status"`
	TotalAmount string `json:"total_amount"`
	SendPayDate string `json:"send_pay_date"`
}

func isAlipayTradeNotExist(response alipayBaseResponse) bool {
	return strings.EqualFold(strings.TrimSpace(response.Code), "40004") &&
		strings.EqualFold(strings.TrimSpace(response.SubCode), "ACQ.TRADE_NOT_EXIST")
}

func (r alipayBaseResponse) check() error {
	if r.Code == "10000" {
		return nil
	}
	detail := strings.TrimSpace(strings.Join([]string{r.Msg, r.SubCode, r.SubMsg}, " "))
	if detail == "" {
		detail = "未知错误"
	}
	return fmt.Errorf("支付宝接口返回 %s: %s", r.Code, detail)
}

func (p *alipayProvider) call(ctx context.Context, method, notifyURL string, biz any, responseKey string, target any) (string, error) {
	bizJSON, err := json.Marshal(biz)
	if err != nil {
		return "", err
	}
	values := url.Values{
		"app_id": {p.appID}, "method": {method}, "format": {"JSON"}, "charset": {"utf-8"},
		"sign_type": {"RSA2"}, "timestamp": {p.now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")},
		"version": {"1.0"}, "biz_content": {string(bizJSON)},
	}
	if notifyURL != "" {
		values.Set("notify_url", notifyURL)
	}
	signature, err := signAlipayValues(values, p.privateKey)
	if err != nil {
		return "", err
	}
	values.Set("sign", signature)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.gateway, strings.NewReader(values.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
	response, err := p.httpClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("支付宝网关 HTTP %d", response.StatusCode)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(body, &envelope); err != nil {
		return "", fmt.Errorf("解析支付宝响应: %w", err)
	}
	raw, ok := envelope[responseKey]
	if !ok || len(raw) == 0 {
		return "", errors.New("支付宝响应缺少业务数据")
	}
	var sign string
	if value, ok := envelope["sign"]; ok {
		_ = json.Unmarshal(value, &sign)
	}
	if err := verifyAlipaySignature(raw, sign, p.publicKey); err != nil {
		return "", err
	}
	if err := json.Unmarshal(raw, target); err != nil {
		return "", fmt.Errorf("解析支付宝业务响应: %w", err)
	}
	return strings.TrimSpace(response.Header.Get("Alipay-Trace-Id")), nil
}

func signAlipayValues(values url.Values, key *rsa.PrivateKey) (string, error) {
	digest := sha256.Sum256([]byte(alipaySignContent(values)))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

func verifyAlipaySignature(content []byte, encoded string, key *rsa.PublicKey) error {
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil || len(signature) == 0 {
		return errors.New("支付宝签名格式无效")
	}
	digest := sha256.Sum256(content)
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature); err != nil {
		return errors.New("支付宝签名验证失败")
	}
	return nil
}

func alipaySignContent(values url.Values) string {
	keys := make([]string, 0, len(values))
	for key, entries := range values {
		if key != "sign" && len(entries) > 0 && entries[0] != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	var buffer bytes.Buffer
	for index, key := range keys {
		if index > 0 {
			buffer.WriteByte('&')
		}
		buffer.WriteString(key)
		buffer.WriteByte('=')
		buffer.WriteString(values.Get(key))
	}
	return buffer.String()
}

func formatFenAsYuan(amount int64) string { return fmt.Sprintf("%d.%02d", amount/100, amount%100) }

func parseAlipayAmount(raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	parts := strings.Split(raw, ".")
	if len(parts) > 2 || len(parts) == 0 || parts[0] == "" {
		return 0, errors.New("金额格式无效")
	}
	yuan, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || yuan < 0 {
		return 0, errors.New("金额格式无效")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 2 {
		return 0, errors.New("金额精度超过分")
	}
	fraction += strings.Repeat("0", 2-len(fraction))
	fen, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return 0, errors.New("金额格式无效")
	}
	return yuan*100 + fen, nil
}

func normalizeAlipayTradeState(state string) string {
	switch strings.ToUpper(strings.TrimSpace(state)) {
	case "TRADE_SUCCESS", "TRADE_FINISHED":
		return "SUCCESS"
	case "TRADE_CLOSED":
		return "CLOSED"
	default:
		return "NOTPAY"
	}
}

func normalizeAlipayTime(raw string) (string, error) {
	location := time.FixedZone("CST", 8*3600)
	parsed, err := time.ParseInLocation("2006-01-02 15:04:05", strings.TrimSpace(raw), location)
	if err != nil {
		return "", errors.New("支付宝支付时间无效")
	}
	return parsed.UTC().Format(time.RFC3339Nano), nil
}
