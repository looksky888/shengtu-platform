package storage

import (
	"errors"
	"strings"
	"time"
)

func (b *DatabaseBackend) LoadPaymentSettings() (PaymentSettingsRecord, error) {
	var item PaymentSettingsRecord
	var rechargeEnabled, customEnabled, cloudStorageEnabled int
	err := b.reader().QueryRow(`SELECT recharge_enabled, custom_credits_enabled, credit_unit_price_fen,
		cloud_storage_enabled, cloud_storage_policy_started_at, free_retention_days, vip_grace_days, historical_grace_days,
		min_custom_credits, max_custom_credits, updated_by, updated_at FROM payment_settings WHERE id = 1`).
		Scan(&rechargeEnabled, &customEnabled, &item.CreditUnitPriceFen, &cloudStorageEnabled,
			&item.CloudStoragePolicyStartedAt, &item.FreeRetentionDays, &item.VIPGraceDays, &item.HistoricalGraceDays,
			&item.MinCustomCredits, &item.MaxCustomCredits, &item.UpdatedBy, &item.UpdatedAt)
	item.RechargeEnabled = rechargeEnabled != 0
	item.CustomCreditsEnabled = customEnabled != 0
	item.CloudStorageEnabled = cloudStorageEnabled != 0
	if item.FreeRetentionDays <= 0 {
		item.FreeRetentionDays = DefaultFreeRetentionDays
	}
	if item.VIPGraceDays <= 0 {
		item.VIPGraceDays = DefaultVIPGraceDays
	}
	if item.HistoricalGraceDays <= 0 {
		item.HistoricalGraceDays = DefaultHistoricalGraceDays
	}
	return item, err
}

func (b *DatabaseBackend) SavePaymentSettings(item PaymentSettingsRecord) (PaymentSettingsRecord, error) {
	if item.CreditUnitPriceFen <= 0 || item.MinCustomCredits <= 0 || item.MaxCustomCredits < item.MinCustomCredits || strings.TrimSpace(item.UpdatedAt) == "" {
		return PaymentSettingsRecord{}, errors.New("payment settings 字段无效")
	}
	if item.FreeRetentionDays < 0 || item.FreeRetentionDays > MaxPaymentRetentionDays ||
		item.VIPGraceDays < 0 || item.VIPGraceDays > MaxPaymentRetentionDays ||
		item.HistoricalGraceDays < 0 || item.HistoricalGraceDays > MaxPaymentRetentionDays {
		return PaymentSettingsRecord{}, errors.New("payment settings 字段无效")
	}
	cloudStorageFlag := boolInt(item.CloudStorageEnabled)
	result, err := b.db.Exec(
		`UPDATE payment_settings SET recharge_enabled = `+b.placeholder(1)+
			`, custom_credits_enabled = `+b.placeholder(2)+
			`, cloud_storage_policy_started_at = CASE WHEN cloud_storage_enabled = 0 AND `+b.placeholder(3)+` <> 0 THEN `+b.placeholder(4)+` ELSE cloud_storage_policy_started_at END`+
			`, cloud_storage_enabled = `+b.placeholder(5)+
			`, free_retention_days = CASE WHEN `+b.placeholder(6)+` > 0 THEN `+b.placeholder(7)+` WHEN free_retention_days > 0 THEN free_retention_days ELSE `+b.placeholder(8)+` END`+
			`, vip_grace_days = CASE WHEN `+b.placeholder(9)+` > 0 THEN `+b.placeholder(10)+` WHEN vip_grace_days > 0 THEN vip_grace_days ELSE `+b.placeholder(11)+` END`+
			`, historical_grace_days = CASE WHEN `+b.placeholder(12)+` > 0 THEN `+b.placeholder(13)+` WHEN historical_grace_days > 0 THEN historical_grace_days ELSE `+b.placeholder(14)+` END`+
			`, credit_unit_price_fen = `+b.placeholder(15)+
			`, min_custom_credits = `+b.placeholder(16)+
			`, max_custom_credits = `+b.placeholder(17)+
			`, updated_by = `+b.placeholder(18)+
			`, updated_at = `+b.placeholder(19)+` WHERE id = 1`,
		boolInt(item.RechargeEnabled),
		boolInt(item.CustomCreditsEnabled),
		cloudStorageFlag,
		strings.TrimSpace(item.UpdatedAt),
		cloudStorageFlag,
		item.FreeRetentionDays, item.FreeRetentionDays, DefaultFreeRetentionDays,
		item.VIPGraceDays, item.VIPGraceDays, DefaultVIPGraceDays,
		item.HistoricalGraceDays, item.HistoricalGraceDays, DefaultHistoricalGraceDays,
		item.CreditUnitPriceFen,
		item.MinCustomCredits,
		item.MaxCustomCredits,
		strings.TrimSpace(item.UpdatedBy),
		strings.TrimSpace(item.UpdatedAt),
	)
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
	tomorrow := day.AddDate(0, 0, 1)
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)

	cols := make([]string, 0, 48)
	args := make([]any, 0, 84)
	addArg := func(val any) string {
		args = append(args, val)
		return b.placeholder(len(args))
	}
	addPeriod := func(start, end time.Time) {
		s := formatUTCZeroNanoBound(start)
		e := formatUTCZeroNanoBound(end)
		p1, p2 := addArg(s), addArg(e)
		p3, p4 := addArg(s), addArg(e)
		p5, p6 := addArg(s), addArg(e)
		p7, p8 := addArg(s), addArg(e)
		p9, p10 := addArg(s), addArg(e)
		p11, p12 := addArg(s), addArg(e)
		cols = append(cols,
			`COALESCE(SUM(CASE WHEN created_at >= `+p1+` AND created_at < `+p2+` THEN 1 ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status = 'succeeded' AND paid_at >= `+p3+` AND paid_at < `+p4+` THEN 1 ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status IN ('failed', 'exception') AND created_at >= `+p5+` AND created_at < `+p6+` THEN 1 ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status IN ('closed', 'expired') AND created_at >= `+p7+` AND created_at < `+p8+` THEN 1 ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status = 'succeeded' AND paid_at >= `+p9+` AND paid_at < `+p10+` THEN amount_fen ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status = 'succeeded' AND product_type_snapshot = 'credits' AND paid_at >= `+p11+` AND paid_at < `+p12+` THEN credits_snapshot ELSE 0 END), 0)`,
		)
	}

	addPeriod(day, tomorrow)                    // Today
	addPeriod(day.AddDate(0, 0, -6), tomorrow)  // Last7Days
	addPeriod(day.AddDate(0, 0, -29), tomorrow) // Last30Days
	addPeriod(month, month.AddDate(0, 1, 0))    // CurrentMonth
	cols = append(cols,
		`COUNT(*)`,
		`COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0)`,
		`COALESCE(SUM(CASE WHEN status IN ('failed', 'exception') THEN 1 ELSE 0 END), 0)`,
		`COALESCE(SUM(CASE WHEN status IN ('closed', 'expired') THEN 1 ELSE 0 END), 0)`,
		`COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_fen ELSE 0 END), 0)`,
		`COALESCE(SUM(CASE WHEN status = 'succeeded' AND product_type_snapshot = 'credits' THEN credits_snapshot ELSE 0 END), 0)`,
	)

	trend := make([]PaymentStatsDay, 7)
	for i := 0; i < 6; i++ {
		start := day.AddDate(0, 0, i-6)
		trend[i].Date = start.Format("2006-01-02")
		s := formatUTCZeroNanoBound(start)
		e := formatUTCZeroNanoBound(start.AddDate(0, 0, 1))
		p1, p2 := addArg(s), addArg(e)
		p3, p4 := addArg(s), addArg(e)
		p5, p6 := addArg(s), addArg(e)
		cols = append(cols,
			`COALESCE(SUM(CASE WHEN created_at >= `+p1+` AND created_at < `+p2+` THEN 1 ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status = 'succeeded' AND paid_at >= `+p3+` AND paid_at < `+p4+` THEN 1 ELSE 0 END), 0)`,
			`COALESCE(SUM(CASE WHEN status = 'succeeded' AND paid_at >= `+p5+` AND paid_at < `+p6+` THEN amount_fen ELSE 0 END), 0)`,
		)
	}
	trend[6].Date = day.Format("2006-01-02")

	periods := make([]PaymentStatsPeriod, 5)
	dest := make([]any, 0, 48)
	for i := range periods {
		dest = append(dest,
			&periods[i].TotalOrders,
			&periods[i].SucceededOrders,
			&periods[i].FailedOrders,
			&periods[i].ClosedOrders,
			&periods[i].SucceededAmountFen,
			&periods[i].CreditedCredits,
		)
	}
	for i := 0; i < 6; i++ {
		dest = append(dest, &trend[i].TotalOrders, &trend[i].SucceededOrders, &trend[i].SucceededAmountFen)
	}

	query := `SELECT ` + strings.Join(cols, ", ") + ` FROM payment_orders`
	if err := b.reader().QueryRow(query, args...).Scan(dest...); err != nil {
		return PaymentStatsRecord{}, err
	}
	for i := range periods {
		periods[i].SuccessRate = computeClampedSuccessRate(periods[i].SucceededOrders, periods[i].TotalOrders)
	}
	trend[6].TotalOrders = periods[0].TotalOrders
	trend[6].SucceededOrders = periods[0].SucceededOrders
	trend[6].SucceededAmountFen = periods[0].SucceededAmountFen

	channels, err := b.loadPaymentStatsChannels()
	if err != nil {
		return PaymentStatsRecord{}, err
	}
	return PaymentStatsRecord{
		Today:            periods[0],
		Last7Days:        periods[1],
		Last30Days:       periods[2],
		CurrentMonth:     periods[3],
		AllTime:          periods[4],
		ChannelBreakdown: channels,
		DailyTrend:       trend,
	}, nil
}

func paymentStatsLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	return loc
}

func computeClampedSuccessRate(succeeded, total int) float64 {
	if succeeded <= 0 {
		return 0
	}
	if total <= 0 || succeeded >= total {
		return 100
	}
	rate := float64(succeeded) * 100 / float64(total)
	if rate > 100 {
		return 100
	}
	return rate
}

func (b *DatabaseBackend) CountPaidUsers() (int, error) {
	var count int
	err := b.reader().QueryRow(
		`SELECT COUNT(DISTINCT user_id) FROM payment_orders WHERE status = `+b.placeholder(1)+` AND user_id <> ''`,
		PaymentOrderStatusSucceeded,
	).Scan(&count)
	return count, err
}

func (b *DatabaseBackend) loadPaymentStatsChannels() ([]PaymentStatsChannel, error) {
	rows, err := b.reader().Query(`SELECT channel_id, COUNT(*), COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0), COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_fen ELSE 0 END), 0) FROM payment_orders GROUP BY channel_id ORDER BY COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_fen ELSE 0 END), 0) DESC, channel_id ASC`)
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
		item.SuccessRate = computeClampedSuccessRate(item.SucceededOrders, item.TotalOrders)
		items = append(items, item)
	}
	return items, rows.Err()
}
