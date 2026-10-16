package httpapi

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadJSONMapRejectsTrailingJSONValue(t *testing.T) {
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(`{"username":"demo"} {"extra":true}`))
	if _, err := readJSONMap(req); err == nil {
		t.Fatal("readJSONMap accepted multiple JSON values")
	}
}

func TestReadJSONMapRejectsOversizedOrdinaryRequest(t *testing.T) {
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader("{}"))
	req.ContentLength = maxJSONBodyBytes + 1
	if _, err := readJSONMap(req); !errors.Is(err, errRequestBodyTooLarge) {
		t.Fatalf("err = %v, want errRequestBodyTooLarge", err)
	}
}

func TestJSONBodyLimitKeepsImagePayloadRoutesUsable(t *testing.T) {
	paths := []string{
		"/v1/chat/completions",
		"/v1/responses",
		"/v1/messages",
		"/api/creation-tasks/response-image-generations",
	}
	for _, path := range paths {
		req := httptest.NewRequest("POST", path, nil)
		if got := jsonBodyLimit(req); got != maxImageJSONBodyBytes {
			t.Errorf("jsonBodyLimit(%q) = %d, want %d", path, got, maxImageJSONBodyBytes)
		}
	}
}

func TestReadJSONMapRawRejectsOversizedRequest(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/register", strings.NewReader("{}"))
	req.ContentLength = maxJSONBodyBytes + 1
	recorder := httptest.NewRecorder()
	if _, _, ok := readJSONMapRawOr400(recorder, req); ok {
		t.Fatal("readJSONMapRawOr400 accepted oversized request")
	}
	if recorder.Code != 400 {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
}
