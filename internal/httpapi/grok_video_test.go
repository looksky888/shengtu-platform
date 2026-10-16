package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestGrokVideoCreatePollDownloadAndArchive(t *testing.T) {
	var polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Token") == "" {
			t.Fatal("missing internal token")
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/internal/v1/videos":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create body: %v", err)
			}
			if body["prompt"] != "ocean sunrise" || util.ToInt(body["seconds"], 0) != 6 {
				t.Fatalf("create body = %#v", body)
			}
			_, _ = w.Write([]byte(`{"id":"video_remote","status":"queued","progress":0}`))
		case r.Method == http.MethodGet && r.URL.Path == "/internal/v1/videos/video_remote":
			if polls.Add(1) == 1 {
				_, _ = w.Write([]byte(`{"id":"video_remote","status":"in_progress","progress":50}`))
				return
			}
			_, _ = w.Write([]byte(`{"id":"video_remote","status":"completed","progress":100}`))
		case r.Method == http.MethodGet && r.URL.Path == "/internal/v1/videos/video_remote/content":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video-bytes"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("v", 32))
	app := newTestApp(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	created, err := createGrokVideoJob(ctx, server.URL, strings.Repeat("v", 32), map[string]any{
		"model": "grok-imagine-video", "prompt": "ocean sunrise", "seconds": 6,
	})
	if err != nil {
		t.Fatalf("createGrokVideoJob: %v", err)
	}
	completed, err := waitGrokVideoJob(ctx, server.URL, strings.Repeat("v", 32), created.ID, time.Millisecond)
	if err != nil || completed.Status != "completed" {
		t.Fatalf("waitGrokVideoJob = %#v, %v", completed, err)
	}
	path := app.videos.ContentPath("owner", "task-video")
	written, contentType, err := downloadGrokVideoToFile(ctx, server.URL, strings.Repeat("v", 32), completed.ID, path)
	if err != nil || written != int64(len("video-bytes")) || contentType != "video/mp4" {
		t.Fatalf("downloadGrokVideoToFile = %d, %q, %v", written, contentType, err)
	}
	raw, err := os.ReadFile(path)
	if err != nil || string(raw) != "video-bytes" {
		t.Fatalf("archived content = %q, %v", raw, err)
	}
}

func TestGrokVideoTaskProgressUsesOneDisplayScale(t *testing.T) {
	if got := grokVideoTaskProgress(37); got != 67 {
		t.Fatalf("grokVideoTaskProgress(37) = %d, want 67", got)
	}
	if got := grokVideoTaskProgress(-1); got != 55 {
		t.Fatalf("grokVideoTaskProgress(-1) = %d, want 55", got)
	}
	if got := grokVideoTaskProgress(101); got != 90 {
		t.Fatalf("grokVideoTaskProgress(101) = %d, want 90", got)
	}
}

type videoProgressCapture struct {
	percent int
	message string
}

func (*videoProgressCapture) Event(string, string, map[string]any) {}
func (*videoProgressCapture) BindAccount(string, string, int)      {}
func (s *videoProgressCapture) SetProgress(percent int, _ string, message string) {
	s.percent = percent
	s.message = message
}

func TestWaitGrokVideoJobReportsMatchingPercentAndMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"id":"remote","status":"completed","progress":37}`))
	}))
	defer server.Close()
	sink := &videoProgressCapture{}
	ctx := service.WithTaskProgress(context.Background(), sink)
	if _, err := waitGrokVideoJob(ctx, server.URL, "", "remote", time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if sink.percent != 67 || sink.message != "Grok 视频生成 67%" {
		t.Fatalf("progress = %d, message = %q", sink.percent, sink.message)
	}
}

func TestDownloadGrokVideoDoesNotPublishPartialContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(maxVideoContentBytes+1))
		_, _ = w.Write([]byte("oversized"))
	}))
	defer server.Close()
	destination := filepath.Join(t.TempDir(), "video.mp4")
	if err := os.WriteFile(destination, []byte("previous"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, _, err := downloadGrokVideoToFile(context.Background(), server.URL, "", "video", destination)
	if err == nil {
		t.Fatal("downloadGrokVideoToFile() succeeded, want size failure")
	}
	raw, readErr := os.ReadFile(destination)
	if readErr != nil || string(raw) != "previous" {
		t.Fatalf("existing archive changed after failed download: %q, %v", raw, readErr)
	}
}

func TestGrokVideoPathIsStableAndTraversalSafe(t *testing.T) {
	root := t.TempDir()
	left := grokVideoPath(root, "../task")
	right := grokVideoPath(root, "../task")
	if left != right || !strings.HasPrefix(left, root) || strings.Contains(strings.TrimPrefix(left, root), "..") {
		t.Fatalf("video path = %q / %q", left, right)
	}
}

func TestVideoCreationTaskPersistsAndServesArchivedContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/internal/v1/videos":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode video request: %v", err)
			}
			if reference := util.Clean(body["input_reference"]); !strings.HasPrefix(reference, "data:image/png;base64,") {
				t.Errorf("input_reference was not resolved for runtime: %.40q", reference)
			}
			_, _ = w.Write([]byte(`{"id":"remote_task","status":"queued","progress":0}`))
		case r.Method == http.MethodGet && r.URL.Path == "/internal/v1/videos/remote_task":
			_, _ = w.Write([]byte(`{"id":"remote_task","status":"completed","progress":100}`))
		case r.Method == http.MethodGet && r.URL.Path == "/internal/v1/videos/remote_task/content":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("archived-video"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("v", 32))
	app := newTestApp(t)
	identity, token, err := app.auth.LoginPassword(testAdminUsername, testAdminPassword)
	if err != nil {
		t.Fatalf("LoginPassword() error = %v", err)
	}
	if _, _, err := app.credits.Add(imageCreditUserID(*identity), 100, "test", "video-success-seed"); err != nil {
		t.Fatal(err)
	}
	auth := "Bearer " + token
	inputID := strings.Repeat("a", 32)
	inputPath := filepath.Join(videoInputOwnerDir(app.config.DataDir, identityScope(*identity)), inputID)
	pngHeader := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 0}
	if err := storage.AtomicWriteFile(inputPath, pngHeader, 0o600); err != nil {
		t.Fatalf("write video input: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/video-generations", strings.NewReader(`{"client_task_id":"video-local","prompt":"ocean","seconds":6,"input_reference":"video-input:`+inputID+`"}`))
	req.Header.Set("Authorization", auth)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d body = %s", res.Code, res.Body.String())
	}
	var submitted map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &submitted); err != nil {
		t.Fatalf("submit json: %v", err)
	}
	if submitted["mode"] != "video" {
		t.Fatalf("submitted task = %#v", submitted)
	}
	item := waitCreationTaskStatus(t, app, strings.TrimPrefix(auth, "Bearer "), "video-local", "success")
	data := util.AsMapSlice(item["data"])
	assetID := service.VideoAssetID(identityScope(*identity), "video-local")
	if len(data) != 1 || util.Clean(data[0]["url"]) != "/api/videos/"+assetID+"/content" {
		t.Fatalf("video task data = %#v", item["data"])
	}
	contentReq := httptest.NewRequest(http.MethodGet, "/api/videos/"+assetID+"/content", nil)
	contentReq.Header.Set("Authorization", auth)
	contentRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(contentRes, contentReq)
	if contentRes.Code != http.StatusOK || contentRes.Body.String() != "archived-video" {
		t.Fatalf("content status=%d body=%q", contentRes.Code, contentRes.Body.String())
	}
	downloadReq := httptest.NewRequest(http.MethodGet, "/api/videos/"+assetID+"/content?download=1", nil)
	downloadReq.Header.Set("Authorization", auth)
	downloadRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(downloadRes, downloadReq)
	if got := downloadRes.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") || !strings.Contains(got, ".mp4") {
		t.Fatalf("download Content-Disposition = %q", got)
	}
	legacyContentReq := httptest.NewRequest(http.MethodGet, "/api/videos/video-local/content", nil)
	legacyContentReq.Header.Set("Authorization", auth)
	legacyContentRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(legacyContentRes, legacyContentReq)
	if legacyContentRes.Code != http.StatusOK || legacyContentRes.Body.String() != "archived-video" {
		t.Fatalf("legacy content status=%d body=%q", legacyContentRes.Code, legacyContentRes.Body.String())
	}
}

func TestVideoGenerationRefundsCreditsOnUpstreamFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"upstream failed"}}`, http.StatusBadGateway)
	}))
	defer server.Close()
	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("v", 32))
	app := newTestApp(t)
	user, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "video billing", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := app.credits.Add(user.ID, 30, "test", "video-failure-seed"); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/video-generations", strings.NewReader(`{"client_task_id":"video-refund","prompt":"ocean","seconds":6}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status=%d body=%s", res.Code, res.Body.String())
	}
	waitCreationTaskStatus(t, app, token, "video-refund", service.TaskStatusError)
	account, err := app.credits.Account(user.ID)
	if err != nil || account.Balance != 30 {
		t.Fatalf("video failure account=%#v err=%v", account, err)
	}
	refID := "api/creation-tasks/video-generations:video-refund"
	if !app.credits.HasLedgerEntry(user.ID, service.CreditReasonVideoRefund, refID) {
		t.Fatal("video refund ledger entry missing")
	}
}

func TestVideoLibraryEnforcesOwnerScopeAndAdminVisibility(t *testing.T) {
	app := newTestApp(t)
	aliceOwner := service.AuthOwner{ID: "user:alice", Name: "Alice", Provider: service.AuthProviderLocal}
	bobOwner := service.AuthOwner{ID: "user:bob", Name: "Bob", Provider: service.AuthProviderLocal}
	_, aliceKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice video", aliceOwner)
	if err != nil {
		t.Fatal(err)
	}
	_, bobKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob video", bobOwner)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []service.VideoAsset{
		{TaskID: "alice-video", OwnerID: aliceOwner.ID, OwnerName: aliceOwner.Name, CreatedAt: "2026-08-12T10:00:00Z"},
		{TaskID: "bob-video", OwnerID: bobOwner.ID, OwnerName: bobOwner.Name, CreatedAt: "2026-08-12T11:00:00Z"},
	} {
		path := app.videos.ContentPath(item.OwnerID, item.TaskID)
		if err := storage.AtomicWriteFile(path, []byte(item.TaskID), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := app.videos.Record(item); err != nil {
			t.Fatal(err)
		}
	}

	aliceID := service.VideoAssetID(aliceOwner.ID, "alice-video")
	bobID := service.VideoAssetID(bobOwner.ID, "bob-video")
	aliceList := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=mine", aliceKey, "")
	if aliceList.Code != http.StatusOK || !strings.Contains(aliceList.Body.String(), "alice-video") || strings.Contains(aliceList.Body.String(), "bob-video") {
		t.Fatalf("alice list status=%d body=%s", aliceList.Code, aliceList.Body.String())
	}
	adminList := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=all", strings.TrimPrefix(adminAuthHeader(t, app), "Bearer "), "")
	if adminList.Code != http.StatusOK || !strings.Contains(adminList.Body.String(), "alice-video") || !strings.Contains(adminList.Body.String(), "bob-video") {
		t.Fatalf("admin list status=%d body=%s", adminList.Code, adminList.Body.String())
	}

	crossRead := performVideoRequest(t, app, http.MethodGet, "/api/videos/"+bobID+"/content", aliceKey, "")
	if crossRead.Code != http.StatusNotFound {
		t.Fatalf("cross-owner content status=%d body=%s", crossRead.Code, crossRead.Body.String())
	}
	crossDelete := performVideoRequest(t, app, http.MethodDelete, "/api/videos", aliceKey, `{"id":"`+bobID+`"}`)
	if crossDelete.Code != http.StatusNotFound {
		t.Fatalf("cross-owner delete status=%d body=%s", crossDelete.Code, crossDelete.Body.String())
	}
	bobRead := performVideoRequest(t, app, http.MethodGet, "/api/videos/"+bobID+"/content", bobKey, "")
	if bobRead.Code != http.StatusOK || bobRead.Body.String() != "bob-video" {
		t.Fatalf("owner content status=%d body=%q", bobRead.Code, bobRead.Body.String())
	}
	publicUpdate := performVideoRequest(t, app, http.MethodPatch, "/api/videos/visibility", aliceKey, `{"id":"`+aliceID+`","visibility":"public"}`)
	if publicUpdate.Code != http.StatusOK {
		t.Fatalf("visibility status=%d body=%s", publicUpdate.Code, publicUpdate.Body.String())
	}
	publicList := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=public", bobKey, "")
	if publicList.Code != http.StatusOK || !strings.Contains(publicList.Body.String(), "alice-video") || strings.Contains(publicList.Body.String(), "bob-video") {
		t.Fatalf("public list status=%d body=%s", publicList.Code, publicList.Body.String())
	}
	publicRead := performVideoRequest(t, app, http.MethodGet, "/api/videos/"+aliceID+"/content", bobKey, "")
	if publicRead.Code != http.StatusOK || publicRead.Body.String() != "alice-video" {
		t.Fatalf("public content status=%d body=%q", publicRead.Code, publicRead.Body.String())
	}
	forbiddenAll := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=all", aliceKey, "")
	if forbiddenAll.Code != http.StatusForbidden {
		t.Fatalf("non-admin all status=%d body=%s", forbiddenAll.Code, forbiddenAll.Body.String())
	}
	adminDelete := performVideoRequest(t, app, http.MethodDelete, "/api/videos", strings.TrimPrefix(adminAuthHeader(t, app), "Bearer "), `{"id":"`+bobID+`"}`)
	if adminDelete.Code != http.StatusOK {
		t.Fatalf("admin delete status=%d body=%s", adminDelete.Code, adminDelete.Body.String())
	}
}

func TestVideoLibraryCursorPaginationIsStableAndScoped(t *testing.T) {
	app := newTestApp(t)
	aliceOwner := service.AuthOwner{ID: "user:alice-page", Name: "Alice", Provider: service.AuthProviderLocal}
	bobOwner := service.AuthOwner{ID: "user:bob-page", Name: "Bob", Provider: service.AuthProviderLocal}
	_, aliceKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice page", aliceOwner)
	if err != nil {
		t.Fatal(err)
	}
	for index, createdAt := range []string{"2026-08-12T13:00:00Z", "2026-08-12T12:00:00Z", "2026-08-12T11:00:00Z"} {
		item := service.VideoAsset{TaskID: fmt.Sprintf("alice-page-%d", index), OwnerID: aliceOwner.ID, CreatedAt: createdAt}
		if err := storage.AtomicWriteFile(app.videos.ContentPath(item.OwnerID, item.TaskID), []byte("video"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := app.videos.Record(item); err != nil {
			t.Fatal(err)
		}
	}
	bob := service.VideoAsset{TaskID: "bob-page", OwnerID: bobOwner.ID, CreatedAt: "2026-08-12T14:00:00Z"}
	if err := storage.AtomicWriteFile(app.videos.ContentPath(bob.OwnerID, bob.TaskID), []byte("video"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := app.videos.Record(bob); err != nil {
		t.Fatal(err)
	}

	first := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=mine&limit=2", aliceKey, "")
	var firstPage struct {
		Items      []service.VideoAsset `json:"items"`
		Total      int                  `json:"total"`
		HasMore    bool                 `json:"has_more"`
		NextCursor string               `json:"next_cursor"`
		Limit      int                  `json:"limit"`
	}
	if first.Code != http.StatusOK || json.Unmarshal(first.Body.Bytes(), &firstPage) != nil {
		t.Fatalf("first page status=%d body=%s", first.Code, first.Body.String())
	}
	if len(firstPage.Items) != 2 || firstPage.Total != 3 || !firstPage.HasMore || firstPage.NextCursor == "" || firstPage.Limit != 2 {
		t.Fatalf("first page = %#v", firstPage)
	}
	second := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=mine&limit=2&cursor="+url.QueryEscape(firstPage.NextCursor), aliceKey, "")
	var secondPage struct {
		Items   []service.VideoAsset `json:"items"`
		Total   int                  `json:"total"`
		HasMore bool                 `json:"has_more"`
	}
	if second.Code != http.StatusOK || json.Unmarshal(second.Body.Bytes(), &secondPage) != nil {
		t.Fatalf("second page status=%d body=%s", second.Code, second.Body.String())
	}
	if len(secondPage.Items) != 1 || secondPage.Total != 3 || secondPage.HasMore || secondPage.Items[0].ID == firstPage.Items[0].ID || secondPage.Items[0].ID == firstPage.Items[1].ID {
		t.Fatalf("second page = %#v", secondPage)
	}
	if invalid := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=mine&cursor=not-a-cursor", aliceKey, ""); invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid cursor status=%d body=%s", invalid.Code, invalid.Body.String())
	}
}

func TestVideoLibraryEmptyPageReturnsArray(t *testing.T) {
	app := newTestApp(t)
	_, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "empty video page", service.AuthOwner{ID: "user:empty-video-page", Name: "Empty", Provider: service.AuthProviderLocal})
	if err != nil {
		t.Fatal(err)
	}
	res := performVideoRequest(t, app, http.MethodGet, "/api/videos?scope=mine", token, "")
	var payload struct {
		Items json.RawMessage `json:"items"`
	}
	if res.Code != http.StatusOK || json.Unmarshal(res.Body.Bytes(), &payload) != nil {
		t.Fatalf("empty page status=%d body=%s", res.Code, res.Body.String())
	}
	if strings.TrimSpace(string(payload.Items)) != "[]" {
		t.Fatalf("empty page items=%s, want []", payload.Items)
	}
}

func performVideoRequest(t *testing.T, app *App, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	return res
}
