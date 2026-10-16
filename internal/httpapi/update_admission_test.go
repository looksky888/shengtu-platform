package httpapi

import (
	"errors"
	"net/http"
	"testing"

	"chatgpt2api/internal/service"
)

func TestUpdateAdmissionGateTracksInflightAndRejectsNewRequests(t *testing.T) {
	gate := newUpdateAdmissionGate()
	release, err := gate.enter()
	if err != nil {
		t.Fatalf("enter() error = %v", err)
	}
	if got := gate.snapshot(); got.Active != 1 || got.Drained || !got.Accepting {
		t.Fatalf("active snapshot = %#v", got)
	}
	draining := gate.beginDrain("版本更新准备中")
	if draining.Accepting || draining.Drained || draining.Active != 1 {
		t.Fatalf("beginDrain() = %#v", draining)
	}
	if _, err := gate.enter(); err == nil {
		t.Fatal("enter() during drain error = nil")
	} else {
		var admissionErr service.ImageTaskAdmissionError
		if !errors.As(err, &admissionErr) || admissionErr.Code != service.ImageTaskAdmissionCodeDraining {
			t.Fatalf("enter() during drain error = %#v", err)
		}
	}
	release()
	release()
	if got := gate.snapshot(); !got.Drained || got.Active != 0 || got.Accepting {
		t.Fatalf("drained snapshot = %#v", got)
	}
	if got := gate.resume(); !got.Accepting || got.Draining {
		t.Fatalf("resume() = %#v", got)
	}
}

func TestUpdateSensitiveRequestClassification(t *testing.T) {
	tests := []struct {
		method string
		path   string
		want   bool
	}{
		{http.MethodPost, "/v1/images/generations", true},
		{http.MethodPost, "/v1/images/edits", true},
		{http.MethodPost, "/v1/chat/completions", true},
		{http.MethodPost, "/v1/responses", true},
		{http.MethodPost, "/v1/messages", true},
		{http.MethodPost, "/v1/videos", true},
		{http.MethodPost, "/v1/videos/task-1", true},
		{http.MethodGet, "/v1/videos/task-1", false},
		{http.MethodGet, "/v1/models", false},
		{http.MethodPost, "/api/creation-tasks/image-generations", true},
		{http.MethodPatch, "/api/settings", true},
		{http.MethodDelete, "/api/images", true},
		{http.MethodPost, "/api/admin/system/update-drain", false},
		{http.MethodPost, "/api/admin/system/update-resume", false},
	}
	for _, test := range tests {
		if got := isUpdateSensitiveRequest(test.method, test.path); got != test.want {
			t.Errorf("isUpdateSensitiveRequest(%q, %q) = %v, want %v", test.method, test.path, got, test.want)
		}
	}
}
