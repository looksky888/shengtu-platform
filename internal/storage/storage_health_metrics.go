package storage

import "fmt"

func (b *DatabaseBackend) CountPendingMediaAssets() (int, error) {
	var count int
	err := b.db.QueryRow(`SELECT COUNT(*) FROM media_assets WHERE status = 'pending' AND deleted_at = ''`).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count pending media assets: %w", err)
	}
	return count, nil
}

func (b *DatabaseBackend) PaymentEventHealth() (PaymentEventHealth, error) {
	var health PaymentEventHealth
	err := b.db.QueryRow(`SELECT
		COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
		COALESCE(MIN(CASE WHEN status = 'pending' THEN received_at ELSE NULL END), '')
		FROM payment_events`).Scan(&health.Pending, &health.Failed, &health.OldestPendingAt)
	if err != nil {
		return PaymentEventHealth{}, fmt.Errorf("load payment event health: %w", err)
	}
	return health, nil
}
