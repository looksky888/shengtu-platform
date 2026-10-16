package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLookupMailboxesAllowsAuthenticatedInternalRequest(t *testing.T) {
	internalToken := strings.Repeat("i", 32)
	t.Setenv("INTERNAL_SERVICE_TOKEN", internalToken)
	server := &Server{
		cfg: Config{PublicBaseURL: "http://icloud-privacy-mail:8787"},
		store: &FileStore{state: State{Mailboxes: []Mailbox{
			{ID: "mbx-1", Email: "matched@icloud.com", APIToken: "mail-token", APIActive: true, ICloudActive: true},
		}}},
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/mailboxes/lookup", strings.NewReader(`{
		"emails":[" MATCHED@icloud.com ","missing@icloud.com","matched@icloud.com"]
	}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
	request.Header.Set("X-Internal-Token", internalToken)
	recorder := httptest.NewRecorder()

	server.handleLookupMailboxes(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Success   bool            `json:"success"`
		Mailboxes []publicMailbox `json:"mailboxes"`
		Missing   []string        `json:"missing"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.Success || len(response.Mailboxes) != 1 || response.Mailboxes[0].Email != "matched@icloud.com" {
		t.Fatalf("mailboxes = %#v", response.Mailboxes)
	}
	if got := response.Mailboxes[0].APIURL; got != "/api/icloud/public/v1/mailboxes/matched@icloud.com/code?key=mail-token" {
		t.Fatalf("api_url = %q", got)
	}
	if len(response.Missing) != 1 || response.Missing[0] != "missing@icloud.com" {
		t.Fatalf("missing = %#v", response.Missing)
	}
}

func TestLookupMailboxesRejectsInvalidInternalToken(t *testing.T) {
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("i", 32))
	server := &Server{store: &FileStore{}}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/mailboxes/lookup", strings.NewReader(`{"emails":["a@icloud.com"]}`))
	request.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
	request.Header.Set("X-Internal-Token", strings.Repeat("x", 32))
	recorder := httptest.NewRecorder()

	server.handleLookupMailboxes(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("response = %d %s, want 401", recorder.Code, recorder.Body.String())
	}
}
