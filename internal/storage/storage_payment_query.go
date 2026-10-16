package storage

import (
	"fmt"
	"strings"
)

func (b *DatabaseBackend) QueryPaymentOrders(filter PaymentOrderFilter) ([]PaymentOrderRecord, int, error) {
	filter = normalizePaymentOrderFilter(filter)
	where, args := b.paymentOrderFilterWhere(filter)
	var total int
	if err := b.db.QueryRow(`SELECT COUNT(*) FROM payment_orders WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limitPlaceholder := b.placeholder(len(args) + 1)
	offsetPlaceholder := b.placeholder(len(args) + 2)
	queryArgs := append(append([]any(nil), args...), filter.PageSize, (filter.Page-1)*filter.PageSize)
	rows, err := b.db.Query(paymentOrderSelect+where+` ORDER BY created_at DESC, id DESC LIMIT `+
		limitPlaceholder+` OFFSET `+offsetPlaceholder, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]PaymentOrderRecord, 0)
	for rows.Next() {
		item, err := scanPaymentOrder(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func normalizePaymentOrderFilter(filter PaymentOrderFilter) PaymentOrderFilter {
	if filter.Page <= 0 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}
	if filter.PageSize > 100 {
		filter.PageSize = 100
	}
	filter.Keyword = strings.ToLower(strings.TrimSpace(filter.Keyword))
	filter.Status = strings.ToLower(strings.TrimSpace(filter.Status))
	filter.ChannelID = strings.TrimSpace(filter.ChannelID)
	filter.UserID = strings.TrimSpace(filter.UserID)
	filter.StartAt = strings.TrimSpace(filter.StartAt)
	filter.EndAt = strings.TrimSpace(filter.EndAt)
	return filter
}

func (b *DatabaseBackend) paymentOrderFilterWhere(filter PaymentOrderFilter) (string, []any) {
	clauses := make([]string, 0, 7)
	args := make([]any, 0, 7)
	add := func(format string, value any) {
		args = append(args, value)
		clauses = append(clauses, fmt.Sprintf(format, b.placeholder(len(args))))
	}
	if filter.Keyword != "" {
		pattern := "%" + filter.Keyword + "%"
		placeholders := make([]string, 0, 5)
		for range 5 {
			args = append(args, pattern)
			placeholders = append(placeholders, b.placeholder(len(args)))
		}
		clauses = append(clauses, `(LOWER(id) LIKE `+placeholders[0]+` OR LOWER(out_trade_no) LIKE `+placeholders[1]+
			` OR LOWER(user_id) LIKE `+placeholders[2]+` OR LOWER(COALESCE(transaction_id, '')) LIKE `+placeholders[3]+
			` OR LOWER(product_name_snapshot) LIKE `+placeholders[4]+`)`)
	}
	if filter.Status != "" {
		add(`status = %s`, filter.Status)
	}
	if filter.ChannelID != "" {
		add(`channel_id = %s`, filter.ChannelID)
	}
	if filter.UserID != "" {
		add(`user_id = %s`, filter.UserID)
	}
	if filter.StartAt != "" {
		add(`created_at >= %s`, filter.StartAt)
	}
	if filter.EndAt != "" {
		add(`created_at <= %s`, filter.EndAt)
	}
	if len(clauses) == 0 {
		return "1 = 1", args
	}
	return strings.Join(clauses, " AND "), args
}
