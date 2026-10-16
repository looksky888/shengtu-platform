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
	CreditUnitPriceFen          int64  `json:"credit_unit_price_fen"`
	MinCustomCredits            int    `json:"min_custom_credits"`
	MaxCustomCredits            int    `json:"max_custom_credits"`
	UpdatedAt                   string `json:"updated_at,omitempty"`
}

type PaymentSettingsInput struct {
	RechargeEnabled      bool  `json:"recharge_enabled"`
	CustomCreditsEnabled bool  `json:"custom_credits_enabled"`
	CloudStorageEnabled  bool  `json:"cloud_storage_enabled"`
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
	now := s.now().UTC().Format(time.RFC3339Nano)
	item, err := s.backend.SavePaymentSettings(storage.PaymentSettingsRecord{RechargeEnabled: input.RechargeEnabled, CustomCreditsEnabled: input.CustomCreditsEnabled, CloudStorageEnabled: input.CloudStorageEnabled, CreditUnitPriceFen: input.CreditUnitPriceFen, MinCustomCredits: input.MinCustomCredits, MaxCustomCredits: input.MaxCustomCredits, UpdatedBy: strings.TrimSpace(actor), UpdatedAt: now})
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
	return PaymentSettingsPublic{RechargeEnabled: item.RechargeEnabled, CustomCreditsEnabled: item.CustomCreditsEnabled, CloudStorageEnabled: item.CloudStorageEnabled, CloudStoragePolicyStartedAt: item.CloudStoragePolicyStartedAt, CreditUnitPriceFen: item.CreditUnitPriceFen, MinCustomCredits: item.MinCustomCredits, MaxCustomCredits: item.MaxCustomCredits, UpdatedAt: item.UpdatedAt}
}
