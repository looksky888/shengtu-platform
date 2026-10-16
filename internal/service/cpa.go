package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/util"
)

type CPAImportService struct {
	config   *CPAConfig
	accounts *AccountService
	proxy    *ProxyService
}

func NewCPAImportService(config *CPAConfig, accounts *AccountService, proxy *ProxyService) *CPAImportService {
	return &CPAImportService{config: config, accounts: accounts, proxy: proxy}
}

func (s *CPAImportService) ListRemoteFiles(ctx context.Context, pool map[string]any) ([]map[string]any, error) {
	baseURL := util.Clean(pool["base_url"])
	secret := util.Clean(pool["secret_key"])
	if baseURL == "" || secret == "" {
		return []map[string]any{}, nil
	}
	req, err := newCPARequest(ctx, baseURL, secret, "/v0/management/auth-files")
	if err != nil {
		return nil, err
	}
	resp, err := s.proxy.HTTPClient(30 * time.Second).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("远程文件列表失败：HTTP %d", resp.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	var items []map[string]any
	for _, raw := range anyList(payload["files"]) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name := util.Clean(item["name"])
		if name == "" {
			continue
		}
		items = append(items, map[string]any{"name": name, "email": firstNonEmpty(util.Clean(item["email"]), util.Clean(item["account"]))})
	}
	return items, nil
}

func (s *CPAImportService) StartImport(pool map[string]any, selected []string) (map[string]any, error) {
	var names []string
	for _, name := range selected {
		if value := strings.TrimSpace(name); value != "" {
			names = append(names, value)
		}
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("请选择要导入的文件")
	}
	poolID := util.Clean(pool["id"])
	job := newImportJobStruct(len(names)).toMap()
	saved, err := s.config.SetImportJob(poolID, job)
	if err != nil {
		return nil, err
	}
	if saved == nil {
		return nil, fmt.Errorf("连接池不存在")
	}
	go s.runImport(poolID, pool, names)
	if jobMap, ok := saved["import_job"].(map[string]any); ok {
		return util.CopyMap(jobMap), nil
	}
	return job, nil
}

func (s *CPAImportService) runImport(poolID string, pool map[string]any, names []string) {
	if err := s.updateJob(poolID, map[string]any{"status": "running"}); err != nil {
		return
	}
	type result struct{ token, name, err string }
	results := make(chan result, len(names))
	workers := minInt(16, maxInt(1, len(names)))
	jobs := make(chan string)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for name := range jobs {
				token, err := s.fetchRemoteAccessToken(context.Background(), pool, name)
				if err != nil {
					results <- result{name: name, err: err.Error()}
				} else {
					results <- result{name: name, token: token}
				}
			}
		}()
	}
	go func() {
		for _, name := range names {
			jobs <- name
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()
	var tokens []string
	tokenNames := make(map[string]string, len(names))
	for res := range results {
		if res.token != "" {
			tokens = append(tokens, res.token)
			tokenNames[res.token] = res.name
		} else {
			if err := s.appendJobError(poolID, res.name, res.err); err != nil {
				return
			}
		}
		current := s.config.GetImportJob(poolID)
		if err := s.updateJob(poolID, map[string]any{"completed": util.ToInt(current["completed"], 0) + 1, "failed": len(anyList(current["errors"]))}); err != nil {
			return
		}
	}
	if len(tokens) == 0 {
		current := s.config.GetImportJob(poolID)
		if err := s.updateJob(poolID, map[string]any{"status": "failed", "completed": util.ToInt(current["total"], 0), "failed": len(anyList(current["errors"]))}); err != nil {
			log.Printf("persist CPA failed job %s: %v", poolID, err)
		}
		return
	}
	add := s.accounts.AddAccounts(tokens)
	if message := util.Clean(add["error"]); message != "" {
		current := s.config.GetImportJob(poolID)
		errors := anyList(current["errors"])
		errors = append(errors, map[string]any{"name": "账号池", "error": "保存导入账号失败: " + message})
		if err := s.updateJob(poolID, map[string]any{
			"status": "failed", "completed": len(names), "added": 0,
			"skipped": util.ToInt(add["skipped"], 0), "failed": len(errors), "errors": errors,
		}); err != nil {
			log.Printf("persist CPA account save failure job %s: %v", poolID, err)
		}
		return
	}
	refresh := s.accounts.RefreshAccounts(context.Background(), tokens)
	current := s.config.GetImportJob(poolID)
	errors := anyList(current["errors"])
	if refreshErrors, ok := refresh["errors"].([]map[string]string); ok {
		for _, refreshError := range refreshErrors {
			name := tokenNames[refreshError["access_token"]]
			if name == "" {
				name = "账号刷新"
			}
			errors = append(errors, map[string]any{"name": name, "error": refreshError["error"]})
		}
	}
	if err := s.updateJob(poolID, map[string]any{
		"status": "completed", "completed": len(names),
		"added": util.ToInt(add["added"], 0), "skipped": util.ToInt(add["skipped"], 0),
		"refreshed": util.ToInt(refresh["refreshed"], 0), "failed": len(errors), "errors": errors,
	}); err != nil {
		log.Printf("persist CPA completed job %s: %v", poolID, err)
	}
}

func (s *CPAImportService) fetchRemoteAccessToken(ctx context.Context, pool map[string]any, name string) (string, error) {
	baseURL := util.Clean(pool["base_url"])
	secret := util.Clean(pool["secret_key"])
	if baseURL == "" || secret == "" || strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("请求无效")
	}
	req, err := newCPARequest(ctx, baseURL, secret, "/v0/management/auth-files/download?name="+url.QueryEscape(name))
	if err != nil {
		return "", err
	}
	resp, err := s.proxy.HTTPClient(30 * time.Second).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	token := util.Clean(payload["access_token"])
	if token == "" {
		return "", fmt.Errorf("文件中缺少 access_token")
	}
	return token, nil
}

func (s *CPAImportService) updateJob(poolID string, updates map[string]any) error {
	current := s.config.GetImportJob(poolID)
	if current == nil {
		return fmt.Errorf("连接池不存在")
	}
	for key, value := range updates {
		current[key] = value
	}
	current["updated_at"] = util.NowISO()
	_, err := s.config.SetImportJob(poolID, current)
	return err
}

func (s *CPAImportService) appendJobError(poolID, name, message string) error {
	current := s.config.GetImportJob(poolID)
	if current == nil {
		return fmt.Errorf("连接池不存在")
	}
	errors := anyList(current["errors"])
	errors = append(errors, map[string]any{"name": name, "error": message})
	return s.updateJob(poolID, map[string]any{"errors": errors, "failed": len(errors)})
}

func newCPARequest(ctx context.Context, baseURL, secret, path string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, fmt.Errorf("CPA base_url 无效：%w", err)
	}
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set("Accept", "application/json")
	return req, nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
