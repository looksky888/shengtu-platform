package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func fetchProxyModels(ctx context.Context, client *http.Client, baseURL, apiKey string, timeoutSeconds int) ([]string, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(clampPositive(timeoutSeconds, 300))*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(timeoutCtx, http.MethodGet, proxyAPIURL(baseURL, "/models"), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("拉取模型失败，请检查中转站地址和网络：%w", err)
	}
	defer resp.Body.Close()
	payload, readErr := readProxyJSONResponse(resp)
	if readErr != nil {
		return nil, fmt.Errorf("拉取模型失败：%w", readErr)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := firstNonEmpty(util.Clean(payload["message"]), util.Clean(payload["msg"]), fmt.Sprintf("拉取模型失败：HTTP %d", resp.StatusCode))
		if errObj := util.StringMap(payload["error"]); len(errObj) > 0 {
			message = firstNonEmpty(util.Clean(errObj["message"]), message)
		}
		return nil, errors.New(message)
	}
	return uniqueModelIDs(util.AsMapSlice(payload["data"])), nil
}

func uniqueModelIDs(items []map[string]any) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, item := range items {
		id := util.Clean(item["id"])
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func proxyAPIURL(baseURL, apiPath string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if !strings.HasSuffix(strings.ToLower(base), "/v1") {
		base += "/v1"
	}
	return base + apiPath
}
