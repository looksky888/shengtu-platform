package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestImageChannelAdminCRUDAndCatalogContract(t *testing.T) {
	app := newTestApp(t)
	admin := adminAuthHeader(t, app)

	request := func(method, path, body string) (int, map[string]any) {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", admin)
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		payload := map[string]any{}
		if res.Body.Len() > 0 {
			if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode %s %s: %v body=%s", method, path, err, res.Body.String())
			}
		}
		return res.Code, payload
	}

	status, channel := request(http.MethodPost, imageChannelsAdminPath, `{
		"name":"Relay","alias":"渠道 2","type":"openai_compatible",
		"base_url":"https://relay.example.test/v1","api_key":"secret-key",
		"enabled":true,"sort":30,"max_concurrency":2,"timeout_seconds":120,
		"max_retries":1,"download_urls":true
	}`)
	if status != http.StatusCreated || channel["id"] == "" || channel["api_key_configured"] != true {
		t.Fatalf("create channel status=%d payload=%#v", status, channel)
	}
	if _, leaked := channel["api_key"]; leaked {
		t.Fatalf("channel response leaked api_key: %#v", channel)
	}
	channelID := channel["id"].(string)
	status, model := request(http.MethodPost, imageChannelsAdminPath+"/"+channelID+"/models", `{
		"display_name":"Relay Image","upstream_model":"relay-image-2k",
		"capabilities":["generate","edit"],"resolutions":["1k","2k"],
		"formats":["png"],"credit_cost":4,"credit_costs":{"1k":4,"2k":9},
		"enabled":true,"sort":10
	}`)
	if status != http.StatusCreated || model["credit_cost"] != float64(4) {
		t.Fatalf("create model status=%d payload=%#v", status, model)
	}
	status, catalog := request(http.MethodGet, "/api/model-catalog", "")
	models, _ := catalog["image_channel_models"].([]any)
	if status != http.StatusOK || len(models) < 6 {
		t.Fatalf("catalog status=%d channel_models=%#v", status, catalog["image_channel_models"])
	}
}
