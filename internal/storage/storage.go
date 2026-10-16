package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// BackendInfo is the typed storage backend description for settings/API.
type BackendInfo struct {
	Type               string `json:"type"`
	Description        string `json:"description,omitempty"`
	FilePath           string `json:"file_path,omitempty"`
	FileExists         *bool  `json:"file_exists,omitempty"`
	AuthKeysFilePath   string `json:"auth_keys_file_path,omitempty"`
	AuthKeysFileExists *bool  `json:"auth_keys_file_exists,omitempty"`
	DBType             string `json:"db_type,omitempty"`
	DatabaseURL        string `json:"database_url,omitempty"`
}

// BackendHealth is the typed storage health probe for settings/API.
type BackendHealth struct {
	Status             string `json:"status"`
	Backend            string `json:"backend"`
	Error              string `json:"error,omitempty"`
	FilePath           string `json:"file_path,omitempty"`
	FileExists         *bool  `json:"file_exists,omitempty"`
	AuthKeysFilePath   string `json:"auth_keys_file_path,omitempty"`
	AuthKeysFileExists *bool  `json:"auth_keys_file_exists,omitempty"`
	DatabaseURL        string `json:"database_url,omitempty"`
	AccountCount       *int   `json:"account_count,omitempty"`
	AuthKeyCount       *int   `json:"auth_key_count,omitempty"`
	DocumentCount      *int   `json:"document_count,omitempty"`
	LogCount           *int   `json:"log_count,omitempty"`
}

func ptrBool(v bool) *bool { return &v }
func ptrInt(v int) *int    { return &v }

type Backend interface {
	LoadAccounts() ([]map[string]any, error)
	SaveAccounts([]map[string]any) error
	LoadAuthKeys() ([]map[string]any, error)
	SaveAuthKeys([]map[string]any) error
	HealthCheck() BackendHealth
	Info() BackendInfo
}

// AuthKeyUpsertBackend optionally supports single-row auth key writes (avoids full-table rewrite).
type AuthKeyUpsertBackend interface {
	UpsertAuthKey(keyID string, data map[string]any) error
}

// AccountUpsertBackend optionally supports single-row account writes.
type AccountUpsertBackend interface {
	UpsertAccount(accessToken string, data map[string]any) error
}

// AccountDeleteBackend optionally supports single-row account deletes (avoids full-table rewrite).
type AccountDeleteBackend interface {
	DeleteAccount(accessToken string) error
}

// AccountMutation is one account row in a batch persistence operation.
type AccountMutation struct {
	AccessToken string
	Data        map[string]any
}

// AccountBatchUpsertBackend optionally persists multiple account rows atomically.
type AccountBatchUpsertBackend interface {
	UpsertAccountsBatch(items []AccountMutation) error
}

// AccountBatchDeleteBackend optionally deletes multiple account rows atomically.
type AccountBatchDeleteBackend interface {
	DeleteAccountsBatch(accessTokens []string) error
}

// APIKeyLimitBackend persists short-lived API key reservations and usage
// counters. It is optional so legacy JSON backends keep the in-process
// limiter behavior while database deployments get restart/multi-instance
// continuity.
type APIKeyLimitBackend interface {
	ReserveAPIKeyLimit(key, now, day string, rpm, concurrency, daily, leaseSeconds int) (reservationID string, retryAfter int, reason string, err error)
	ReleaseAPIKeyLimit(reservationID string) error
}

// StorageCapacityBackend provides a short-lived, cross-process reservation
// for purchased cloud-storage capacity. Implementations count durable pending
// and ready media together with active reservations.
type StorageCapacityBackend interface {
	ReserveStorageCapacity(userID, now string, sizeBytes int64, leaseSeconds int) (reservationID string, limited bool, allowed bool, usedBytes, totalBytes int64, err error)
	ReleaseStorageCapacity(reservationID string) error
}

type JSONDocumentBackend interface {
	LoadJSONDocument(name string) (any, error)
	SaveJSONDocument(name string, value any) error
	DeleteJSONDocument(name string) error
}

// MediaAssetBackend stores row-oriented media metadata. Object bytes live in
// an object store; this interface is the queryable source of truth for access,
// pagination, migration, and deletion state.
type MediaAssetBackend interface {
	SaveMediaAsset(MediaAssetRecord) error
	UpdateMediaAssetUploadState(id, status, updatedAt, retryAt, lastError string) error
	LoadMediaAsset(path string) (MediaAssetRecord, bool, error)
	LoadMediaAssetByID(id string) (MediaAssetRecord, bool, error)
	ListMediaAssets(MediaAssetListQuery) (MediaAssetListPage, error)
	ListPendingMediaAssets(limit int) ([]MediaAssetRecord, error)
	DeleteMediaAsset(path string) error
}

// MediaAssetHealthBackend exposes bounded-cost counters for operational probes.
// It is optional so JSON backends and legacy test doubles remain compatible.
type MediaAssetHealthBackend interface {
	CountPendingMediaAssets() (int, error)
}

// DatabaseSnapshotBackend creates a transactionally consistent database copy
// for disaster-recovery archives. Implementations must not expose live WAL/SHM
// files as a completed snapshot.
type DatabaseSnapshotBackend interface {
	CreateDatabaseSnapshot(ctx context.Context, target string) error
	DatabaseSnapshotSourceFiles() []string
}

type LogBackend interface {
	AppendLog(item map[string]any) error
	QueryLogs(startDate, endDate string, limit int) ([]map[string]any, error)
}

// UserUsageAggregateRow is one user/day counter bucket.
type UserUsageAggregateRow struct {
	UserID    string
	Day       string
	Calls     int
	Success   int
	Failure   int
	QuotaUsed int
}

// UserUsageAggregateBackend stores usage counters independently from raw logs.
// Database implementations can append a log and its counter delta atomically.
type UserUsageAggregateBackend interface {
	LoadUserUsageAggregate() ([]UserUsageAggregateRow, bool, error)
	ReplaceUserUsageAggregate(rows []UserUsageAggregateRow) error
	AppendLogWithUserUsage(item map[string]any, delta UserUsageAggregateRow) error
	DeleteUserUsageAggregateBefore(day string) error
}

type LogMaintenanceBackend interface {
	DeleteLogsBefore(day string) (int, error)
}

type LogSummary struct {
	Total      int
	OldestTime string
	LatestTime string
}

type LogSummaryBackend interface {
	LogSummary() (LogSummary, error)
}

// CreditLedgerRow is one durable credit ledger row (table or document fallback).
type CreditLedgerRow struct {
	ID           string
	UserID       string
	Delta        int
	BalanceAfter int
	Reason       string
	RefID        string
	CreatedAt    string
}

// CreditLedgerFilter controls server-side ledger listing on the storage backend.
type CreditLedgerFilter struct {
	// UserID exact match when non-empty.
	UserID string
	// Keyword matches id/user_id/reason/ref_id/delta/balance_after (case-insensitive).
	Keyword string
	// Reason is an exact match when non-empty.
	Reason string
	// StartAt / EndAt are inclusive string bounds compared to created_at
	// (RFC3339 or "YYYY-MM-DD HH:mm:ss" / date prefixes work lexicographically for same format).
	StartAt string
	EndAt   string
	// Page is 1-based. PageSize must be > 0.
	Page     int
	PageSize int
}

// CreditLedgerBackend is an optional append-friendly ledger store (SQLite/MySQL/Postgres).
// JSON document backends do not implement this; CreditService keeps the document/jsonl path.
type CreditLedgerBackend interface {
	LoadCreditLedger() ([]CreditLedgerRow, error)
	// AppendCreditLedger inserts rows; existing primary keys are ignored (idempotent).
	AppendCreditLedger(rows []CreditLedgerRow) error
	// ReplaceCreditLedger rewrites the full table (migration / rollback).
	ReplaceCreditLedger(rows []CreditLedgerRow) error
	// QueryCreditLedger filters, sorts (created_at desc, id desc), and pages.
	// total is the count after filters, before pagination.
	QueryCreditLedger(filter CreditLedgerFilter) (items []CreditLedgerRow, total int, err error)
	CountCreditLedger() (int, error)
}

// PaymentBackend is the database-backed boundary for online recharge.
// Implementations must keep payment order/event writes separate from the
// legacy JSON credit document until the credit transaction adapter is enabled.
type PaymentBackend interface {
	LoadPaymentSettings() (PaymentSettingsRecord, error)
	LoadPaymentStats(now string) (PaymentStatsRecord, error)
	LoadActiveRechargeProducts() ([]RechargeProductRecord, error)
	LoadRechargeProduct(id string) (RechargeProductRecord, error)
	LoadActivePaymentChannels() ([]PaymentChannelRecord, error)
	LoadPaymentChannelVersion(id string) (PaymentChannelVersionRecord, error)
	CreatePaymentOrder(order PaymentOrderRecord) (PaymentOrderRecord, bool, error)
	SavePaymentPrepay(orderID, codeURL, providerRequestID, updatedAt string) (PaymentOrderRecord, error)
	LoadPaymentOrderByID(id string) (PaymentOrderRecord, error)
	LoadPaymentOrderByOutTradeNo(outTradeNo string) (PaymentOrderRecord, error)
	QueryPaymentOrders(filter PaymentOrderFilter) ([]PaymentOrderRecord, int, error)
	ListPaymentOrdersDue(now string, limit int) ([]PaymentOrderRecord, error)
	RecordPaymentOrderQuery(update PaymentOrderQueryUpdate) error
	MarkPaymentOrderClosing(orderID, updatedAt, lastErrorCode, lastErrorMessage string) error
	MarkPaymentOrderClosed(orderID, closedAt, lastErrorCode, lastErrorMessage string) error
	InsertPaymentEvent(event PaymentEventRecord) (bool, error)
	LoadPaymentEventByProviderEventID(providerEventID string) (PaymentEventRecord, error)
	UpdatePaymentEventStatus(providerEventID, status, lastError, processedAt string) error
	CompletePaymentCredit(input PaymentCreditCompletion) (PaymentOrderRecord, bool, error)
}

type PaymentStorageBackend interface {
	CompletePaymentStorage(input PaymentStorageCompletion) (PaymentOrderRecord, bool, error)
	LoadActiveStorageEntitlement(userID, now string) (PaymentStorageEntitlementSummary, error)
	ListActiveStorageEntitlements(now string) (map[string]PaymentStorageEntitlementSummary, error)
}

type MediaRetentionBackend interface {
	ListMediaAssetsBefore(policyStart, cutoff string, limit int, beforeSortKey, beforePath string) ([]MediaAssetRecord, error)
}

type PaymentEventHealth struct {
	Pending         int    `json:"pending"`
	Failed          int    `json:"failed"`
	OldestPendingAt string `json:"oldest_pending_at,omitempty"`
}

// PaymentEventHealthBackend exposes callback inbox health without exposing event payloads.
type PaymentEventHealthBackend interface {
	PaymentEventHealth() (PaymentEventHealth, error)
}

// PaymentReconciliationBackend is optional until a database backend enables
// durable bill reconciliation. It is deliberately separate from the payment
// order interface so existing providers and test doubles remain stable.
type PaymentReconciliationBackend interface {
	CreateOrLoadPaymentReconciliationRun(run PaymentReconciliationRunRecord) (PaymentReconciliationRunRecord, bool, error)
	ClaimPaymentReconciliationRun(id, startedAt string) (bool, error)
	ResetInterruptedPaymentReconciliations(updatedAt string) (int, error)
	CompletePaymentReconciliationRun(run PaymentReconciliationRunRecord, items []PaymentReconciliationItemRecord) error
	FailPaymentReconciliationRun(id, lastError, finishedAt string) error
	LoadPaymentReconciliationRun(id string) (PaymentReconciliationRunRecord, error)
	QueryPaymentReconciliationRuns(filter PaymentReconciliationFilter) ([]PaymentReconciliationRunRecord, int, error)
	QueryPaymentReconciliationItems(runID string, filter PaymentReconciliationItemFilter) ([]PaymentReconciliationItemRecord, int, error)
	LoadPaymentOrdersByOutTradeNos(outTradeNos []string) ([]PaymentOrderRecord, error)
	ListSucceededPaymentOrdersForReconciliation(channelID, paidStart, paidEnd string) ([]PaymentOrderRecord, error)
}

// PaymentAdminBackend owns payment configuration mutations. Implementations
// must keep channel/version creation and credential rotation transactional.
type PaymentAdminBackend interface {
	PaymentBackend
	ListPaymentChannels() ([]PaymentChannelRecord, error)
	LoadPaymentChannel(id string) (PaymentChannelRecord, error)
	CreatePaymentChannel(channel PaymentChannelRecord, version PaymentChannelVersionRecord) (PaymentChannelRecord, PaymentChannelVersionRecord, error)
	UpdatePaymentChannel(channel PaymentChannelRecord) (PaymentChannelRecord, error)
	RotatePaymentChannelVersion(channelID string, version PaymentChannelVersionRecord) (PaymentChannelVersionRecord, error)
	ListRechargeProducts() ([]RechargeProductRecord, error)
	LoadRechargeProduct(id string) (RechargeProductRecord, error)
	CreateRechargeProduct(product RechargeProductRecord) (RechargeProductRecord, error)
	UpdateRechargeProduct(product RechargeProductRecord) (RechargeProductRecord, error)
	ArchiveRechargeProduct(id, actor, archivedAt string) (bool, error)
	SavePaymentSettings(settings PaymentSettingsRecord) (PaymentSettingsRecord, error)
}

const LogEventsDocumentName = "logs/events.jsonl"

func NewBackendFromEnv(dataDir string) (Backend, error) {
	backendType := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND")))
	if backendType == "" {
		backendType = "sqlite"
	}
	switch backendType {
	case "json":
		return NewJSONBackend(filepath.Join(dataDir, "accounts.json"), filepath.Join(dataDir, "auth_keys.json")), nil
	case "sqlite", "postgres", "postgresql", "mysql", "database":
		dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
		if dsn == "" {
			dsn = "sqlite:///" + filepath.ToSlash(filepath.Join(dataDir, "chatgpt2api.db"))
		}
		return NewDatabaseBackend(dsn)
	default:
		return nil, fmt.Errorf("unknown storage backend: %s", backendType)
	}
}
