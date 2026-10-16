package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
)

func TestUpdateDrainChangesReadinessAndCanResume(t *testing.T) {
	app := newTestApp(t)
	handler := app.Handler()

	ready := requestReadiness(t, handler)
	if ready.Code != http.StatusOK {
		t.Fatalf("initial /ready status = %d body = %s", ready.Code, ready.Body.String())
	}
	var initial applicationReadinessResponse
	if err := json.Unmarshal(ready.Body.Bytes(), &initial); err != nil {
		t.Fatalf("decode initial readiness: %v", err)
	}
	if initial.Status != "ready" || !initial.Tasks.Accepting || initial.SchemaVersion != storage.SchemaVersion {
		t.Fatalf("initial readiness = %#v", initial)
	}
	initialDrainReq := httptest.NewRequest(http.MethodGet, "/api/admin/system/update-drain", nil)
	initialDrainReq.Header.Set("Authorization", adminAuthHeader(t, app))
	initialDrainRes := httptest.NewRecorder()
	handler.ServeHTTP(initialDrainRes, initialDrainReq)
	if initialDrainRes.Code != http.StatusOK {
		t.Fatalf("initial update-drain status = %d body = %s", initialDrainRes.Code, initialDrainRes.Body.String())
	}
	var initialDrain systemTaskDrainResponse
	if err := json.Unmarshal(initialDrainRes.Body.Bytes(), &initialDrain); err != nil {
		t.Fatalf("decode initial update-drain status: %v", err)
	}
	if initialDrain.Drained {
		t.Fatalf("initial update-drain must not report complete before drain starts: %#v", initialDrain)
	}

	drainReq := httptest.NewRequest(http.MethodPost, "/api/admin/system/update-drain", nil)
	drainReq.Header.Set("Authorization", adminAuthHeader(t, app))
	drainRes := httptest.NewRecorder()
	handler.ServeHTTP(drainRes, drainReq)
	if drainRes.Code != http.StatusOK {
		t.Fatalf("update-drain status = %d body = %s", drainRes.Code, drainRes.Body.String())
	}
	drainStatusReq := httptest.NewRequest(http.MethodGet, "/api/admin/system/update-drain", nil)
	drainStatusReq.Header.Set("Authorization", adminAuthHeader(t, app))
	drainStatusRes := httptest.NewRecorder()
	handler.ServeHTTP(drainStatusRes, drainStatusReq)
	if drainStatusRes.Code != http.StatusOK {
		t.Fatalf("get update-drain status = %d body = %s", drainStatusRes.Code, drainStatusRes.Body.String())
	}
	var drainStatus systemTaskDrainResponse
	if err := json.Unmarshal(drainStatusRes.Body.Bytes(), &drainStatus); err != nil {
		t.Fatalf("decode update-drain status: %v", err)
	}
	if !drainStatus.Tasks.Draining || drainStatus.Tasks.Accepting || !drainStatus.Requests.Draining || drainStatus.Requests.Accepting {
		t.Fatalf("update-drain status = %#v", drainStatus)
	}
	if !drainStatus.Drained {
		t.Fatalf("empty queues should report drain complete after drain starts: %#v", drainStatus)
	}

	ready = requestReadiness(t, handler)
	if ready.Code != http.StatusServiceUnavailable {
		t.Fatalf("draining /ready status = %d body = %s", ready.Code, ready.Body.String())
	}
	var draining applicationReadinessResponse
	if err := json.Unmarshal(ready.Body.Bytes(), &draining); err != nil {
		t.Fatalf("decode draining readiness: %v", err)
	}
	if draining.Status != "not_ready" || !draining.Tasks.Draining || draining.Tasks.Accepting || !draining.Requests.Draining || draining.Requests.Accepting {
		t.Fatalf("draining readiness = %#v", draining)
	}
	protocolReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	protocolRes := httptest.NewRecorder()
	handler.ServeHTTP(protocolRes, protocolReq)
	if protocolRes.Code != http.StatusServiceUnavailable {
		t.Fatalf("protocol request during drain status = %d body = %s", protocolRes.Code, protocolRes.Body.String())
	}

	resumeReq := httptest.NewRequest(http.MethodPost, "/api/admin/system/update-resume", nil)
	resumeReq.Header.Set("Authorization", adminAuthHeader(t, app))
	resumeRes := httptest.NewRecorder()
	handler.ServeHTTP(resumeRes, resumeReq)
	if resumeRes.Code != http.StatusOK {
		t.Fatalf("update-resume status = %d body = %s", resumeRes.Code, resumeRes.Body.String())
	}
	var resumed systemTaskDrainResponse
	if err := json.Unmarshal(resumeRes.Body.Bytes(), &resumed); err != nil {
		t.Fatalf("decode update-resume response: %v", err)
	}
	if resumed.Drained {
		t.Fatalf("resumed admission must not report drain complete: %#v", resumed)
	}
	ready = requestReadiness(t, handler)
	if ready.Code != http.StatusOK {
		t.Fatalf("resumed /ready status = %d body = %s", ready.Code, ready.Body.String())
	}
}

func TestCreationTaskAdmissionErrorUsesStableServiceUnavailableCode(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeCreationTaskSubmitError(recorder, service.ImageTaskAdmissionError{
		Code: service.ImageTaskAdmissionCodeDraining, Message: "版本更新准备中",
	})
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	detail, _ := payload["detail"].(map[string]any)
	errorBody, _ := detail["error"].(map[string]any)
	if errorBody["code"] != service.ImageTaskAdmissionCodeDraining {
		t.Fatalf("error response = %#v", payload)
	}
}

func requestReadiness(t *testing.T, handler http.Handler) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/ready", nil))
	return recorder
}
