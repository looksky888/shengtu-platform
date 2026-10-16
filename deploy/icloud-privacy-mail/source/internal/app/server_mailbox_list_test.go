package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleListMailboxesSummaryUsesFullScope(t *testing.T) {
	mailboxes := make([]Mailbox, 25)
	for index := range mailboxes {
		mailboxes[index] = Mailbox{
			ID:            fmt.Sprintf("mailbox-%02d", index),
			Email:         fmt.Sprintf("alias-%02d@icloud.com", index),
			OpenAIClaimed: index < 7,
		}
	}
	server := &Server{store: &FileStore{state: State{Mailboxes: mailboxes}}}
	request := httptest.NewRequest(http.MethodGet, "/api/mailboxes?page=1&page_size=20", nil)
	recorder := httptest.NewRecorder()

	server.handleListMailboxes(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Mailboxes []publicMailbox `json:"mailboxes"`
		Summary   struct {
			Total         int `json:"total"`
			OpenAIClaimed int `json:"openai_claimed"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Mailboxes) != 20 {
		t.Fatalf("page rows = %d, want 20", len(response.Mailboxes))
	}
	if response.Summary.Total != 25 || response.Summary.OpenAIClaimed != 7 {
		t.Fatalf("summary = %+v, want total 25 and openai_claimed 7", response.Summary)
	}
}

func TestSortMailboxesForListNewestCreatedFirst(t *testing.T) {
	base := time.Date(2026, time.August, 10, 10, 0, 0, 0, time.UTC)
	mailboxes := []Mailbox{
		{ID: "old", Email: "a@icloud.com", CreatedAt: base},
		{ID: "new", Email: "z@icloud.com", CreatedAt: base.Add(time.Hour)},
		{ID: "legacy", Email: "legacy@icloud.com"},
	}

	sortMailboxesForList(mailboxes, nil)

	if got := []string{mailboxes[0].ID, mailboxes[1].ID, mailboxes[2].ID}; got[0] != "new" || got[1] != "old" || got[2] != "legacy" {
		t.Fatalf("mailbox order = %v, want [new old legacy]", got)
	}
}

func TestHandleListMailboxesReturnsNewestCreatedFirst(t *testing.T) {
	base := time.Date(2026, time.August, 10, 10, 0, 0, 0, time.UTC)
	server := &Server{store: &FileStore{state: State{Mailboxes: []Mailbox{
		{ID: "old", Email: "old@icloud.com", CreatedAt: base},
		{ID: "new", Email: "new@icloud.com", CreatedAt: base.Add(time.Hour)},
	}}}}
	request := httptest.NewRequest(http.MethodGet, "/api/mailboxes?page=1&page_size=20", nil)
	recorder := httptest.NewRecorder()

	server.handleListMailboxes(recorder, request)

	var response struct {
		Mailboxes []publicMailbox `json:"mailboxes"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Mailboxes) != 2 || response.Mailboxes[0].ID != "new" || response.Mailboxes[1].ID != "old" {
		t.Fatalf("response mailbox order = %#v, want [new old]", response.Mailboxes)
	}
}

func TestHandleListMailboxesFiltersUsageBeforePagination(t *testing.T) {
	mailboxes := make([]Mailbox, 45)
	for index := range mailboxes {
		mailboxes[index] = Mailbox{
			ID:            fmt.Sprintf("mailbox-%02d", index),
			Email:         fmt.Sprintf("alias-%02d@icloud.com", index),
			OpenAIClaimed: index < 12,
			GrokClaimed:   index >= 12 && index < 25,
		}
	}
	server := &Server{store: &FileStore{state: State{Mailboxes: mailboxes}}}
	request := httptest.NewRequest(http.MethodGet, "/api/mailboxes?usage=used&page=2&page_size=20", nil)
	recorder := httptest.NewRecorder()

	server.handleListMailboxes(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Mailboxes  []publicMailbox  `json:"mailboxes"`
		Pagination publicPagination `json:"pagination"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Mailboxes) != 5 {
		t.Fatalf("page rows = %d, want 5", len(response.Mailboxes))
	}
	if response.Pagination.Total != 25 || response.Pagination.TotalPages != 2 {
		t.Fatalf("pagination = %+v, want filtered total 25 and 2 pages", response.Pagination)
	}
	for _, mailbox := range response.Mailboxes {
		if !mailbox.OpenAIClaimed && !mailbox.GrokClaimed {
			t.Fatalf("unused mailbox leaked into used filter: %+v", mailbox)
		}
	}
}

func TestHandleListMailboxesUnusedExcludesClaimedButKeepsInFlight(t *testing.T) {
	server := &Server{store: &FileStore{state: State{Mailboxes: []Mailbox{
		{ID: "openai", Email: "openai@icloud.com", OpenAIClaimed: true},
		{ID: "grok", Email: "grok@icloud.com", GrokClaimed: true},
		{ID: "in-flight", Email: "in-flight@icloud.com", Status: StatusUsed},
		{ID: "free", Email: "free@icloud.com", Status: StatusAvailable},
	}}}}
	request := httptest.NewRequest(http.MethodGet, "/api/mailboxes?usage=unused", nil)
	recorder := httptest.NewRecorder()

	server.handleListMailboxes(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Mailboxes  []publicMailbox  `json:"mailboxes"`
		Pagination publicPagination `json:"pagination"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Mailboxes) != 2 || response.Pagination.Total != 2 {
		t.Fatalf("mailboxes = %#v, pagination = %+v, want in-flight and free", response.Mailboxes, response.Pagination)
	}
	for _, mailbox := range response.Mailboxes {
		if mailbox.OpenAIClaimed || mailbox.GrokClaimed {
			t.Fatalf("claimed mailbox leaked into unused filter: %+v", mailbox)
		}
	}
}

func TestHandleListMailboxesUsageIncludesRegisteredManualTags(t *testing.T) {
	server := &Server{store: &FileStore{state: State{Mailboxes: []Mailbox{
		{ID: "gpt-tag", Email: "gpt@icloud.com", Tag: "GPT 已注册"},
		{ID: "grok-tag", Email: "grok@icloud.com", Tag: "grok已注册"},
		{ID: "custom-tag", Email: "custom@icloud.com", Tag: "客户 A"},
		{ID: "spare-tag", Email: "spare@icloud.com", Tag: "备用"},
	}}}}

	usedRequest := httptest.NewRequest(http.MethodGet, "/api/mailboxes?usage=used", nil)
	usedRecorder := httptest.NewRecorder()
	server.handleListMailboxes(usedRecorder, usedRequest)
	var usedResponse struct {
		Mailboxes []publicMailbox `json:"mailboxes"`
	}
	if err := json.Unmarshal(usedRecorder.Body.Bytes(), &usedResponse); err != nil {
		t.Fatal(err)
	}
	if len(usedResponse.Mailboxes) != 2 {
		t.Fatalf("used mailboxes = %#v, want GPT/Grok registered tags", usedResponse.Mailboxes)
	}

	unusedRequest := httptest.NewRequest(http.MethodGet, "/api/mailboxes?usage=unused", nil)
	unusedRecorder := httptest.NewRecorder()
	server.handleListMailboxes(unusedRecorder, unusedRequest)
	var unusedResponse struct {
		Mailboxes []publicMailbox `json:"mailboxes"`
	}
	if err := json.Unmarshal(unusedRecorder.Body.Bytes(), &unusedResponse); err != nil {
		t.Fatal(err)
	}
	if len(unusedResponse.Mailboxes) != 2 {
		t.Fatalf("unused mailboxes = %#v, want ordinary manual tags", unusedResponse.Mailboxes)
	}
}

func TestHandleListMailboxesRejectsUnknownUsageFilter(t *testing.T) {
	server := &Server{store: &FileStore{state: State{}}}
	request := httptest.NewRequest(http.MethodGet, "/api/mailboxes?usage=unknown", nil)
	recorder := httptest.NewRecorder()

	server.handleListMailboxes(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s, want 400", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "invalid_usage_filter") {
		t.Fatalf("body = %s, want invalid_usage_filter", recorder.Body.String())
	}
}
