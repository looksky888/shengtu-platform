package app

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMailboxAPIURLUsesMainAppPublicProxyForInternalRequest(t *testing.T) {
	internalToken := strings.Repeat("i", 32)
	t.Setenv("INTERNAL_SERVICE_TOKEN", internalToken)
	request := httptest.NewRequest("GET", "/api/mailboxes", nil)
	request.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
	request.Header.Set("X-Internal-Token", internalToken)
	server := &Server{cfg: Config{PublicBaseURL: "http://icloud-privacy-mail:8787"}}
	got := server.mailboxAPIURL(request, Mailbox{Email: "alias@icloud.com", APIToken: "secret token"})
	want := "/api/icloud/public/v1/mailboxes/alias@icloud.com/code?key=secret+token"
	if got != want {
		t.Fatalf("api url = %q, want %q", got, want)
	}
	if strings.Contains(got, "icloud-privacy-mail") {
		t.Fatalf("api url leaked internal host: %q", got)
	}
}
