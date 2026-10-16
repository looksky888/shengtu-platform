package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInternalHostUpdateControlIsPrivateAndAuthenticated(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef"
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("i", 32))
	t.Setenv("CHATGPT2API_HOST_UPDATER_TOKEN", token)
	app := newTestApp(t)
	handler, err := app.InternalHandler()
	if err != nil {
		t.Fatal(err)
	}

	public := httptest.NewRecorder()
	app.Handler().ServeHTTP(public, httptest.NewRequest(http.MethodGet, internalHostUpdateStatusPath, nil))
	if public.Code != http.StatusNotFound {
		t.Fatalf("public control status = %d", public.Code)
	}

	for name, header := range map[string]string{"missing": "", "wrong": "Bearer " + strings.Repeat("x", 32)} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, internalHostUpdateStatusPath, nil)
			req.Header.Set("Authorization", header)
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
			}
		})
	}

	req := httptest.NewRequest(http.MethodGet, internalHostUpdateStatusPath, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("authenticated status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestInternalHostUpdateDrainBlocksWritesAndCanResume(t *testing.T) {
	const token = "fedcba9876543210fedcba9876543210"
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("i", 32))
	t.Setenv("CHATGPT2API_HOST_UPDATER_TOKEN", token)
	app := newTestApp(t)
	internal, err := app.InternalHandler()
	if err != nil {
		t.Fatal(err)
	}
	authorize := func(req *http.Request) { req.Header.Set("Authorization", "Bearer "+token) }

	drainReq := httptest.NewRequest(http.MethodPost, internalHostUpdateDrainPath, nil)
	authorize(drainReq)
	drainRes := httptest.NewRecorder()
	internal.ServeHTTP(drainRes, drainReq)
	if drainRes.Code != http.StatusOK {
		t.Fatalf("drain status = %d body = %s", drainRes.Code, drainRes.Body.String())
	}
	var drained systemTaskDrainResponse
	if err := json.Unmarshal(drainRes.Body.Bytes(), &drained); err != nil {
		t.Fatal(err)
	}
	if !drained.Drained || !drained.Tasks.Draining || !drained.Requests.Draining {
		t.Fatalf("drain response = %#v", drained)
	}

	writeReq := httptest.NewRequest(http.MethodPost, "/api/profile/password", strings.NewReader(`{}`))
	writeRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(writeRes, writeReq)
	if writeRes.Code != http.StatusServiceUnavailable || !strings.Contains(writeRes.Body.String(), "service_draining") {
		t.Fatalf("write during drain = %d body = %s", writeRes.Code, writeRes.Body.String())
	}
	readRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(readRes, httptest.NewRequest(http.MethodGet, "/api/app-meta", nil))
	if readRes.Code != http.StatusOK {
		t.Fatalf("read during drain = %d body = %s", readRes.Code, readRes.Body.String())
	}

	resumeReq := httptest.NewRequest(http.MethodPost, internalHostUpdateResumePath, nil)
	authorize(resumeReq)
	resumeRes := httptest.NewRecorder()
	internal.ServeHTTP(resumeRes, resumeReq)
	if resumeRes.Code != http.StatusOK {
		t.Fatalf("resume status = %d body = %s", resumeRes.Code, resumeRes.Body.String())
	}
	postResume := httptest.NewRecorder()
	app.Handler().ServeHTTP(postResume, httptest.NewRequest(http.MethodPost, "/api/profile/password", strings.NewReader(`{}`)))
	if postResume.Code == http.StatusServiceUnavailable {
		t.Fatalf("write admission remained closed: %s", postResume.Body.String())
	}
}

func TestUpdateAdmissionTracksWritesAndPreservesControlRoutes(t *testing.T) {
	gate := newUpdateAdmissionGate()
	release, err := gate.enter()
	if err != nil {
		t.Fatal(err)
	}
	snapshot := gate.beginDrain("test")
	if snapshot.Active != 1 || snapshot.Drained {
		t.Fatalf("active snapshot = %#v", snapshot)
	}
	release()
	if snapshot = gate.snapshot(); snapshot.Active != 0 || !snapshot.Drained {
		t.Fatalf("released snapshot = %#v", snapshot)
	}

	for _, item := range []struct {
		method string
		path   string
		want   bool
	}{
		{http.MethodPost, "/api/profile/password", true},
		{http.MethodPatch, "/api/settings", true},
		{http.MethodDelete, "/api/images", true},
		{http.MethodGet, "/api/profile", false},
		{http.MethodPost, "/api/admin/system/update-drain", false},
		{http.MethodPost, "/api/admin/system/update-resume", false},
	} {
		if got := isUpdateSensitiveRequest(item.method, item.path); got != item.want {
			t.Fatalf("isUpdateSensitiveRequest(%s, %s) = %v", item.method, item.path, got)
		}
	}
}
