package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"chatgpt2api/internal/storage"
)

type PaymentOrderAdminQuery struct {
	Page      int
	PageSize  int
	Keyword   string
	Status    string
	ChannelID string
	UserID    string
	StartAt   string
	EndAt     string
}

type PaymentOrderAdminPublic struct {
	ID                 string `json:"id"`
	OutTradeNo         string `json:"out_trade_no"`
	UserID             string `json:"user_id"`
	ChannelID          string `json:"channel_id"`
	ChannelVersionID   string `json:"channel_version_id"`
	ProductID          string `json:"product_id"`
	ProductName        string `json:"product_name"`
	AmountFen          int64  `json:"amount_fen"`
	Credits            int    `json:"credits"`
	Currency           string `json:"currency"`
	ExpiresAt          string `json:"expires_at"`
	Status             string `json:"status"`
	ProviderTradeState string `json:"provider_trade_state,omitempty"`
	ProviderTradeDesc  string `json:"provider_trade_desc,omitempty"`
	TransactionID      string `json:"transaction_id,omitempty"`
	ProviderRequestID  string `json:"provider_request_id,omitempty"`
	LastQueryAt        string `json:"last_query_at,omitempty"`
	QueryAttempts      int    `json:"query_attempts"`
	PaidAt             string `json:"paid_at,omitempty"`
	CreditedAt         string `json:"credited_at,omitempty"`
	ClosedAt           string `json:"closed_at,omitempty"`
	LastErrorCode      string `json:"last_error_code,omitempty"`
	LastErrorMessage   string `json:"last_error_message,omitempty"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type PaymentOrderAdminPage struct {
	Items    []PaymentOrderAdminPublic `json:"items"`
	Total    int                       `json:"total"`
	Page     int                       `json:"page"`
	PageSize int                       `json:"page_size"`
}

var paymentOrderStatuses = map[string]struct{}{
	storage.PaymentOrderStatusCreated: {}, storage.PaymentOrderStatusPending: {},
	storage.PaymentOrderStatusClosing: {}, storage.PaymentOrderStatusSucceeded: {},
	storage.PaymentOrderStatusClosed: {}, storage.PaymentOrderStatusFailed: {},
	storage.PaymentOrderStatusException: {},
}

func (s *PaymentAdminService) QueryOrders(query PaymentOrderAdminQuery) (PaymentOrderAdminPage, error) {
	if !s.Available() {
		return PaymentOrderAdminPage{}, errors.New("在线支付需要数据库存储后端")
	}
	query = normalizePaymentOrderAdminQuery(query)
	if query.Status != "" {
		if _, ok := paymentOrderStatuses[query.Status]; !ok {
			return PaymentOrderAdminPage{}, errors.New("支付订单状态筛选无效")
		}
	}
	startTime, startAt, err := parsePaymentOrderFilterTime(query.StartAt)
	if err != nil {
		return PaymentOrderAdminPage{}, errors.New("支付订单开始时间无效")
	}
	endTime, endAt, err := parsePaymentOrderFilterTime(query.EndAt)
	if err != nil {
		return PaymentOrderAdminPage{}, errors.New("支付订单结束时间无效")
	}
	if startAt != "" && endAt != "" && startTime.After(endTime) {
		return PaymentOrderAdminPage{}, errors.New("支付订单开始时间不能晚于结束时间")
	}
	query.StartAt, query.EndAt = startAt, endAt
	items, total, err := s.backend.QueryPaymentOrders(storage.PaymentOrderFilter{
		Page: query.Page, PageSize: query.PageSize, Keyword: query.Keyword, Status: query.Status,
		ChannelID: query.ChannelID, UserID: query.UserID, StartAt: query.StartAt, EndAt: query.EndAt,
	})
	if err != nil {
		return PaymentOrderAdminPage{}, err
	}
	out := make([]PaymentOrderAdminPublic, 0, len(items))
	for _, item := range items {
		out = append(out, publicPaymentOrderAdmin(item))
	}
	return PaymentOrderAdminPage{Items: out, Total: total, Page: query.Page, PageSize: query.PageSize}, nil
}

func (s *PaymentAdminService) GetOrder(id string) (PaymentOrderAdminPublic, error) {
	if !s.Available() {
		return PaymentOrderAdminPublic{}, errors.New("在线支付需要数据库存储后端")
	}
	item, err := s.backend.LoadPaymentOrderByID(strings.TrimSpace(id))
	if err != nil {
		return PaymentOrderAdminPublic{}, err
	}
	return publicPaymentOrderAdmin(item), nil
}

func (s *PaymentService) QueryOrderAsAdmin(ctx context.Context, orderID string) (PaymentOrderAdminPublic, error) {
	if !s.Available() || s.credits == nil {
		return PaymentOrderAdminPublic{}, errors.New("支付到账服务尚未就绪")
	}
	order, err := s.backend.LoadPaymentOrderByID(strings.TrimSpace(orderID))
	if err != nil {
		return PaymentOrderAdminPublic{}, err
	}
	if order.Status != storage.PaymentOrderStatusSucceeded && order.Status != storage.PaymentOrderStatusClosed {
		expired, err := paymentOrderExpired(order, s.now().UTC())
		if err != nil {
			return PaymentOrderAdminPublic{}, err
		}
		if _, err := s.reconcileOrder(ctx, order, expired); err != nil {
			return PaymentOrderAdminPublic{}, err
		}
		order, err = s.backend.LoadPaymentOrderByID(order.ID)
		if err != nil {
			return PaymentOrderAdminPublic{}, err
		}
	}
	return publicPaymentOrderAdmin(order), nil
}

func normalizePaymentOrderAdminQuery(query PaymentOrderAdminQuery) PaymentOrderAdminQuery {
	if query.Page <= 0 {
		query.Page = 1
	}
	if query.PageSize <= 0 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	query.Keyword = strings.TrimSpace(query.Keyword)
	query.Status = strings.ToLower(strings.TrimSpace(query.Status))
	query.ChannelID = strings.TrimSpace(query.ChannelID)
	query.UserID = strings.TrimSpace(query.UserID)
	query.StartAt = strings.TrimSpace(query.StartAt)
	query.EndAt = strings.TrimSpace(query.EndAt)
	return query
}

func parsePaymentOrderFilterTime(value string) (time.Time, string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, "", nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, value)
		if err != nil {
			return time.Time{}, "", err
		}
	}
	return parsed.UTC(), parsed.UTC().Format(time.RFC3339Nano), nil
}

func publicPaymentOrderAdmin(item storage.PaymentOrderRecord) PaymentOrderAdminPublic {
	return PaymentOrderAdminPublic{
		ID: item.ID, OutTradeNo: item.OutTradeNo, UserID: item.UserID, ChannelID: item.ChannelID,
		ChannelVersionID: item.ChannelVersionID, ProductID: item.ProductID, ProductName: item.ProductNameSnapshot,
		AmountFen: item.AmountFen, Credits: item.CreditsSnapshot, Currency: item.Currency,
		ExpiresAt: item.ExpiresAt, Status: item.Status, ProviderTradeState: item.ProviderTradeState,
		ProviderTradeDesc: item.ProviderTradeDesc, TransactionID: item.TransactionID,
		ProviderRequestID: item.ProviderRequestID, LastQueryAt: item.LastQueryAt,
		QueryAttempts: item.QueryAttempts, PaidAt: item.PaidAt, CreditedAt: item.CreditedAt,
		ClosedAt: item.ClosedAt, LastErrorCode: item.LastErrorCode, LastErrorMessage: item.LastErrorMessage,
		CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt,
	}
}
