package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestAdminRegistrationRiskSettingsAndBlocks(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	authorization := adminAuthHeader(t, app)

	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", authorization)
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		return res
	}

	res := request(http.MethodGet, registrationRiskSettingsPath, "")
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "device_success_limit") {
		t.Fatalf("get settings status=%d body=%s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"proxy_cidrs":[]`) {
		t.Fatalf("empty proxy CIDRs must be JSON array: %s", res.Body.String())
	}
	policy := service.DefaultRegistrationRiskPolicy()
	policy.ProxyCIDRs = []string{"203.0.113.0/24"}
	raw, _ := json.Marshal(policy)
	res = request(http.MethodPut, registrationRiskSettingsPath, string(raw))
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "203.0.113.0/24") {
		t.Fatalf("put settings status=%d body=%s", res.Code, res.Body.String())
	}

	for i := 0; i < policy.DeviceSuccessLimit; i++ {
		if err := app.regQuota.RecordSuccess(string(rune('a'+i)), "user@example.com", "198.51.100.1", "blocked-device"); err != nil {
			t.Fatal(err)
		}
	}
	_, _ = app.regQuota.Reserve(service.RegistrationRiskInput{
		ClientIP: "192.0.2.1", DeviceID: "blocked-device", Email: "next@example.com",
	})
	res = request(http.MethodGet, registrationRiskSettingsPath+"/blocks", "")
	if res.Code != http.StatusOK {
		t.Fatalf("get blocks status=%d body=%s", res.Code, res.Body.String())
	}
	var blocks struct {
		Items []service.RegistrationRiskBlock `json:"items"`
		Total int                             `json:"total"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &blocks); err != nil || blocks.Total != 1 || len(blocks.Items) != 1 {
		t.Fatalf("blocks=%+v error=%v", blocks, err)
	}
	res = request(http.MethodDelete, registrationRiskSettingsPath+"/blocks/"+blocks.Items[0].ID, "")
	if res.Code != http.StatusOK {
		t.Fatalf("delete block status=%d body=%s", res.Code, res.Body.String())
	}
	res = request(http.MethodGet, registrationRiskSettingsPath+"/blocks", "")
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"total":0`) || !strings.Contains(res.Body.String(), `"items":[]`) {
		t.Fatalf("blocks after delete status=%d body=%s", res.Code, res.Body.String())
	}
}

func TestAuthProvidersDoesNotExposeRiskLists(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	req := httptest.NewRequest(http.MethodGet, "/auth/providers", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"risk"`) {
		t.Fatalf("providers status=%d body=%s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "disposable_domains") || strings.Contains(res.Body.String(), "proxy_cidrs") {
		t.Fatalf("public providers leaked private risk lists: %s", res.Body.String())
	}
}
