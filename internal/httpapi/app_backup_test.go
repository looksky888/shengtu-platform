package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/service"
)

func TestBackupRunUsesAcceptedTriggerAndStatusEndpoint(t *testing.T) {
	app := newTestApp(t)
	auth := adminAuthHeader(t, app)

	request := httptest.NewRequest(http.MethodPost, "/api/admin/backup/run", nil)
	request.Header.Set("Authorization", auth)
	response := httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatalf("POST status = %d body = %s", response.Code, response.Body.String())
	}
	var started service.BackupRunResultPublic
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode POST response: %v", err)
	}
	if !started.Started || started.State.TaskID == "" || started.State.Status != service.BackupStatusRunning {
		t.Fatalf("POST response = %#v", started)
	}

	request = httptest.NewRequest(http.MethodGet, "/api/admin/backup/run", nil)
	request.Header.Set("Authorization", auth)
	response = httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("GET status = %d body = %s", response.Code, response.Body.String())
	}
	var current service.BackupRunResultPublic
	if err := json.Unmarshal(response.Body.Bytes(), &current); err != nil {
		t.Fatalf("decode GET response: %v", err)
	}
	if current.Started || current.State.TaskID != started.State.TaskID {
		t.Fatalf("GET response = %#v, POST task = %q", current, started.State.TaskID)
	}
	if current.State.Status != service.BackupStatusRunning && current.State.Status != service.BackupStatusSuccess {
		t.Fatalf("GET backup status = %q", current.State.Status)
	}
}
