package service

import (
	"net/http"
	"strings"
	"testing"
)

func TestRegisterICloudMailProviderInternalAuthHeaders(t *testing.T) {
	internalToken := strings.Repeat("i", 32)
	provider := &registerICloudMailProvider{internal: true, internalToken: internalToken}
	request, err := http.NewRequest(http.MethodGet, "http://icloud-privacy-mail.test/api/status", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	provider.applyAuth(request)

	if got := request.Header.Get("X-ChatGPT2API-Internal"); got != "icloud-privacy-mail" {
		t.Fatalf("internal marker = %q", got)
	}
	if got := request.Header.Get("X-Internal-Token"); got != internalToken {
		t.Fatalf("internal token = %q", got)
	}
}
