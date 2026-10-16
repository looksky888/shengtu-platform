package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// CreateDatabaseSnapshot writes a consistent SQLite snapshot using VACUUM INTO.
// Remote databases need provider-native dump tooling and are rejected instead of
// producing an archive that silently omits relational data.
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
	if _, err := b.db.ExecContext(ctx, "VACUUM INTO ?", target); err != nil {
		return fmt.Errorf("创建 SQLite 一致性快照: %w", err)
	}
	return nil
}

func (b *DatabaseBackend) DatabaseSnapshotSourceFiles() []string {
	if b == nil || b.driver != "sqlite" || b.dsn == "" {
		return nil
	}
	return []string{b.dsn, b.dsn + "-wal", b.dsn + "-shm"}
}
