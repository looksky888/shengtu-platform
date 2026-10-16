package service

type PaymentChannelInput struct {
	Code               string `json:"code"`
	Name               string `json:"name"`
	Provider           string `json:"provider"`
	PaymentMethod      string `json:"payment_method"`
	Enabled            bool   `json:"enabled"`
	IsDefault          bool   `json:"is_default"`
	NotifyBaseURL      string `json:"notify_base_url"`
	OrderExpireMinutes int    `json:"order_expire_minutes"`
}

type PaymentCredentialsInput struct {
	AppID                 string `json:"app_id"`
	MerchantID            string `json:"merchant_id"`
	MerchantCertSerial    string `json:"merchant_cert_serial"`
	MerchantPrivateKeyPEM string `json:"merchant_private_key_pem"`
	APIv3Key              string `json:"api_v3_key"`
	VerifyMode            string `json:"verify_mode"`
	WechatPayPublicKeyID  string `json:"wechatpay_public_key_id"`
	WechatPayPublicKeyPEM string `json:"wechatpay_public_key_pem"`
	AlipayPrivateKeyPEM   string `json:"alipay_private_key_pem"`
	AlipayPublicKeyPEM    string `json:"alipay_public_key_pem"`
	AlipayGateway         string `json:"alipay_gateway"`
	AlipaySellerID        string `json:"alipay_seller_id"`
}

type PaymentChannelPublic struct {
	ID                 string `json:"id"`
	Code               string `json:"code"`
	Name               string `json:"name"`
	Provider           string `json:"provider"`
	PaymentMethod      string `json:"payment_method"`
	Enabled            bool   `json:"enabled"`
	IsDefault          bool   `json:"is_default"`
	ActiveVersionID    string `json:"active_version_id"`
	NotifyBaseURL      string `json:"notify_base_url"`
	OrderExpireMinutes int    `json:"order_expire_minutes"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type PaymentChannelVersionPublic struct {
	ID                    string `json:"id"`
	ChannelID             string `json:"channel_id"`
	Version               int    `json:"version"`
	AppID                 string `json:"app_id"`
	MerchantID            string `json:"merchant_id"`
	MerchantCertSerial    string `json:"merchant_cert_serial"`
	VerifyMode            string `json:"verify_mode"`
	WechatPayPublicKeyID  string `json:"wechatpay_public_key_id"`
	ConfigFingerprint     string `json:"config_fingerprint"`
	Status                string `json:"status"`
	CreatedAt             string `json:"created_at"`
	HasMerchantPrivateKey bool   `json:"has_merchant_private_key"`
	HasAPIv3Key           bool   `json:"has_api_v3_key"`
	HasWechatPayPublicKey bool   `json:"has_wechatpay_public_key"`
	HasAlipayPrivateKey   bool   `json:"has_alipay_private_key"`
	HasAlipayPublicKey    bool   `json:"has_alipay_public_key"`
}

type RechargeProductInput struct {
	SKU          string `json:"sku"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	AmountFen    int64  `json:"amount_fen"`
	Credits      int    `json:"credits"`
	Enabled      bool   `json:"enabled"`
	SortOrder    int    `json:"sort_order"`
	ProductType  string `json:"product_type"`
	StorageDays  int    `json:"storage_days"`
	StorageBytes int64  `json:"storage_bytes"`
}

type RechargeProductPublic struct {
	ID           string `json:"id"`
	SKU          string `json:"sku"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	AmountFen    int64  `json:"amount_fen"`
	Credits      int    `json:"credits"`
	Enabled      bool   `json:"enabled"`
	SortOrder    int    `json:"sort_order"`
	ProductType  string `json:"product_type"`
	StorageDays  int    `json:"storage_days"`
	StorageBytes int64  `json:"storage_bytes"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}
