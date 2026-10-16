package storage

const (
	PaymentProviderWechatPay = "wechatpay"
	PaymentProviderAlipay    = "alipay"
	PaymentMethodNative      = "native"

	PaymentOrderStatusCreated   = "created"
	PaymentOrderStatusPending   = "pending"
	PaymentOrderStatusClosing   = "closing"
	PaymentOrderStatusSucceeded = "succeeded"
	PaymentOrderStatusClosed    = "closed"
	PaymentOrderStatusFailed    = "failed"
	PaymentOrderStatusException = "exception"

	PaymentEventStatusPending   = "pending"
	PaymentEventStatusProcessed = "processed"
	PaymentEventStatusIgnored   = "ignored"
	PaymentEventStatusFailed    = "failed"

	PaymentReconciliationStatusPending   = "pending"
	PaymentReconciliationStatusRunning   = "running"
	PaymentReconciliationStatusSucceeded = "succeeded"
	PaymentReconciliationStatusFailed    = "failed"
)

// PaymentChannelRecord contains mutable, non-secret operating configuration.
// Credentials live in immutable PaymentChannelVersionRecord rows.
type PaymentChannelRecord struct {
	ID                 string
	Code               string
	Name               string
	Provider           string
	PaymentMethod      string
	Enabled            bool
	IsDefault          bool
	ActiveVersionID    string
	NotifyBaseURL      string
	OrderExpireMinutes int
	CreatedBy          string
	UpdatedBy          string
	CreatedAt          string
	UpdatedAt          string
}

type PaymentChannelVersionRecord struct {
	ID                       string
	ChannelID                string
	Version                  int
	AppID                    string
	MerchantID               string
	MerchantCertSerial       string
	MerchantPrivateKeyCipher string
	APIv3KeyCipher           string
	VerifyMode               string
	WechatPayPublicKeyID     string
	WechatPayPublicKeyCipher string
	AlipayPrivateKeyCipher   string
	AlipayPublicKeyCipher    string
	AlipayGateway            string
	AlipaySellerID           string
	ConfigFingerprint        string
	Status                   string
	CreatedBy                string
	CreatedAt                string
}

type RechargeProductRecord struct {
	ID           string
	SKU          string
	Name         string
	Description  string
	AmountFen    int64
	Credits      int
	Enabled      bool
	SortOrder    int
	ProductType  string
	StorageDays  int
	StorageBytes int64
	CreatedBy    string
	UpdatedBy    string
	CreatedAt    string
	UpdatedAt    string
	ArchivedAt   string
}

type PaymentSettingsRecord struct {
	RechargeEnabled             bool
	CustomCreditsEnabled        bool
	CloudStorageEnabled         bool
	CloudStoragePolicyStartedAt string
	CreditUnitPriceFen          int64
	MinCustomCredits            int
	MaxCustomCredits            int
	UpdatedBy                   string
	UpdatedAt                   string
}

type PaymentStatsPeriod struct {
	TotalOrders        int     `json:"total_orders"`
	SucceededOrders    int     `json:"succeeded_orders"`
	FailedOrders       int     `json:"failed_orders"`
	ClosedOrders       int     `json:"closed_orders"`
	SucceededAmountFen int64   `json:"succeeded_amount_fen"`
	CreditedCredits    int     `json:"credited_credits"`
	SuccessRate        float64 `json:"success_rate"`
}

type PaymentStatsChannel struct {
	ChannelID          string  `json:"channel_id"`
	TotalOrders        int     `json:"total_orders"`
	SucceededOrders    int     `json:"succeeded_orders"`
	SucceededAmountFen int64   `json:"succeeded_amount_fen"`
	SuccessRate        float64 `json:"success_rate"`
}

type PaymentStatsDay struct {
	Date               string `json:"date"`
	TotalOrders        int    `json:"total_orders"`
	SucceededOrders    int    `json:"succeeded_orders"`
	SucceededAmountFen int64  `json:"succeeded_amount_fen"`
}

type PaymentStatsRecord struct {
	Today            PaymentStatsPeriod    `json:"today"`
	Last7Days        PaymentStatsPeriod    `json:"last_7_days"`
	CurrentMonth     PaymentStatsPeriod    `json:"current_month"`
	AllTime          PaymentStatsPeriod    `json:"all_time"`
	ChannelBreakdown []PaymentStatsChannel `json:"channel_breakdown"`
	DailyTrend       []PaymentStatsDay     `json:"daily_trend"`
}

type PaymentOrderRecord struct {
	ID                    string
	OutTradeNo            string
	UserID                string
	IdempotencyKey        string
	ChannelID             string
	ChannelVersionID      string
	ProductID             string
	ProductNameSnapshot   string
	AmountFen             int64
	CreditsSnapshot       int
	ProductTypeSnapshot   string
	StorageDaysSnapshot   int
	StorageBytesSnapshot  int64
	Currency              string
	ExpireMinutesSnapshot int
	ExpiresAt             string
	Status                string
	ProviderTradeState    string
	ProviderTradeDesc     string
	TransactionID         string
	CodeURL               string
	ProviderRequestID     string
	LastQueryAt           string
	QueryAttempts         int
	PaidAt                string
	CreditedAt            string
	ClosedAt              string
	LastErrorCode         string
	LastErrorMessage      string
	CreatedAt             string
	UpdatedAt             string
}

type PaymentStorageEntitlementRecord struct {
	ID            string
	UserID        string
	SourceOrderID string
	ProductID     string
	StorageBytes  int64
	ExpiresAt     string
	CreatedAt     string
	UpdatedAt     string
}

type PaymentStorageEntitlementSummary struct {
	UserID       string `json:"user_id"`
	StorageBytes int64  `json:"storage_bytes"`
	UsedBytes    int64  `json:"used_bytes"`
	ExpiresAt    string `json:"expires_at,omitempty"`
}

type PaymentStorageCompletion struct {
	OrderID        string
	Provider       string
	TransactionID  string
	MerchantID     string
	PaidAt         string
	CreditedAt     string
	TradeState     string
	TradeStateDesc string
	Entitlement    PaymentStorageEntitlementRecord
}

// PaymentOrderQueryUpdate is the durable result of a provider order query.
// It intentionally contains provider state only; payment success still goes
// through PaymentCreditCompletion after full validation.
type PaymentOrderQueryUpdate struct {
	OrderID          string
	TradeState       string
	TradeStateDesc   string
	LastQueryAt      string
	LastErrorCode    string
	LastErrorMessage string
}

type PaymentOrderFilter struct {
	Page      int
	PageSize  int
	Keyword   string
	Status    string
	ChannelID string
	UserID    string
	StartAt   string
	EndAt     string
}

// PaymentEventRecord is the durable callback inbox. It deliberately excludes
// payer identity fields that are not needed to credit an order.
type PaymentEventRecord struct {
	ID               string
	Provider         string
	ProviderEventID  string
	ChannelVersionID string
	EventType        string
	OrderID          string
	OutTradeNo       string
	TransactionID    string
	AppID            string
	MerchantID       string
	TradeState       string
	TradeStateDesc   string
	AmountFen        int64
	Currency         string
	SuccessTime      string
	ResourceDigest   string
	Status           string
	Attempts         int
	LastError        string
	LastAttemptAt    string
	ReceivedAt       string
	ProcessedAt      string
}

// PaymentCreditCompletion is the atomic persistence input after a provider
// result has already passed signature, merchant, order, currency and amount validation.
type PaymentCreditCompletion struct {
	OrderID            string
	Provider           string
	TransactionID      string
	MerchantID         string
	PaidAt             string
	CreditedAt         string
	TradeState         string
	TradeStateDesc     string
	LedgerEntry        CreditLedgerRow
	CreditCoreDocument any
}

// PaymentReconciliationRunRecord is a durable, read-only comparison between a
// verified WeChat trade bill and local payment records. It never authorizes
// credit changes.
type PaymentReconciliationRunRecord struct {
	ID                 string
	ChannelID          string
	ChannelVersionID   string
	BillDate           string
	Status             string
	ArchivePath        string
	HashType           string
	HashValue          string
	BillRows           int
	MatchedOrders      int
	MissingLocalOrders int
	MissingBillOrders  int
	AmountMismatches   int
	StatusMismatches   int
	SkippedExternal    int
	LastError          string
	StartedAt          string
	FinishedAt         string
	CreatedAt          string
	UpdatedAt          string
}

type PaymentReconciliationItemRecord struct {
	ID             string
	RunID          string
	Category       string
	OutTradeNo     string
	TransactionID  string
	LocalOrderID   string
	BillAmountFen  int64
	LocalAmountFen int64
	Detail         string
	CreatedAt      string
}

type PaymentReconciliationFilter struct {
	Page      int
	PageSize  int
	ChannelID string
	Status    string
	BillDate  string
}

type PaymentReconciliationItemFilter struct {
	Page     int
	PageSize int
	Category string
}
