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
	createdExpr := b.utcSortableExpr("created_at")
	normPolicyStart := normalizeUTCSortableISO(policyStart)
	normCutoff := normalizeUTCSortableISO(cutoff)
	where := []string{
		`media_type = 'image'`,
		`status = 'ready'`,
		`deleted_at = ''`,
		`visibility <> 'public'`,
		createdExpr + ` >= ` + b.placeholder(1),
		createdExpr + ` < ` + b.placeholder(2),
	}
	args := []any{normPolicyStart, normCutoff}
	if strings.TrimSpace(beforeSortKey) != "" && strings.TrimSpace(beforePath) != "" {
		normBeforeKey := normalizeUTCSortableISO(beforeSortKey)
		where = append(where, ` (`+createdExpr+` > `+b.placeholder(3)+` OR (`+createdExpr+` = `+b.placeholder(4)+` AND path > `+b.placeholder(5)+`))`)
		args = append(args, normBeforeKey, normBeforeKey, strings.TrimSpace(beforePath))
	}
	args = append(args, limit)
	query := `SELECT ` + mediaAssetColumns + ` FROM media_assets WHERE ` + strings.Join(where, " AND ") + ` ORDER BY ` + createdExpr + ` ASC, path ASC LIMIT ` + b.placeholder(len(args))
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

// ListPrePolicyMediaAssets lists ready image assets created strictly before policyStart
// in chronological order so pre-policy historical cleanup can proceed in bounded sweeps
// after historical_grace_days has elapsed.
func (b *DatabaseBackend) ListPrePolicyMediaAssets(policyStart string, limit int, beforeSortKey, beforePath string) ([]MediaAssetRecord, error) {
	policyStart = strings.TrimSpace(policyStart)
	if policyStart == "" {
		return nil, fmt.Errorf("media retention policy start is required")
	}
	if limit < 1 || limit > 500 {
		limit = 100
	}
	createdExpr := b.utcSortableExpr("created_at")
	normPolicyStart := normalizeUTCSortableISO(policyStart)
	where := []string{
		`media_type = 'image'`,
		`status = 'ready'`,
		`deleted_at = ''`,
		`visibility <> 'public'`,
		createdExpr + ` < ` + b.placeholder(1),
	}
	args := []any{normPolicyStart}
	if strings.TrimSpace(beforeSortKey) != "" && strings.TrimSpace(beforePath) != "" {
		normBeforeKey := normalizeUTCSortableISO(beforeSortKey)
		where = append(where, ` (`+createdExpr+` > `+b.placeholder(2)+` OR (`+createdExpr+` = `+b.placeholder(3)+` AND path > `+b.placeholder(4)+`))`)
		args = append(args, normBeforeKey, normBeforeKey, strings.TrimSpace(beforePath))
	}
	args = append(args, limit)
	query := `SELECT ` + mediaAssetColumns + ` FROM media_assets WHERE ` + strings.Join(where, " AND ") + ` ORDER BY ` + createdExpr + ` ASC, path ASC LIMIT ` + b.placeholder(len(args))
	rows, err := b.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list pre-policy media assets: %w", err)
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
