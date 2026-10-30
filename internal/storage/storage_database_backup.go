package storage

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
)

var sqliteSnapshotPragmas = []string{
	"busy_timeout(15000)",
	"temp_store(MEMORY)",
}

// CreateDatabaseSnapshot writes a consistent SQLite snapshot using VACUUM INTO.
// File-backed SQLite snapshots run on a dedicated short-lived connection so the
// single-connection writer pool (b.db) is never stalled while copying pages.
func (b *DatabaseBackend) CreateDatabaseSnapshot(ctx context.Context, target string) error {
	if b == nil || b.db == nil {
		return fmt.Errorf("数据库未初始化")
	}
	if b.driver != "sqlite" {
		return fmt.Errorf("%s 数据库暂不支持内置完整备份，请使用数据库原生备份工具", b.driver)
	}
	if target == "" {
		return fmt.Errorf("SQLite 快照目标路径为空")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("创建 SQLite 快照目录: %w", err)
	}
	if _, err := os.Stat(target); err == nil {
		return fmt.Errorf("SQLite 快照目标已存在")
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("检查 SQLite 快照目标: %w", err)
	}

	execDB := b.db
	if !isSQLiteMemoryDSN(b.dsn) {
		snapDB, err := sql.Open("sqlite", appendSQLitePragmas(b.dsn, sqliteSnapshotPragmas))
		if err == nil {
			defer snapDB.Close()
			snapDB.SetMaxOpenConns(1)
			execDB = snapDB
		}
	}
	if _, err := execDB.ExecContext(ctx, "VACUUM INTO ?", target); err != nil {
		return fmt.Errorf("创建 SQLite 一致性快照: %w", err)
	}
	return nil
}

// IncrementalVacuum reclaims up to maxPages free pages when SQLite auto_vacuum
// is configured in INCREMENTAL mode. If maxPages <= 0, all free pages are reclaimed.
func (b *DatabaseBackend) IncrementalVacuum(ctx context.Context, maxPages int) error {
	if b == nil || b.db == nil || b.driver != "sqlite" {
		return nil
	}
	if maxPages > 0 {
		_, err := b.db.ExecContext(ctx, fmt.Sprintf("PRAGMA incremental_vacuum(%d)", maxPages))
		return err
	}
	_, err := b.db.ExecContext(ctx, "PRAGMA incremental_vacuum")
	return err
}

func (b *DatabaseBackend) DatabaseSnapshotSourceFiles() []string {
	if b == nil || b.driver != "sqlite" || b.dsn == "" {
		return nil
	}
	return []string{b.dsn, b.dsn + "-wal", b.dsn + "-shm"}
}
