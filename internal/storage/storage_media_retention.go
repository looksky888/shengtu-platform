package storage

import (
	"fmt"
	"strings"
)

func (b *DatabaseBackend) ListMediaAssetsBefore(policyStart, cutoff string, limit int, beforeSortKey, beforePath string) ([]MediaAssetRecord, error) {
	policyStart, cutoff = strings.TrimSpace(policyStart), strings.TrimSpace(cutoff)
	if policyStart == "" || cutoff == "" {
		return nil, fmt.Errorf("media retention policy start and cutoff are required")
	}
	if limit < 1 || limit > 500 {
		limit = 100
	}
	where := []string{`media_type = 'image'`, `status = 'ready'`, `deleted_at = ''`, `created_at >= ` + b.placeholder(1), `created_at < ` + b.placeholder(2)}
	args := []any{policyStart, cutoff}
	if strings.TrimSpace(beforeSortKey) != "" && strings.TrimSpace(beforePath) != "" {
		where = append(where, ` (created_at > `+b.placeholder(3)+` OR (created_at = `+b.placeholder(4)+` AND path > `+b.placeholder(5)+`))`)
		args = append(args, beforeSortKey, beforeSortKey, beforePath)
	}
	args = append(args, limit)
	query := `SELECT ` + mediaAssetColumns + ` FROM media_assets WHERE ` + strings.Join(where, " AND ") + ` ORDER BY created_at ASC, path ASC LIMIT ` + b.placeholder(len(args))
	rows, err := b.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list expired media assets: %w", err)
	}
	defer rows.Close()
	items := make([]MediaAssetRecord, 0, limit)
	for rows.Next() {
		item, scanErr := scanMediaAsset(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
