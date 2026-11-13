package service

import (
	"errors"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type PaymentSettingsPublic struct {
	RechargeEnabled             bool   `json:"recharge_enabled"`
	CustomCreditsEnabled        bool   `json:"custom_credits_enabled"`
	CloudStorageEnabled         bool   `json:"cloud_storage_enabled"`
	CloudStoragePolicyStartedAt string `json:"-"`
	FreeRetentionDays           int    `json:"free_retention_days"`
	VIPGraceDays                int    `json:"vip_grace_days"`
	HistoricalGraceDays         int    `json:"historical_grace_days"`
	CreditUnitPriceFen          int64  `json:"credit_unit_price_fen"`
	MinCustomCredits            int    `json:"min_custom_credits"`
	MaxCustomCredits            int    `json:"max_custom_credits"`
	UpdatedAt                   string `json:"updated_at,omitempty"`
}

type PaymentSettingsInput struct {
	RechargeEnabled      bool  `json:"recharge_enabled"`
	CustomCreditsEnabled bool  `json:"custom_credits_enabled"`
	CloudStorageEnabled  bool  `json:"cloud_storage_enabled"`
	FreeRetentionDays    int   `json:"free_retention_days"`
	VIPGraceDays         int   `json:"vip_grace_days"`
	HistoricalGraceDays  int   `json:"historical_grace_days"`
	CreditUnitPriceFen   int64 `json:"credit_unit_price_fen"`
	MinCustomCredits     int   `json:"min_custom_credits"`
	MaxCustomCredits     int   `json:"max_custom_credits"`
}

func (s *PaymentService) Settings() (PaymentSettingsPublic, error) {
	if !s.Available() {
		return PaymentSettingsPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	item, err := s.backend.LoadPaymentSettings()
	return publicPaymentSettings(item), err
}

func (s *PaymentService) ActiveStorageEntitlements() (map[string]storage.PaymentStorageEntitlementSummary, error) {
	if !s.Available() {
		return nil, errors.New("在线支付需要数据库存储后端")
	}
	backend, ok := s.backend.(storage.PaymentStorageBackend)
	if !ok {
		return nil, errors.New("云存储权益未初始化")
	}
	return backend.ListActiveStorageEntitlements(s.now().UTC().Format(time.RFC3339Nano))
}

func (s *PaymentAdminService) Settings() (PaymentSettingsPublic, error) {
	if !s.Available() {
		return PaymentSettingsPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	item, err := s.backend.LoadPaymentSettings()
	return publicPaymentSettings(item), err
}

func (s *PaymentAdminService) UpdateSettings(input PaymentSettingsInput, actor string) (PaymentSettingsPublic, error) {
	if !s.Available() {
		return PaymentSettingsPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	if input.CreditUnitPriceFen <= 0 || input.CreditUnitPriceFen > 100000 || input.MinCustomCredits <= 0 || input.MaxCustomCredits < input.MinCustomCredits || input.MaxCustomCredits > 10000000 {
		return PaymentSettingsPublic{}, errors.New("积分单价或自定义购买范围无效")
	}
	if input.FreeRetentionDays < 0 || input.FreeRetentionDays > storage.MaxPaymentRetentionDays ||
		input.VIPGraceDays < 0 || input.VIPGraceDays > storage.MaxPaymentRetentionDays ||
		input.HistoricalGraceDays < 0 || input.HistoricalGraceDays > storage.MaxPaymentRetentionDays {
		return PaymentSettingsPublic{}, errors.New("云存储保留期或缓冲期天数无效")
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	item, err := s.backend.SavePaymentSettings(storage.PaymentSettingsRecord{
		RechargeEnabled:      input.RechargeEnabled,
		CustomCreditsEnabled: input.CustomCreditsEnabled,
		CloudStorageEnabled:  input.CloudStorageEnabled,
		FreeRetentionDays:    input.FreeRetentionDays,
		VIPGraceDays:         input.VIPGraceDays,
		HistoricalGraceDays:  input.HistoricalGraceDays,
		CreditUnitPriceFen:   input.CreditUnitPriceFen,
		MinCustomCredits:     input.MinCustomCredits,
		MaxCustomCredits:     input.MaxCustomCredits,
		UpdatedBy:            strings.TrimSpace(actor),
		UpdatedAt:            now,
	})
	if err != nil {
		return PaymentSettingsPublic{}, err
	}
	return publicPaymentSettings(item), nil
}

func (s *PaymentAdminService) Stats() (storage.PaymentStatsRecord, error) {
	if !s.Available() {
		return storage.PaymentStatsRecord{}, errors.New("在线支付需要数据库存储后端")
	}
	return s.backend.LoadPaymentStats(s.now().In(util.ChinaLocation()).Format(time.RFC3339Nano))
}

func publicPaymentSettings(item storage.PaymentSettingsRecord) PaymentSettingsPublic {
	freeDays := item.FreeRetentionDays
	if freeDays <= 0 {
		freeDays = storage.DefaultFreeRetentionDays
	}
	vipGraceDays := item.VIPGraceDays
	if vipGraceDays <= 0 {
		vipGraceDays = storage.DefaultVIPGraceDays
	}
	historicalGraceDays := item.HistoricalGraceDays
	if historicalGraceDays <= 0 {
		historicalGraceDays = storage.DefaultHistoricalGraceDays
	}
	return PaymentSettingsPublic{
		RechargeEnabled:             item.RechargeEnabled,
		CustomCreditsEnabled:        item.CustomCreditsEnabled,
		CloudStorageEnabled:         item.CloudStorageEnabled,
		CloudStoragePolicyStartedAt: item.CloudStoragePolicyStartedAt,
		FreeRetentionDays:           freeDays,
		VIPGraceDays:                vipGraceDays,
		HistoricalGraceDays:         historicalGraceDays,
		CreditUnitPriceFen:          item.CreditUnitPriceFen,
		MinCustomCredits:            item.MinCustomCredits,
		MaxCustomCredits:            item.MaxCustomCredits,
		UpdatedAt:                   item.UpdatedAt,
	}
}
