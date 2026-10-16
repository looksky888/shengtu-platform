package storage

import (
	"context"
	"time"
)

func (b *DatabaseBackend) HealthCheck() BackendHealth {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := b.db.PingContext(ctx); err != nil {
		return BackendHealth{Status: "unhealthy", Backend: "database", Error: err.Error()}
	}
	counts := make(map[string]int, 4)
	for _, table := range []string{"accounts", "auth_keys", "json_documents", "logs"} {
		count, err := b.count(ctx, table)
		if err != nil {
			return BackendHealth{Status: "unhealthy", Backend: "database", Error: err.Error()}
		}
		counts[table] = count
	}
	return BackendHealth{
		Status:        "healthy",
		Backend:       "database",
		DatabaseURL:   maskPassword(b.databaseURL),
		AccountCount:  ptrInt(counts["accounts"]),
		AuthKeyCount:  ptrInt(counts["auth_keys"]),
		DocumentCount: ptrInt(counts["json_documents"]),
		LogCount:      ptrInt(counts["logs"]),
	}
}

func (b *DatabaseBackend) Info() BackendInfo {
	dbType := "unknown"
	switch b.driver {
	case "sqlite":
		dbType = "sqlite"
	case "postgres":
		dbType = "postgresql"
	case "mysql":
		dbType = "mysql"
	}
	return BackendInfo{
		Type:        "database",
		DBType:      dbType,
		Description: "数据库存储 (" + dbType + ")",
		DatabaseURL: maskPassword(b.databaseURL),
	}
}
