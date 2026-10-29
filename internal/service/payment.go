package service

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/google/uuid"
)

type PaymentService struct {
	backend            storage.PaymentBackend
	key                []byte
	now                func() time.Time
	provider           func(context.Context, paymentRuntimeCredentials) (PaymentProvider, error)
	billProvider       func(context.Context, paymentRuntimeCredentials) (PaymentBillProvider, error)
	billDir            string
	credits            *CreditService
	recoveryStartOnce  sync.Once
	recoveryWG         sync.WaitGroup
	reconciliationWG   sync.WaitGroup
	reconciliationOnce sync.Once
	reconciliationMu   sync.Mutex
	reconciliationStop bool
	reconcileLocksMu   sync.Mutex
	reconcileLocks     map[string]*paymentOrderLock
}

func (s *PaymentService) startReconciliationWorker(work func()) bool {
	if s == nil || work == nil {
		return false
	}
	s.reconciliationMu.Lock()
	defer s.reconciliationMu.Unlock()
	if s.reconciliationStop {
		return false
	}
	s.reconciliationWG.Add(1)
	go func() {
		defer s.reconciliationWG.Done()
		work()
	}()
	return true
}

func NewPaymentServiceFromBackend(dataDir string, backend storage.Backend) (*PaymentService, error) {
	paymentBackend, ok := backend.(storage.PaymentBackend)
	if !ok {
		return &PaymentService{}, nil
	}
	key, err := loadOrCreatePaymentSettingsKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("初始化支付凭据密钥: %w", err)
	}
	return &PaymentService{
		backend: paymentBackend, key: key, now: time.Now, provider: newPaymentProvider,
		billProvider: newWechatPayBillProvider, billDir: filepath.Join(dataDir, "payment-bills"),
	}, nil
}

func (s *PaymentService) Available() bool {
	return s != nil && s.backend != nil && len(s.key) == 32 && s.provider != nil
}

// CallbackHealth reports durable callback inbox health without making any
// provider/network request. Legacy JSON backends explicitly report
// unavailable so operators can distinguish "no inbox" from an empty inbox.
func (s *PaymentService) CallbackHealth() PaymentCallbackHealthPublic {
	if s == nil || s.backend == nil {
		return PaymentCallbackHealthPublic{Status: "unavailable"}
	}
	healthBackend, ok := s.backend.(storage.PaymentEventHealthBackend)
	if !ok {
		return PaymentCallbackHealthPublic{Status: "unavailable"}
	}
	health, err := healthBackend.PaymentEventHealth()
	if err != nil {
		return PaymentCallbackHealthPublic{Available: true, Status: "error", Error: err.Error()}
	}
	return PaymentCallbackHealthPublic{
		Available:       true,
		Status:          "ok",
		PendingEvents:   health.Pending,
		FailedEvents:    health.Failed,
		OldestPendingAt: health.OldestPendingAt,
	}
}

func (s *PaymentService) BindCredits(credits *CreditService) {
	if s != nil {
		s.credits = credits
	}
}

func (s *PaymentService) Products() ([]RechargeProductPublic, error) {
	if !s.Available() {
		return nil, errors.New("在线支付需要数据库存储后端")
	}
	settings, err := s.backend.LoadPaymentSettings()
	if err != nil {
		return nil, err
	}
	items, err := s.backend.LoadActiveRechargeProducts()
	if err != nil {
		return nil, err
	}
	out := make([]RechargeProductPublic, 0, len(items))
	for _, item := range items {
		if item.ProductType == "cloud_storage" && !settings.CloudStorageEnabled {
			continue
		}
		out = append(out, publicRechargeProduct(item))
	}
	return out, nil
}

type PaymentChannelOption struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Provider      string `json:"provider"`
	PaymentMethod string `json:"payment_method"`
	IsDefault     bool   `json:"is_default"`
}

func (s *PaymentService) Channels() ([]PaymentChannelOption, error) {
	if !s.Available() {
		return nil, errors.New("在线支付需要数据库存储后端")
	}
	items, err := s.backend.LoadActivePaymentChannels()
	if err != nil {
		return nil, err
	}
	result := make([]PaymentChannelOption, 0, len(items))
	for _, item := range items {
		result = append(result, PaymentChannelOption{ID: item.ID, Name: item.Name, Provider: item.Provider, PaymentMethod: item.PaymentMethod, IsDefault: item.IsDefault})
	}
	return result, nil
}

func (s *PaymentService) StorageEntitlement(userID string) (storage.PaymentStorageEntitlementSummary, error) {
	if !s.Available() {
		return storage.PaymentStorageEntitlementSummary{}, errors.New("在线支付需要数据库存储后端")
	}
	backend, ok := s.backend.(storage.PaymentStorageBackend)
	if !ok {
		return storage.PaymentStorageEntitlementSummary{}, errors.New("云存储权益存储后端尚未就绪")
	}
	return backend.LoadActiveStorageEntitlement(strings.TrimSpace(userID), s.now().UTC().Format(time.RFC3339Nano))
}

func (s *PaymentService) CreateNativeOrder(ctx context.Context, userID, productID, idempotencyKey string) (PaymentOrderPublic, bool, error) {
	return s.CreateOrder(ctx, userID, productID, "", idempotencyKey)
}

func (s *PaymentService) CreateOrder(ctx context.Context, userID, productID, channelID, idempotencyKey string) (PaymentOrderPublic, bool, error) {
	return s.createOrder(ctx, userID, productID, 0, channelID, idempotencyKey)
}

func (s *PaymentService) CreateCustomCreditsOrder(ctx context.Context, userID string, credits int, channelID, idempotencyKey string) (PaymentOrderPublic, bool, error) {
	return s.createOrder(ctx, userID, "", credits, channelID, idempotencyKey)
}

func (s *PaymentService) createOrder(ctx context.Context, userID, productID string, customCredits int, channelID, idempotencyKey string) (PaymentOrderPublic, bool, error) {
	if !s.Available() {
		return PaymentOrderPublic{}, false, errors.New("在线支付需要数据库存储后端")
	}
	userID, productID, idempotencyKey = strings.TrimSpace(userID), strings.TrimSpace(productID), strings.TrimSpace(idempotencyKey)
	if userID == "" || (productID == "" && customCredits <= 0) || (productID != "" && customCredits > 0) || idempotencyKey == "" || len(idempotencyKey) > 160 {
		return PaymentOrderPublic{}, false, errors.New("用户、套餐或幂等键无效")
	}
	settings, err := s.backend.LoadPaymentSettings()
	if err != nil {
		return PaymentOrderPublic{}, false, err
	}
	if !settings.RechargeEnabled {
		return PaymentOrderPublic{}, false, errors.New("充值服务暂未开放")
	}
	var product storage.RechargeProductRecord
	if customCredits > 0 {
		if !settings.CustomCreditsEnabled || customCredits < settings.MinCustomCredits || customCredits > settings.MaxCustomCredits {
			return PaymentOrderPublic{}, false, errors.New("自定义积分数量超出允许范围")
		}
		product = storage.RechargeProductRecord{ID: "custom-credit", SKU: "custom-credit", Name: fmt.Sprintf("自定义充值 %d 积分", customCredits), AmountFen: int64(customCredits) * settings.CreditUnitPriceFen, Credits: customCredits, Enabled: true, ProductType: "credits"}
	} else {
		product, err = s.backend.LoadRechargeProduct(productID)
		if err != nil {
			return PaymentOrderPublic{}, false, err
		}
		if !product.Enabled {
			return PaymentOrderPublic{}, false, errors.New("充值套餐未启用")
		}
		if product.ProductType == "cloud_storage" && !settings.CloudStorageEnabled {
			return PaymentOrderPublic{}, false, errors.New("云存储套餐暂未开放")
		}
	}
	channels, err := s.backend.LoadActivePaymentChannels()
	if err != nil {
		return PaymentOrderPublic{}, false, err
	}
	if len(channels) == 0 {
		return PaymentOrderPublic{}, false, errors.New("暂无可用支付渠道")
	}
	channel := channels[0]
	channelID = strings.TrimSpace(channelID)
	if channelID != "" {
		found := false
		for _, candidate := range channels {
			if candidate.ID == channelID {
				channel, found = candidate, true
				break
			}
		}
		if !found {
			return PaymentOrderPublic{}, false, errors.New("支付渠道不可用")
		}
	}
	version, credentials, err := s.loadRuntimeCredentials(channel.ActiveVersionID)
	if err != nil {
		return PaymentOrderPublic{}, false, err
	}
	now := s.now().UTC()
	expiresAt := now.Add(time.Duration(channel.OrderExpireMinutes) * time.Minute)
	compactUUID := strings.ReplaceAll(uuid.NewString(), "-", "")
	order := storage.PaymentOrderRecord{ID: uuid.NewString(), OutTradeNo: "ST" + now.Format("20060102150405") + compactUUID[:14], UserID: userID, IdempotencyKey: idempotencyKey, ChannelID: channel.ID, ChannelVersionID: version.ID, ProductID: product.ID, ProductNameSnapshot: product.Name, AmountFen: product.AmountFen, CreditsSnapshot: product.Credits, ProductTypeSnapshot: product.ProductType, StorageDaysSnapshot: product.StorageDays, StorageBytesSnapshot: product.StorageBytes, Currency: "CNY", ExpireMinutesSnapshot: channel.OrderExpireMinutes, ExpiresAt: expiresAt.Format(time.RFC3339), Status: storage.PaymentOrderStatusCreated, CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano)}
	stored, created, err := s.backend.CreatePaymentOrder(order)
	if err != nil {
		return PaymentOrderPublic{}, false, err
	}
	if !created {
		if stored.ProductID != product.ID || stored.ChannelID != channel.ID || (customCredits > 0 && stored.CreditsSnapshot != customCredits) {
			return PaymentOrderPublic{}, false, errors.New("幂等键已用于其他充值套餐或支付渠道")
		}
		if stored.CodeURL != "" {
			return publicPaymentOrder(stored), false, nil
		}
		expiresAt, err = time.Parse(time.RFC3339, stored.ExpiresAt)
		if err != nil || !expiresAt.After(now) {
			return publicPaymentOrder(stored), false, errors.New("原支付订单已过期")
		}
	}
	provider, err := s.provider(ctx, credentials)
	if err != nil {
		return PaymentOrderPublic{}, created, err
	}
	notifyProvider := "wechat"
	if channel.Provider == storage.PaymentProviderAlipay {
		notifyProvider = "alipay"
	}
	result, err := provider.Prepay(ctx, PaymentPrepayProviderInput{AppID: credentials.AppID, MerchantID: credentials.MerchantID, Description: stored.ProductNameSnapshot, OutTradeNo: stored.OutTradeNo, NotifyURL: channel.NotifyBaseURL + "/api/payment/" + notifyProvider + "/notify/" + channel.ID + "/" + version.ID, AmountFen: stored.AmountFen, ExpiresAt: expiresAt})
	if err != nil {
		return PaymentOrderPublic{}, created, fmt.Errorf("%s 预下单失败: %w", channel.Name, err)
	}
	updated, err := s.backend.SavePaymentPrepay(stored.ID, result.CodeURL, result.RequestID, s.now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return PaymentOrderPublic{}, created, err
	}
	return publicPaymentOrder(updated), created, nil
}

func (s *PaymentService) QueryOrder(ctx context.Context, userID, orderID string) (PaymentOrderPublic, error) {
	if !s.Available() || s.credits == nil {
		return PaymentOrderPublic{}, errors.New("支付到账服务尚未就绪")
	}
	order, err := s.backend.LoadPaymentOrderByID(strings.TrimSpace(orderID))
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	if order.UserID != strings.TrimSpace(userID) {
		return PaymentOrderPublic{}, storage.ErrPaymentRecordNotFound
	}
	if order.Status == storage.PaymentOrderStatusSucceeded || order.Status == storage.PaymentOrderStatusClosed {
		return publicPaymentOrder(order), nil
	}
	expired, err := paymentOrderExpired(order, s.now().UTC())
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	_, err = s.reconcileOrder(ctx, order, expired)
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	updated, err := s.backend.LoadPaymentOrderByID(order.ID)
	if err != nil {
		return PaymentOrderPublic{}, err
	}
	return publicPaymentOrder(updated), nil
}

func (s *PaymentService) loadRuntimeCredentials(versionID string) (storage.PaymentChannelVersionRecord, paymentRuntimeCredentials, error) {
	version, err := s.backend.LoadPaymentChannelVersion(versionID)
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, paymentRuntimeCredentials{}, err
	}
	privateKey, err := decryptPaymentSecret(s.key, "merchant_private_key", version.MerchantPrivateKeyCipher)
	if err != nil {
		return version, paymentRuntimeCredentials{}, err
	}
	apiKey, err := decryptPaymentSecret(s.key, "api_v3_key", version.APIv3KeyCipher)
	if err != nil {
		return version, paymentRuntimeCredentials{}, err
	}
	publicKey, err := decryptPaymentSecret(s.key, "wechatpay_public_key", version.WechatPayPublicKeyCipher)
	if err != nil {
		return version, paymentRuntimeCredentials{}, err
	}
	alipayPrivateKey, err := decryptPaymentSecret(s.key, "alipay_private_key", version.AlipayPrivateKeyCipher)
	if err != nil {
		return version, paymentRuntimeCredentials{}, err
	}
	alipayPublicKey, err := decryptPaymentSecret(s.key, "alipay_public_key", version.AlipayPublicKeyCipher)
	if err != nil {
		return version, paymentRuntimeCredentials{}, err
	}
	provider := storage.PaymentProviderWechatPay
	if version.AlipayPrivateKeyCipher != "" {
		provider = storage.PaymentProviderAlipay
	}
	return version, paymentRuntimeCredentials{Provider: provider, AppID: version.AppID, MerchantID: version.MerchantID, MerchantCertSerial: version.MerchantCertSerial, MerchantPrivateKeyPEM: privateKey, APIv3Key: apiKey, WechatPayPublicKeyID: version.WechatPayPublicKeyID, WechatPayPublicKeyPEM: publicKey, AlipayPrivateKeyPEM: alipayPrivateKey, AlipayPublicKeyPEM: alipayPublicKey, AlipayGateway: version.AlipayGateway, AlipaySellerID: version.AlipaySellerID}, nil
}

func (s *PaymentService) ListUserOrders(userID string, limit int) ([]PaymentOrderPublic, error) {
	if !s.Available() {
		return nil, errors.New("在线支付需要数据库存储后端")
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return []PaymentOrderPublic{}, nil
	}
	queryBackend, ok := s.backend.(interface {
		QueryPaymentOrders(storage.PaymentOrderFilter) ([]storage.PaymentOrderRecord, int, error)
	})
	if !ok {
		return []PaymentOrderPublic{}, nil
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 30 {
		limit = 30
	}
	items, _, err := queryBackend.QueryPaymentOrders(storage.PaymentOrderFilter{
		Page:     1,
		PageSize: limit,
		UserID:   userID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]PaymentOrderPublic, 0, len(items))
	for _, item := range items {
		out = append(out, publicPaymentOrder(item))
	}
	return out, nil
}

func publicPaymentOrder(item storage.PaymentOrderRecord) PaymentOrderPublic {
	credits := item.CreditsSnapshot
	if item.ProductTypeSnapshot == "cloud_storage" {
		credits = 0
	}
	return PaymentOrderPublic{ID: item.ID, ChannelID: item.ChannelID, OutTradeNo: item.OutTradeNo, ProductID: item.ProductID, ProductName: item.ProductNameSnapshot, AmountFen: item.AmountFen, Credits: credits, ProductType: item.ProductTypeSnapshot, StorageDays: item.StorageDaysSnapshot, StorageBytes: item.StorageBytesSnapshot, Currency: item.Currency, ExpiresAt: item.ExpiresAt, Status: item.Status, CodeURL: item.CodeURL, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}
