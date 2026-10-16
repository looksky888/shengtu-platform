package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"github.com/google/uuid"
)

// PaymentAdminService validates and persists payment configuration without
// exposing plaintext credentials to HTTP callers.
type PaymentAdminService struct {
	backend storage.PaymentAdminBackend
	key     []byte
	now     func() time.Time
}

func NewPaymentAdminService(backend storage.PaymentAdminBackend, key []byte) *PaymentAdminService {
	return &PaymentAdminService{backend: backend, key: append([]byte(nil), key...), now: time.Now}
}

func NewPaymentAdminServiceFromBackend(dataDir string, backend storage.Backend) (*PaymentAdminService, error) {
	adminBackend, ok := backend.(storage.PaymentAdminBackend)
	if !ok {
		return &PaymentAdminService{}, nil
	}
	key, err := loadOrCreatePaymentSettingsKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("初始化支付凭据密钥: %w", err)
	}
	return NewPaymentAdminService(adminBackend, key), nil
}

func (s *PaymentAdminService) Available() bool {
	return s != nil && s.backend != nil && len(s.key) == 32
}

func (s *PaymentAdminService) ListChannels() ([]PaymentChannelPublic, error) {
	if !s.Available() {
		return nil, errors.New("在线支付需要数据库存储后端")
	}
	items, err := s.backend.ListPaymentChannels()
	if err != nil {
		return nil, err
	}
	out := make([]PaymentChannelPublic, 0, len(items))
	for _, item := range items {
		out = append(out, publicPaymentChannel(item))
	}
	return out, nil
}

func (s *PaymentAdminService) GetChannel(id string) (PaymentChannelPublic, error) {
	if !s.Available() {
		return PaymentChannelPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	item, err := s.backend.LoadPaymentChannel(id)
	if err != nil {
		return PaymentChannelPublic{}, err
	}
	return publicPaymentChannel(item), nil
}

func (s *PaymentAdminService) CreateChannel(input PaymentChannelInput, credentials PaymentCredentialsInput, actor string) (PaymentChannelPublic, PaymentChannelVersionPublic, error) {
	if !s.Available() {
		return PaymentChannelPublic{}, PaymentChannelVersionPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	channel, err := validateChannelInput(input)
	if err != nil {
		return PaymentChannelPublic{}, PaymentChannelVersionPublic{}, err
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	channel.ID, channel.CreatedBy, channel.UpdatedBy, channel.CreatedAt, channel.UpdatedAt = uuid.NewString(), actor, actor, now, now
	version, err := s.buildVersion(channel.ID, channel.Provider, credentials, actor, 1, now)
	if err != nil {
		return PaymentChannelPublic{}, PaymentChannelVersionPublic{}, err
	}
	channel.ActiveVersionID = version.ID
	createdChannel, createdVersion, err := s.backend.CreatePaymentChannel(channel, version)
	if err != nil {
		return PaymentChannelPublic{}, PaymentChannelVersionPublic{}, err
	}
	return publicPaymentChannel(createdChannel), publicPaymentChannelVersion(createdVersion), nil
}

func (s *PaymentAdminService) UpdateChannel(id string, input PaymentChannelInput, actor string) (PaymentChannelPublic, error) {
	if !s.Available() {
		return PaymentChannelPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	current, err := s.backend.LoadPaymentChannel(id)
	if err != nil {
		return PaymentChannelPublic{}, err
	}
	next, err := validateChannelInput(input)
	if err != nil {
		return PaymentChannelPublic{}, err
	}
	if next.Provider != current.Provider || next.PaymentMethod != current.PaymentMethod {
		return PaymentChannelPublic{}, errors.New("已创建渠道不允许更换支付平台或支付方式")
	}
	next.ID, next.ActiveVersionID = current.ID, current.ActiveVersionID
	next.CreatedAt, next.CreatedBy = current.CreatedAt, current.CreatedBy
	next.UpdatedAt, next.UpdatedBy = s.now().UTC().Format(time.RFC3339Nano), actor
	updated, err := s.backend.UpdatePaymentChannel(next)
	if err != nil {
		return PaymentChannelPublic{}, err
	}
	return publicPaymentChannel(updated), nil
}

func (s *PaymentAdminService) RotateChannel(id string, credentials PaymentCredentialsInput, actor string) (PaymentChannelVersionPublic, error) {
	if !s.Available() {
		return PaymentChannelVersionPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	channel, err := s.backend.LoadPaymentChannel(id)
	if err != nil {
		return PaymentChannelVersionPublic{}, err
	}
	version, err := s.buildVersion(id, channel.Provider, credentials, actor, 0, now)
	if err != nil {
		return PaymentChannelVersionPublic{}, err
	}
	created, err := s.backend.RotatePaymentChannelVersion(id, version)
	if err != nil {
		return PaymentChannelVersionPublic{}, err
	}
	return publicPaymentChannelVersion(created), nil
}

func (s *PaymentAdminService) ListProducts() ([]RechargeProductPublic, error) {
	if !s.Available() {
		return nil, errors.New("在线支付需要数据库存储后端")
	}
	items, err := s.backend.ListRechargeProducts()
	if err != nil {
		return nil, err
	}
	out := make([]RechargeProductPublic, 0, len(items))
	for _, item := range items {
		out = append(out, publicRechargeProduct(item))
	}
	return out, nil
}

func (s *PaymentAdminService) CreateProduct(input RechargeProductInput, actor string) (RechargeProductPublic, error) {
	if !s.Available() {
		return RechargeProductPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	product, err := validateProductInput(input)
	if err != nil {
		return RechargeProductPublic{}, err
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	product.ID, product.CreatedBy, product.UpdatedBy, product.CreatedAt, product.UpdatedAt = uuid.NewString(), actor, actor, now, now
	created, err := s.backend.CreateRechargeProduct(product)
	if err != nil {
		return RechargeProductPublic{}, err
	}
	return publicRechargeProduct(created), nil
}

func (s *PaymentAdminService) UpdateProduct(id string, input RechargeProductInput, actor string) (RechargeProductPublic, error) {
	if !s.Available() {
		return RechargeProductPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	current, err := s.backend.LoadRechargeProduct(id)
	if err != nil {
		return RechargeProductPublic{}, err
	}
	product, err := validateProductInput(input)
	if err != nil {
		return RechargeProductPublic{}, err
	}
	product.ID, product.CreatedAt, product.CreatedBy = current.ID, current.CreatedAt, current.CreatedBy
	product.UpdatedAt, product.UpdatedBy = s.now().UTC().Format(time.RFC3339Nano), actor
	updated, err := s.backend.UpdateRechargeProduct(product)
	if err != nil {
		return RechargeProductPublic{}, err
	}
	return publicRechargeProduct(updated), nil
}

func (s *PaymentAdminService) ArchiveProduct(id, actor string) (bool, error) {
	if !s.Available() {
		return false, errors.New("在线支付需要数据库存储后端")
	}
	return s.backend.ArchiveRechargeProduct(id, actor, s.now().UTC().Format(time.RFC3339Nano))
}

func validateChannelInput(input PaymentChannelInput) (storage.PaymentChannelRecord, error) {
	channel := storage.PaymentChannelRecord{Code: strings.ToLower(strings.TrimSpace(input.Code)), Name: strings.TrimSpace(input.Name), Provider: strings.ToLower(strings.TrimSpace(input.Provider)), PaymentMethod: strings.ToLower(strings.TrimSpace(input.PaymentMethod)), Enabled: input.Enabled, IsDefault: input.IsDefault, NotifyBaseURL: strings.TrimRight(strings.TrimSpace(input.NotifyBaseURL), "/"), OrderExpireMinutes: input.OrderExpireMinutes}
	if (channel.Provider != storage.PaymentProviderWechatPay && channel.Provider != storage.PaymentProviderAlipay) || channel.PaymentMethod != storage.PaymentMethodNative {
		return storage.PaymentChannelRecord{}, errors.New("仅支持微信或支付宝 Native 渠道")
	}
	if channel.Code == "" || channel.Name == "" {
		return storage.PaymentChannelRecord{}, errors.New("支付渠道 code 和名称不能为空")
	}
	if channel.OrderExpireMinutes == 0 {
		channel.OrderExpireMinutes = 15
	}
	parsed, err := url.Parse(channel.NotifyBaseURL)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return storage.PaymentChannelRecord{}, errors.New("支付回调地址必须是公网 HTTPS URL")
	}
	hostname := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") || strings.HasSuffix(hostname, ".local") {
		return storage.PaymentChannelRecord{}, errors.New("支付回调地址必须是公网 HTTPS URL")
	}
	if ip := net.ParseIP(hostname); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast()) {
		return storage.PaymentChannelRecord{}, errors.New("支付回调地址必须是公网 HTTPS URL")
	}
	return channel, nil
}

func (s *PaymentAdminService) buildVersion(channelID, provider string, input PaymentCredentialsInput, actor string, version int, now string) (storage.PaymentChannelVersionRecord, error) {
	input.AppID, input.MerchantID, input.MerchantCertSerial = strings.TrimSpace(input.AppID), strings.TrimSpace(input.MerchantID), strings.TrimSpace(input.MerchantCertSerial)
	input.VerifyMode, input.WechatPayPublicKeyID = strings.ToLower(strings.TrimSpace(input.VerifyMode)), strings.TrimSpace(input.WechatPayPublicKeyID)
	if input.VerifyMode == "" {
		input.VerifyMode = "platform_public_key"
	}
	if input.VerifyMode != "platform_public_key" && input.VerifyMode != "platform_certificate" && provider != storage.PaymentProviderAlipay {
		return storage.PaymentChannelVersionRecord{}, errors.New("微信支付验签模式无效")
	}
	input.AlipayGateway, input.AlipaySellerID = strings.TrimRight(strings.TrimSpace(input.AlipayGateway), "/"), strings.TrimSpace(input.AlipaySellerID)
	if provider == storage.PaymentProviderAlipay {
		if input.AppID == "" || input.AlipayPrivateKeyPEM == "" || input.AlipayPublicKeyPEM == "" {
			return storage.PaymentChannelVersionRecord{}, errors.New("支付宝 AppID、应用私钥和支付宝公钥不能为空")
		}
		if _, err := parsePrivateKeyPEM(input.AlipayPrivateKeyPEM); err != nil {
			return storage.PaymentChannelVersionRecord{}, fmt.Errorf("支付宝应用私钥无效: %w", err)
		}
		if _, err := parsePublicKeyPEM(input.AlipayPublicKeyPEM); err != nil {
			return storage.PaymentChannelVersionRecord{}, fmt.Errorf("支付宝公钥无效: %w", err)
		}
		if input.AlipayGateway == "" {
			input.AlipayGateway = "https://openapi.alipay.com/gateway.do"
		}
		input.MerchantID = input.AlipaySellerID
		parsed, err := url.Parse(input.AlipayGateway)
		if err != nil || !strings.EqualFold(parsed.Scheme, "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			return storage.PaymentChannelVersionRecord{}, errors.New("支付宝网关必须是 HTTPS 地址")
		}
	} else if input.AppID == "" || input.MerchantID == "" || input.MerchantCertSerial == "" || len([]byte(input.APIv3Key)) != 32 || input.WechatPayPublicKeyID == "" {
		return storage.PaymentChannelVersionRecord{}, errors.New("微信支付凭据字段不完整或 API v3 Key 长度不是 32 字节")
	}
	if provider != storage.PaymentProviderAlipay {
		if _, err := parsePrivateKeyPEM(input.MerchantPrivateKeyPEM); err != nil {
			return storage.PaymentChannelVersionRecord{}, fmt.Errorf("商户私钥无效: %w", err)
		}
		if _, err := parsePublicKeyPEM(input.WechatPayPublicKeyPEM); err != nil {
			return storage.PaymentChannelVersionRecord{}, fmt.Errorf("微信支付平台公钥无效: %w", err)
		}
	}
	privateCipher, err := encryptPaymentSecret(s.key, "merchant_private_key", strings.TrimSpace(input.MerchantPrivateKeyPEM))
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, err
	}
	apiCipher, err := encryptPaymentSecret(s.key, "api_v3_key", input.APIv3Key)
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, err
	}
	publicCipher, err := encryptPaymentSecret(s.key, "wechatpay_public_key", strings.TrimSpace(input.WechatPayPublicKeyPEM))
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, err
	}
	alipayPrivateCipher, err := encryptPaymentSecret(s.key, "alipay_private_key", strings.TrimSpace(input.AlipayPrivateKeyPEM))
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, err
	}
	alipayPublicCipher, err := encryptPaymentSecret(s.key, "alipay_public_key", strings.TrimSpace(input.AlipayPublicKeyPEM))
	if err != nil {
		return storage.PaymentChannelVersionRecord{}, err
	}
	hash := sha256.Sum256([]byte(strings.Join([]string{provider, input.AppID, input.MerchantID, input.MerchantCertSerial, input.VerifyMode, input.WechatPayPublicKeyID, input.AlipayGateway, input.AlipaySellerID}, "\x00")))
	return storage.PaymentChannelVersionRecord{ID: uuid.NewString(), ChannelID: channelID, Version: version, AppID: input.AppID, MerchantID: input.MerchantID, MerchantCertSerial: input.MerchantCertSerial, MerchantPrivateKeyCipher: privateCipher, APIv3KeyCipher: apiCipher, VerifyMode: input.VerifyMode, WechatPayPublicKeyID: input.WechatPayPublicKeyID, WechatPayPublicKeyCipher: publicCipher, AlipayPrivateKeyCipher: alipayPrivateCipher, AlipayPublicKeyCipher: alipayPublicCipher, AlipayGateway: input.AlipayGateway, AlipaySellerID: input.AlipaySellerID, ConfigFingerprint: hex.EncodeToString(hash[:]), Status: "active", CreatedBy: actor, CreatedAt: now}, nil
}

func validateProductInput(input RechargeProductInput) (storage.RechargeProductRecord, error) {
	product := storage.RechargeProductRecord{SKU: strings.ToLower(strings.TrimSpace(input.SKU)), Name: strings.TrimSpace(input.Name), Description: strings.TrimSpace(input.Description), AmountFen: input.AmountFen, Credits: input.Credits, Enabled: input.Enabled, SortOrder: input.SortOrder, ProductType: strings.ToLower(strings.TrimSpace(input.ProductType)), StorageDays: input.StorageDays, StorageBytes: input.StorageBytes}
	if product.ProductType == "" {
		product.ProductType = "credits"
	}
	if product.SKU == "" || product.Name == "" || product.AmountFen <= 0 || product.SortOrder < 0 {
		return storage.RechargeProductRecord{}, errors.New("充值套餐字段无效")
	}
	switch product.ProductType {
	case "credits":
		if product.Credits <= 0 {
			return storage.RechargeProductRecord{}, errors.New("积分套餐到账积分必须为正数")
		}
		product.StorageDays, product.StorageBytes = 0, 0
	case "cloud_storage":
		if product.StorageDays <= 0 || product.StorageDays > 3650 || product.StorageBytes <= 0 {
			return storage.RechargeProductRecord{}, errors.New("云存储套餐容量或有效期无效")
		}
		product.Credits = 1
	default:
		return storage.RechargeProductRecord{}, errors.New("充值套餐类型无效")
	}
	return product, nil
}

func publicPaymentChannel(item storage.PaymentChannelRecord) PaymentChannelPublic {
	return PaymentChannelPublic{ID: item.ID, Code: item.Code, Name: item.Name, Provider: item.Provider, PaymentMethod: item.PaymentMethod, Enabled: item.Enabled, IsDefault: item.IsDefault, ActiveVersionID: item.ActiveVersionID, NotifyBaseURL: item.NotifyBaseURL, OrderExpireMinutes: item.OrderExpireMinutes, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}
func publicPaymentChannelVersion(item storage.PaymentChannelVersionRecord) PaymentChannelVersionPublic {
	return PaymentChannelVersionPublic{ID: item.ID, ChannelID: item.ChannelID, Version: item.Version, AppID: item.AppID, MerchantID: item.MerchantID, MerchantCertSerial: item.MerchantCertSerial, VerifyMode: item.VerifyMode, WechatPayPublicKeyID: item.WechatPayPublicKeyID, ConfigFingerprint: item.ConfigFingerprint, Status: item.Status, CreatedAt: item.CreatedAt, HasMerchantPrivateKey: item.MerchantPrivateKeyCipher != "", HasAPIv3Key: item.APIv3KeyCipher != "", HasWechatPayPublicKey: item.WechatPayPublicKeyCipher != "", HasAlipayPrivateKey: item.AlipayPrivateKeyCipher != "", HasAlipayPublicKey: item.AlipayPublicKeyCipher != ""}
}
func publicRechargeProduct(item storage.RechargeProductRecord) RechargeProductPublic {
	credits := item.Credits
	if item.ProductType == "cloud_storage" {
		credits = 0
	}
	return RechargeProductPublic{ID: item.ID, SKU: item.SKU, Name: item.Name, Description: item.Description, AmountFen: item.AmountFen, Credits: credits, Enabled: item.Enabled, SortOrder: item.SortOrder, ProductType: item.ProductType, StorageDays: item.StorageDays, StorageBytes: item.StorageBytes, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}
