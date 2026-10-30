package storage

import (
	"errors"
	"strings"
	"time"
)

func (b *DatabaseBackend) LoadPaymentSettings() (PaymentSettingsRecord, error) {
	var item PaymentSettingsRecord
	var rechargeEnabled, customEnabled, cloudStorageEnabled bool
	err := b.db.QueryRow(`SELECT recharge_enabled, custom_credits_enabled, credit_unit_price_fen,
		cloud_storage_enabled, cloud_storage_policy_started_at, min_custom_credits, max_custom_credits, updated_by, updated_at FROM payment_settings WHERE id = 1`).
		Scan(&rechargeEnabled, &customEnabled, &item.CreditUnitPriceFen, &cloudStorageEnabled,
			&item.CloudStoragePolicyStartedAt, &item.MinCustomCredits, &item.MaxCustomCredits, &item.UpdatedBy, &item.UpdatedAt)
	item.RechargeEnabled, item.CustomCreditsEnabled, item.CloudStorageEnabled = rechargeEnabled, customEnabled, cloudStorageEnabled
	return item, err
}

func (b *DatabaseBackend) SavePaymentSettings(item PaymentSettingsRecord) (PaymentSettingsRecord, error) {
	if item.CreditUnitPriceFen <= 0 || item.MinCustomCredits <= 0 || item.MaxCustomCredits < item.MinCustomCredits || strings.TrimSpace(item.UpdatedAt) == "" {
		return PaymentSettingsRecord{}, errors.New("payment settings 字段无效")
	}
	result, err := b.db.Exec(`UPDATE payment_settings SET recharge_enabled = `+b.placeholder(1)+`, custom_credits_enabled = `+b.placeholder(2)+`, cloud_storage_policy_started_at = CASE WHEN cloud_storage_enabled = FALSE AND `+b.placeholder(3)+` = TRUE THEN `+b.placeholder(4)+` ELSE cloud_storage_policy_started_at END, cloud_storage_enabled = `+b.placeholder(5)+`, credit_unit_price_fen = `+b.placeholder(6)+`, min_custom_credits = `+b.placeholder(7)+`, max_custom_credits = `+b.placeholder(8)+`, updated_by = `+b.placeholder(9)+`, updated_at = `+b.placeholder(10)+` WHERE id = 1`, item.RechargeEnabled, item.CustomCreditsEnabled, item.CloudStorageEnabled, strings.TrimSpace(item.UpdatedAt), item.CloudStorageEnabled, item.CreditUnitPriceFen, item.MinCustomCredits, item.MaxCustomCredits, strings.TrimSpace(item.UpdatedBy), strings.TrimSpace(item.UpdatedAt))
	if err != nil {
		return PaymentSettingsRecord{}, err
	}
	if err := b.requirePaymentRowUpdated(result, b.db, "payment_settings", "id = 1"); err != nil {
		return PaymentSettingsRecord{}, err
	}
	return b.LoadPaymentSettings()
}

func (b *DatabaseBackend) LoadPaymentStats(nowValue string) (PaymentStatsRecord, error) {
	now, err := time.Parse(time.RFC3339Nano, nowValue)
	if err != nil {
		return PaymentStatsRecord{}, err
	}
	loc := paymentStatsLocation()
	now = now.In(loc)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	periods := make([]PaymentStatsPeriod, 4)
	periods[0], err = b.loadPaymentStatsPeriod(day, day.AddDate(0, 0, 1))
	if err != nil {
		return PaymentStatsRecord{}, err
	}
	periods[1], err = b.loadPaymentStatsPeriod(day.AddDate(0, 0, -6), day.AddDate(0, 0, 1))
	if err != nil {
		return PaymentStatsRecord{}, err
	}
	periods[2], err = b.loadPaymentStatsPeriod(month, month.AddDate(0, 1, 0))
	if err != nil {
		return PaymentStatsRecord{}, err
	}
	periods[3], err = b.loadPaymentStatsPeriod(time.Time{}, time.Time{})
	if err != nil {
		return PaymentStatsRecord{}, err
	}

	trend := make([]PaymentStatsDay, 0, 7)
	for offset := -6; offset <= 0; offset++ {
		start := day.AddDate(0, 0, offset)
		period, periodErr := b.loadPaymentStatsPeriod(start, start.AddDate(0, 0, 1))
		if periodErr != nil {
			return PaymentStatsRecord{}, periodErr
		}
		trend = append(trend, PaymentStatsDay{Date: start.Format("2006-01-02"), TotalOrders: period.TotalOrders, SucceededOrders: period.SucceededOrders, SucceededAmountFen: period.SucceededAmountFen})
	}
	channels, err := b.loadPaymentStatsChannels()
	if err != nil {
		return PaymentStatsRecord{}, err
	}
	return PaymentStatsRecord{Today: periods[0], Last7Days: periods[1], CurrentMonth: periods[2], AllTime: periods[3], ChannelBreakdown: channels, DailyTrend: trend}, nil
}

func paymentStatsLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return loc
}

func (b *DatabaseBackend) loadPaymentStatsPeriod(start, end time.Time) (PaymentStatsPeriod, error) {
	period := PaymentStatsPeriod{}
	query := `SELECT COUNT(*),
		COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status IN ('failed', 'exception') THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_fen ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status = 'succeeded' AND product_type_snapshot = 'credits' THEN credits_snapshot ELSE 0 END), 0)
		FROM payment_orders`
	args := []any{}
	if !start.IsZero() {
		query = `SELECT
			COALESCE(SUM(CASE WHEN created_at >= ` + b.placeholder(1) + ` AND created_at < ` + b.placeholder(2) + ` THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'succeeded' AND paid_at >= ` + b.placeholder(3) + ` AND paid_at < ` + b.placeholder(4) + ` THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status IN ('failed', 'exception') AND created_at >= ` + b.placeholder(5) + ` AND created_at < ` + b.placeholder(6) + ` THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'closed' AND created_at >= ` + b.placeholder(7) + ` AND created_at < ` + b.placeholder(8) + ` THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'succeeded' AND paid_at >= ` + b.placeholder(9) + ` AND paid_at < ` + b.placeholder(10) + ` THEN amount_fen ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'succeeded' AND product_type_snapshot = 'credits' AND paid_at >= ` + b.placeholder(11) + ` AND paid_at < ` + b.placeholder(12) + ` THEN credits_snapshot ELSE 0 END), 0)
			FROM payment_orders`
		startValue := formatUTCZeroNanoBound(start)
		endValue := formatUTCZeroNanoBound(end)
		args = []any{startValue, endValue, startValue, endValue, startValue, endValue, startValue, endValue, startValue, endValue, startValue, endValue}
	}
	if err := b.db.QueryRow(query, args...).Scan(&period.TotalOrders, &period.SucceededOrders, &period.FailedOrders, &period.ClosedOrders, &period.SucceededAmountFen, &period.CreditedCredits); err != nil {
		return PaymentStatsPeriod{}, err
	}
	if period.TotalOrders > 0 {
		period.SuccessRate = float64(period.SucceededOrders) * 100 / float64(period.TotalOrders)
	}
	return period, nil
}

func (b *DatabaseBackend) loadPaymentStatsChannels() ([]PaymentStatsChannel, error) {
	rows, err := b.db.Query(`SELECT channel_id, COUNT(*), COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0), COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_fen ELSE 0 END), 0) FROM payment_orders GROUP BY channel_id ORDER BY COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_fen ELSE 0 END), 0) DESC, channel_id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PaymentStatsChannel, 0)
	for rows.Next() {
		var item PaymentStatsChannel
		if err := rows.Scan(&item.ChannelID, &item.TotalOrders, &item.SucceededOrders, &item.SucceededAmountFen); err != nil {
			return nil, err
		}
		if item.TotalOrders > 0 {
			item.SuccessRate = float64(item.SucceededOrders) * 100 / float64(item.TotalOrders)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
