package service

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

type CPAConfig struct {
	mu         sync.Mutex
	path       string
	store      storage.JSONDocumentBackend
	pools      []CPAPool
	docName    string
	storeReady bool
}

func NewCPAConfig(dataDir string, backend ...storage.Backend) *CPAConfig {
	config := &CPAConfig{
		path:    filepath.Join(dataDir, "cpa_config.json"),
		store:   firstJSONDocumentStore(backend),
		docName: "cpa_config.json",
	}
	config.pools, config.storeReady = config.load()
	return config
}

func (c *CPAConfig) ListPools() []map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]map[string]any, 0, len(c.pools))
	for _, pool := range c.pools {
		out = append(out, pool.toMap())
	}
	return out
}

// GetPool is a map bridge for residual callers. Prefer GetPoolRecord.
func (c *CPAConfig) GetPool(id string) map[string]any {
	pool, ok := c.GetPoolRecord(id)
	if !ok {
		return nil
	}
	return pool.toMap()
}

// GetPoolRecord returns the stored pool (includes secret_key for import workers).
func (c *CPAConfig) GetPoolRecord(id string) (CPAPool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, pool := range c.pools {
		if pool.ID == id {
			return pool, true
		}
	}
	return CPAPool{}, false
}

// AddPool creates a pool and returns the public view (secret never included).
func (c *CPAConfig) AddPool(name, baseURL, secretKey string) (CPAPoolPublic, error) {
	pool := cpaPoolFromMap(map[string]any{
		"id":         util.NewHex(12),
		"name":       name,
		"base_url":   baseURL,
		"secret_key": secretKey,
	})
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pools = append(c.pools, pool)
	if err := c.saveLocked(); err != nil {
		c.pools = c.pools[:len(c.pools)-1]
		return CPAPoolPublic{}, fmt.Errorf("保存 CPA 连接池失败: %w", err)
	}
	return CPAPoolPublicFromRecord(pool), nil
}

// UpdatePool applies a typed partial update and returns the public view.
func (c *CPAConfig) UpdatePool(id string, updates CPAPoolUpdate) (CPAPoolPublic, error) {
	if !updates.HasFields() {
		pool, ok := c.GetPoolRecord(id)
		if !ok {
			return CPAPoolPublic{}, nil
		}
		return CPAPoolPublicFromRecord(pool), nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for index, pool := range c.pools {
		if pool.ID != id {
			continue
		}
		next := pool
		if updates.Name != nil {
			next.Name = util.Clean(*updates.Name)
		}
		if updates.BaseURL != nil {
			next.BaseURL = util.Clean(*updates.BaseURL)
		}
		if updates.SecretKey != nil {
			// Empty write-only secret must not wipe stored secret_key.
			if secret := strings.TrimSpace(util.Clean(*updates.SecretKey)); secret != "" {
				next.SecretKey = secret
			}
		}
		previous := pool
		c.pools[index] = next
		if err := c.saveLocked(); err != nil {
			c.pools[index] = previous
			return CPAPoolPublic{}, fmt.Errorf("保存 CPA 连接池失败: %w", err)
		}
		return CPAPoolPublicFromRecord(next), nil
	}
	return CPAPoolPublic{}, nil
}

// GetImportJobTyped returns the public import job for a pool (nil if absent).
func (c *CPAConfig) GetImportJobTyped(id string) *CPAImportJobPublic {
	pool, ok := c.GetPoolRecord(id)
	if !ok {
		return nil
	}
	return CPAImportJobPublicFromRecord(pool.ImportJob)
}

func (c *CPAConfig) DeletePool(id string) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	previous := append([]CPAPool(nil), c.pools...)
	next := make([]CPAPool, 0, len(c.pools))
	removed := false
	for _, pool := range c.pools {
		if pool.ID == id {
			removed = true
			continue
		}
		next = append(next, pool)
	}
	if removed {
		c.pools = next
		if err := c.saveLocked(); err != nil {
			c.pools = previous
			return false, fmt.Errorf("保存 CPA 连接池删除失败: %w", err)
		}
	}
	return removed, nil
}

func (c *CPAConfig) SetImportJob(id string, job map[string]any) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for index, pool := range c.pools {
		if pool.ID != id {
			continue
		}
		previous := pool
		pool.ImportJob = cpaImportJobFromMap(job, false)
		c.pools[index] = pool
		if err := c.saveLocked(); err != nil {
			c.pools[index] = previous
			return nil, fmt.Errorf("保存 CPA 导入任务失败: %w", err)
		}
		return pool.toMap(), nil
	}
	return nil, nil
}

func (c *CPAConfig) GetImportJob(id string) map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, pool := range c.pools {
		if pool.ID == id {
			return pool.ImportJob.toMap()
		}
	}
	return nil
}

func (c *CPAConfig) load() ([]CPAPool, bool) {
	raw, err := loadStoredJSONWithError(c.store, c.docName, c.path)
	if err != nil {
		return []CPAPool{}, false
	}
	// Legacy single-object document: { base_url, secret_key, ... }
	if object, ok := raw.(map[string]any); ok && object["base_url"] != nil {
		pool := cpaPoolFromMap(object)
		if pool.BaseURL != "" {
			return []CPAPool{pool}, true
		}
		return nil, true
	}
	// Prefer direct JSON decode into typed records.
	if data, err := json.Marshal(raw); err == nil {
		var typed []CPAPool
		if err := json.Unmarshal(data, &typed); err == nil && typed != nil {
			out := make([]CPAPool, 0, len(typed))
			for _, item := range typed {
				normalized := cpaPoolFromMap(item.toMap())
				if normalized.ImportJob != nil {
					normalized.ImportJob = cpaImportJobFromMap(normalized.ImportJob.toMap(), true)
				}
				out = append(out, normalized)
			}
			return out, true
		}
	}
	var pools []CPAPool
	for _, item := range anyList(raw) {
		if pool, ok := item.(map[string]any); ok {
			pools = append(pools, cpaPoolFromMap(pool))
		}
	}
	return pools, true
}

func (c *CPAConfig) saveLocked() error {
	if !c.storeReady {
		return fmt.Errorf("CPA 配置未成功加载，已拒绝写入以防清空存储")
	}
	return saveStoredJSON(c.store, c.docName, c.path, c.pools)
}
