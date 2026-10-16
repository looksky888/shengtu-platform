package storage

import (
	"database/sql"
	"fmt"
	"strings"
)

const mediaAssetColumns = `id, path, owner_id, owner_name, media_type, object_key, thumbnail_key, content_type, size_bytes, sha256, width, height, visibility, status, resolution_preset, requested_size, output_format, created_at, published_at, updated_at, deleted_at, retry_at, last_error`

func (b *DatabaseBackend) SaveMediaAsset(item MediaAssetRecord) error {
	values := []any{item.ID, item.Path, item.OwnerID, item.OwnerName, item.MediaType, item.ObjectKey, item.ThumbnailKey, item.ContentType, item.SizeBytes, item.SHA256, item.Width, item.Height, item.Visibility, item.Status, item.ResolutionPreset, item.RequestedSize, item.OutputFormat, item.CreatedAt, item.PublishedAt, item.UpdatedAt, item.DeletedAt, item.RetryAt, item.LastError}
	placeholders := make([]string, len(values))
	for i := range placeholders {
		placeholders[i] = b.placeholder(i + 1)
	}
	var query string
	switch b.driver {
	case "postgres":
		query = `INSERT INTO media_assets (` + mediaAssetColumns + `) VALUES (` + strings.Join(placeholders, ",") + `) ON CONFLICT (path) DO UPDATE SET owner_id=EXCLUDED.owner_id, owner_name=EXCLUDED.owner_name, media_type=EXCLUDED.media_type, object_key=EXCLUDED.object_key, thumbnail_key=EXCLUDED.thumbnail_key, content_type=EXCLUDED.content_type, size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256, width=EXCLUDED.width, height=EXCLUDED.height, visibility=EXCLUDED.visibility, status=EXCLUDED.status, resolution_preset=EXCLUDED.resolution_preset, requested_size=EXCLUDED.requested_size, output_format=EXCLUDED.output_format, created_at=EXCLUDED.created_at, published_at=EXCLUDED.published_at, updated_at=EXCLUDED.updated_at, deleted_at=EXCLUDED.deleted_at, retry_at=EXCLUDED.retry_at, last_error=EXCLUDED.last_error`
	case "mysql":
		query = `INSERT INTO media_assets (` + mediaAssetColumns + `) VALUES (` + strings.Join(placeholders, ",") + `) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id), owner_name=VALUES(owner_name), media_type=VALUES(media_type), object_key=VALUES(object_key), thumbnail_key=VALUES(thumbnail_key), content_type=VALUES(content_type), size_bytes=VALUES(size_bytes), sha256=VALUES(sha256), width=VALUES(width), height=VALUES(height), visibility=VALUES(visibility), status=VALUES(status), resolution_preset=VALUES(resolution_preset), requested_size=VALUES(requested_size), output_format=VALUES(output_format), created_at=VALUES(created_at), published_at=VALUES(published_at), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at), retry_at=VALUES(retry_at), last_error=VALUES(last_error)`
	default:
		query = `INSERT INTO media_assets (` + mediaAssetColumns + `) VALUES (` + strings.Join(placeholders, ",") + `) ON CONFLICT(path) DO UPDATE SET owner_id=excluded.owner_id, owner_name=excluded.owner_name, media_type=excluded.media_type, object_key=excluded.object_key, thumbnail_key=excluded.thumbnail_key, content_type=excluded.content_type, size_bytes=excluded.size_bytes, sha256=excluded.sha256, width=excluded.width, height=excluded.height, visibility=excluded.visibility, status=excluded.status, resolution_preset=excluded.resolution_preset, requested_size=excluded.requested_size, output_format=excluded.output_format, created_at=excluded.created_at, published_at=excluded.published_at, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, retry_at=excluded.retry_at, last_error=excluded.last_error`
	}
	if _, err := b.db.Exec(query, values...); err != nil {
		return fmt.Errorf("save media asset: %w", err)
	}
	return nil
}

func (b *DatabaseBackend) UpdateMediaAssetUploadState(id, status, updatedAt, retryAt, lastError string) error {
	result, err := b.db.Exec(
		`UPDATE media_assets SET status = `+b.placeholder(1)+`, updated_at = `+b.placeholder(2)+`, retry_at = `+b.placeholder(3)+`, last_error = `+b.placeholder(4)+` WHERE id = `+b.placeholder(5),
		strings.TrimSpace(status), strings.TrimSpace(updatedAt), strings.TrimSpace(retryAt), strings.TrimSpace(lastError), strings.TrimSpace(id),
	)
	if err != nil {
		return fmt.Errorf("update media upload state: %w", err)
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read media upload state update result: %w", err)
	}
	if updated == 0 {
		return fmt.Errorf("update media upload state: media asset %q not found", strings.TrimSpace(id))
	}
	return nil
}

func scanMediaAsset(scanner interface{ Scan(...any) error }) (MediaAssetRecord, error) {
	var item MediaAssetRecord
	err := scanner.Scan(&item.ID, &item.Path, &item.OwnerID, &item.OwnerName, &item.MediaType, &item.ObjectKey, &item.ThumbnailKey, &item.ContentType, &item.SizeBytes, &item.SHA256, &item.Width, &item.Height, &item.Visibility, &item.Status, &item.ResolutionPreset, &item.RequestedSize, &item.OutputFormat, &item.CreatedAt, &item.PublishedAt, &item.UpdatedAt, &item.DeletedAt, &item.RetryAt, &item.LastError)
	return item, err
}

func (b *DatabaseBackend) LoadMediaAssetByID(id string) (MediaAssetRecord, bool, error) {
	item, err := scanMediaAsset(b.db.QueryRow(`SELECT `+mediaAssetColumns+` FROM media_assets WHERE id = `+b.placeholder(1), strings.TrimSpace(id)))
	if err == sql.ErrNoRows {
		return MediaAssetRecord{}, false, nil
	}
	if err != nil {
		return MediaAssetRecord{}, false, fmt.Errorf("load media asset by id: %w", err)
	}
	return item, true, nil
}

func (b *DatabaseBackend) ListPendingMediaAssets(limit int) ([]MediaAssetRecord, error) {
	if limit < 1 || limit > 1000 {
		limit = 100
	}
	nowPlaceholder := b.placeholder(1)
	limitPlaceholder := b.placeholder(2)
	rows, err := b.db.Query(`SELECT `+mediaAssetColumns+` FROM media_assets WHERE status = 'pending' AND deleted_at = '' AND (retry_at = '' OR retry_at <= `+nowPlaceholder+`) ORDER BY updated_at ASC LIMIT `+limitPlaceholder, mediaNowISO(), limit)
	if err != nil {
		return nil, fmt.Errorf("list pending media assets: %w", err)
	}
	defer rows.Close()
	items := make([]MediaAssetRecord, 0, limit)
	for rows.Next() {
		item, scanErr := scanMediaAsset(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan pending media asset: %w", scanErr)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending media assets: %w", err)
	}
	return items, nil
}

func (b *DatabaseBackend) LoadMediaAsset(path string) (MediaAssetRecord, bool, error) {
	item, err := scanMediaAsset(b.db.QueryRow(`SELECT `+mediaAssetColumns+` FROM media_assets WHERE path = `+b.placeholder(1), strings.TrimSpace(path)))
	if err == sql.ErrNoRows {
		return MediaAssetRecord{}, false, nil
	}
	if err != nil {
		return MediaAssetRecord{}, false, fmt.Errorf("load media asset: %w", err)
	}
	return item, true, nil
}

func (b *DatabaseBackend) ListMediaAssets(q MediaAssetListQuery) (MediaAssetListPage, error) {
	where, args, _ := b.mediaAssetFilters(q, false)
	countQuery := `SELECT COUNT(*) FROM media_assets WHERE ` + strings.Join(where, ` AND `)
	var total int
	if err := b.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return MediaAssetListPage{}, fmt.Errorf("count media assets: %w", err)
	}
	where, args, sortExpr := b.mediaAssetFilters(q, true)
	limit := q.Limit
	if limit < 1 {
		limit = 100
	}
	args = append(args, limit+1)
	query := `SELECT ` + mediaAssetColumns + ` FROM media_assets WHERE ` + strings.Join(where, ` AND `) + ` ORDER BY ` + sortExpr + ` DESC, path ASC LIMIT ` + b.placeholder(len(args))
	rows, err := b.db.Query(query, args...)
	if err != nil {
		return MediaAssetListPage{}, fmt.Errorf("list media assets: %w", err)
	}
	defer rows.Close()
	items := make([]MediaAssetRecord, 0, limit+1)
	for rows.Next() {
		item, scanErr := scanMediaAsset(rows)
		if scanErr != nil {
			return MediaAssetListPage{}, fmt.Errorf("scan media asset: %w", scanErr)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return MediaAssetListPage{}, fmt.Errorf("iterate media assets: %w", err)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	return MediaAssetListPage{Items: items, Total: total, HasMore: hasMore}, nil
}

func (b *DatabaseBackend) mediaAssetFilters(q MediaAssetListQuery, includeCursor bool) ([]string, []any, string) {
	where := []string{`media_type = 'image'`, `status IN ('ready', 'pending')`, `deleted_at = ''`}
	args := []any{}
	add := func(expr string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(expr, b.placeholder(len(args))))
	}
	if q.Public {
		where = append(where, `visibility = 'public'`)
	} else if !q.All {
		add(`owner_id = %s`, strings.TrimSpace(q.OwnerID))
	}
	if q.StartDate != "" {
		add(`created_at >= %s`, mediaDateStart(q.StartDate))
	}
	if q.EndDate != "" {
		add(`created_at < %s`, mediaDateEndExclusive(q.EndDate))
	}
	if q.UpdatedAfter != "" {
		add(`updated_at > %s`, strings.TrimSpace(q.UpdatedAfter))
	}
	sortExpr := `created_at`
	if q.Public {
		sortExpr = `(CASE WHEN published_at = '' THEN created_at ELSE published_at END)`
	}
	if includeCursor && q.BeforeSortKey != "" && q.BeforePath != "" {
		args = append(args, q.BeforeSortKey, q.BeforeSortKey, q.BeforePath)
		first := b.placeholder(len(args) - 2)
		second := b.placeholder(len(args) - 1)
		third := b.placeholder(len(args))
		where = append(where, `(`+sortExpr+` < `+first+` OR (`+sortExpr+` = `+second+` AND path > `+third+`))`)
	}
	return where, args, sortExpr
}

func (b *DatabaseBackend) DeleteMediaAsset(path string) error {
	if _, err := b.db.Exec(`DELETE FROM media_assets WHERE path = `+b.placeholder(1), strings.TrimSpace(path)); err != nil {
		return fmt.Errorf("delete media asset: %w", err)
	}
	return nil
}
