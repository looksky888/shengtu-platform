package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestValidateImageSizeForProvider(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		size     string
		wantErr  bool
	}{
		{name: "account pool paid widescreen", provider: imageProviderAccountPool, size: "1824x1024", wantErr: true},
		{name: "account pool paid portrait", provider: imageProviderAccountPool, size: "1024×1824", wantErr: true},
		{name: "account pool standard landscape", provider: imageProviderAccountPool, size: "1536x1024"},
		{name: "account pool square", provider: imageProviderAccountPool, size: "1024x1024"},
		{name: "relay keeps upstream capability", provider: imageProviderProxyAPI, size: "1824x1024"},
		{name: "grok keeps upstream capability", provider: imageProviderGrokNative, size: "2048x2048"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateImageSizeForProvider(test.provider, test.size)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateImageSizeForProvider(%q, %q) error = %v, wantErr %v", test.provider, test.size, err, test.wantErr)
			}
		})
	}
}

func TestCreationTaskRejectsAccountPoolPaidSize(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "paid-size-test", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(
		`{"client_task_id":"paid-size-block","prompt":"测试","model":"gpt-image-2","size":"1824x1024","n":1}`,
	))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), accountPoolPaidImageSizeDisabledMessage) {
		t.Fatalf("response body does not explain the disabled size: %s", res.Body.String())
	}
}
