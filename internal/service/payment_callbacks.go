package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/google/uuid"
)

func (s *PaymentService) HandleWechatNotify(ctx context.Context, request *http.Request, channelID, versionID string) (bool, error) {
	if !s.Available() || s.credits == nil {
		return false, errors.New("支付到账服务尚未就绪")
	}
	if err := validateWechatNotifyTimestamp(request, s.now()); err != nil {
		return false, err
	}
	version, credentials, err := s.loadRuntimeCredentials(versionID)
	if err != nil {
		return false, err
	}
	if version.ChannelID != strings.TrimSpace(channelID) {
		return false, errors.New("支付回调渠道版本不匹配")
	}
	notify, result, plaintext, err := parseWechatPayNotification(ctx, request, credentials)
	if err != nil {
		return false, err
	}
	order, err := s.backend.LoadPaymentOrderByOutTradeNo(result.OutTradeNo)
	if err != nil {
		return false, err
	}
	event := paymentEventFromResult(notify, result, version.ID, order.ID, plaintext, s.now().UTC())
	return s.processPaymentEvent(event, result, order, version)
}

func (s *PaymentService) HandleAlipayNotify(ctx context.Context, request *http.Request, channelID, versionID string) (bool, error) {
	if !s.Available() || s.credits == nil {
		return false, errors.New("支付到账服务尚未就绪")
	}
	version, credentials, err := s.loadRuntimeCredentials(versionID)
	if err != nil {
		return false, err
	}
	if version.ChannelID != strings.TrimSpace(channelID) || credentials.Provider != storage.PaymentProviderAlipay {
		return false, errors.New("支付宝回调渠道版本不匹配")
	}
	publicKey, err := parsePublicKeyPEM(credentials.AlipayPublicKeyPEM)
	if err != nil {
		return false, err
	}
	result, eventID, err := parseAlipayNotification(request, publicKey, s.now())
	if err != nil {
		return false, err
	}
	if version.MerchantID == "" {
		result.MerchantID = result.AppID
	}
	order, err := s.backend.LoadPaymentOrderByOutTradeNo(result.OutTradeNo)
	if err != nil {
		return false, err
	}
	digest := sha256.Sum256([]byte(request.PostForm.Encode()))
	now := s.now().UTC()
	event := storage.PaymentEventRecord{ID: eventID, Provider: result.Provider, ProviderEventID: eventID, ChannelVersionID: version.ID, EventType: result.TradeStateDesc, OrderID: order.ID, OutTradeNo: result.OutTradeNo, TransactionID: result.TransactionID, AppID: result.AppID, MerchantID: result.MerchantID, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc, AmountFen: result.AmountFen, Currency: result.Currency, SuccessTime: result.SuccessTime, ResourceDigest: hex.EncodeToString(digest[:]), Status: storage.PaymentEventStatusPending, ReceivedAt: now.Format(time.RFC3339Nano)}
	return s.processPaymentEvent(event, result, order, version)
}

func (s *PaymentService) processPaymentEvent(event storage.PaymentEventRecord, result PaymentResult, order storage.PaymentOrderRecord, version storage.PaymentChannelVersionRecord) (bool, error) {
	unlock := s.lockPaymentOrder(order.ID)
	defer unlock()
	current, err := s.backend.LoadPaymentOrderByOutTradeNo(order.OutTradeNo)
	if err != nil {
		return false, err
	}
	order = current
	event.OrderID = order.ID
	shouldProcess, err := s.claimPaymentEvent(event)
	if err != nil {
		return false, err
	}
	if !shouldProcess {
		return false, nil
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	if err := validatePaymentResult(result, order, version); err != nil {
		_ = s.backend.UpdatePaymentEventStatus(event.ProviderEventID, storage.PaymentEventStatusFailed, err.Error(), now)
		return false, err
	}
	credited, err := s.completePaymentResult(order, result, version)
	if err != nil {
		_ = s.backend.UpdatePaymentEventStatus(event.ProviderEventID, storage.PaymentEventStatusFailed, err.Error(), now)
		return false, err
	}
	if err := s.backend.UpdatePaymentEventStatus(event.ProviderEventID, storage.PaymentEventStatusProcessed, "", now); err != nil {
		return credited, err
	}
	return credited, nil
}

func (s *PaymentService) claimPaymentEvent(event storage.PaymentEventRecord) (bool, error) {
	inserted, err := s.backend.InsertPaymentEvent(event)
	if err != nil {
		return false, err
	}
	if inserted {
		return true, nil
	}
	existing, err := s.backend.LoadPaymentEventByProviderEventID(event.ProviderEventID)
	if err != nil {
		return false, err
	}
	if err := validateRepeatedPaymentEvent(existing, event); err != nil {
		return false, err
	}
	return paymentEventShouldProcess(existing.Status)
}

func validateRepeatedPaymentEvent(existing, incoming storage.PaymentEventRecord) error {
	if existing.Provider != incoming.Provider ||
		existing.ChannelVersionID != incoming.ChannelVersionID ||
		existing.OutTradeNo != incoming.OutTradeNo ||
		existing.ResourceDigest != incoming.ResourceDigest {
		return errors.New("重复支付通知内容与已登记事件不一致")
	}
	return nil
}

func paymentEventShouldProcess(status string) (bool, error) {
	switch strings.TrimSpace(status) {
	case storage.PaymentEventStatusProcessed, storage.PaymentEventStatusIgnored:
		return false, nil
	case storage.PaymentEventStatusPending, storage.PaymentEventStatusFailed:
		return true, nil
	default:
		return false, fmt.Errorf("支付事件状态无效: %q", status)
	}
}

func (s *PaymentService) completePaymentResult(order storage.PaymentOrderRecord, result PaymentResult, version storage.PaymentChannelVersionRecord) (bool, error) {
	if result.Provider == "" {
		result.Provider = storage.PaymentProviderWechatPay
		if version.AlipayPrivateKeyCipher != "" {
			result.Provider = storage.PaymentProviderAlipay
		}
	}
	if err := validatePaymentResult(result, order, version); err != nil {
		return false, err
	}
	paidAt, _ := normalizePaymentSuccessTime(result.SuccessTime)
	merchantID := result.MerchantID
	if merchantID == "" {
		merchantID = result.AppID
	}
	if order.ProductTypeSnapshot == "cloud_storage" {
		backend, ok := s.backend.(storage.PaymentStorageBackend)
		if !ok {
			return false, errors.New("云存储权益存储后端尚未就绪")
		}
		completedAt := s.now().UTC().Format(time.RFC3339Nano)
		_, fulfilled, err := backend.CompletePaymentStorage(storage.PaymentStorageCompletion{
			OrderID: order.ID, Provider: result.Provider, TransactionID: result.TransactionID,
			MerchantID: merchantID, PaidAt: paidAt, CreditedAt: completedAt,
			TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc,
			Entitlement: storage.PaymentStorageEntitlementRecord{ID: uuid.NewString(), UserID: order.UserID,
				SourceOrderID: order.ID, ProductID: order.ProductID, StorageBytes: order.StorageBytesSnapshot,
				CreatedAt: completedAt, UpdatedAt: completedAt},
		})
		return fulfilled, err
	}
	_, _, credited, err := s.credits.CompletePaymentRecharge(PaymentRechargeCreditInput{OrderID: order.ID, Provider: result.Provider, UserID: order.UserID, Amount: order.CreditsSnapshot, MerchantID: merchantID, TransactionID: result.TransactionID, PaidAt: paidAt, TradeState: result.TradeState, TradeStateDesc: result.TradeStateDesc})
	return credited, err
}

func validatePaymentResult(result PaymentResult, order storage.PaymentOrderRecord, version storage.PaymentChannelVersionRecord) error {
	if result.TradeState != "SUCCESS" {
		return fmt.Errorf("支付状态不是 SUCCESS: %s", result.TradeState)
	}
	if err := validatePaymentQueryResult(result, order, version); err != nil {
		return err
	}
	if result.TransactionID == "" {
		return errors.New("支付交易号为空")
	}
	if order.Status == storage.PaymentOrderStatusSucceeded && order.TransactionID != result.TransactionID {
		return errors.New("支付交易号与已到账订单不匹配")
	}
	if order.ChannelVersionID != version.ID {
		return errors.New("支付订单凭据版本不匹配")
	}
	if _, err := normalizePaymentSuccessTime(result.SuccessTime); err != nil {
		return err
	}
	return nil
}

func normalizePaymentSuccessTime(value string) (string, error) {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return "", errors.New("支付成功时间无效")
	}
	return parsed.UTC().Format(time.RFC3339Nano), nil
}

func validatePaymentQueryResult(result PaymentResult, order storage.PaymentOrderRecord, version storage.PaymentChannelVersionRecord) error {
	if result.OutTradeNo == "" || result.OutTradeNo != order.OutTradeNo {
		return errors.New("支付商户订单号不匹配")
	}
	if result.AppID != version.AppID || (version.MerchantID != "" && result.MerchantID != version.MerchantID) {
		return errors.New("支付 AppID 或商户号不匹配")
	}
	if result.AmountFen != order.AmountFen || result.Currency != order.Currency {
		return errors.New("支付金额或币种不匹配")
	}
	if order.ChannelVersionID != version.ID {
		return errors.New("支付订单凭据版本不匹配")
	}
	return nil
}

func validateWechatNotifyTimestamp(request *http.Request, now time.Time) error {
	if request == nil {
		return errors.New("微信支付回调请求为空")
	}
	raw := strings.TrimSpace(request.Header.Get("Wechatpay-Timestamp"))
	seconds, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return errors.New("微信支付回调时间戳无效")
	}
	delta := now.Unix() - seconds
	if delta < 0 {
		delta = -delta
	}
	if delta > 300 {
		return errors.New("微信支付回调时间戳已过期")
	}
	return nil
}
