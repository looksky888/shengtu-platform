package util

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteErrorUsesCanonicalEnvelope(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteError(recorder, http.StatusBadRequest, "请求无效")

	var payload APIErrorResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if recorder.Code != http.StatusBadRequest || payload.Detail.Error.Message != "请求无效" || payload.Detail.Error.Code != "" {
		t.Fatalf("unexpected response: status=%d payload=%+v", recorder.Code, payload)
	}
}

func TestWriteCodedErrorUsesSameCanonicalEnvelope(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteCodedError(recorder, http.StatusTooManyRequests, "queue_full", "队列已满")

	var payload APIErrorResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode coded error response: %v", err)
	}
	if recorder.Code != http.StatusTooManyRequests || payload.Detail.Error.Message != "队列已满" || payload.Detail.Error.Code != "queue_full" {
		t.Fatalf("unexpected response: status=%d payload=%+v", recorder.Code, payload)
	}
}
