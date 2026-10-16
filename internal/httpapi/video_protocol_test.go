package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestProtocolVideoSubmitAndStatusContract(t *testing.T) {
	app := newTestApp(t)
	_, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "video api", service.AuthOwner{ID: "user:video-api", Name: "Video API"})
	if err != nil {
		t.Fatal(err)
	}
	received := make(chan map[string]any, 1)
	app.tasks.SetVideoHandler(func(_ context.Context, _ service.Identity, payload map[string]any) (map[string]any, error) {
		received <- payload
		return map[string]any{"output_type": "video", "data": []map[string]any{{"url": "/unused"}}}, nil
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"prompt":"ocean","model":"grok-imagine-video-1.5","seconds":8,"size":"1280x720","resolution_name":"720p","reference_images":["https://example.test/a.png"]}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("submit status=%d body=%s", res.Code, res.Body.String())
	}
	var submitted protocolVideo
	if err := json.Unmarshal(res.Body.Bytes(), &submitted); err != nil {
		t.Fatal(err)
	}
	if submitted.ID == "" || submitted.TaskID != submitted.ID || submitted.Object != "video" || submitted.Status != "queued" {
		t.Fatalf("submitted=%#v", submitted)
	}
	if submitted.Seconds != 8 || submitted.Size != "1280x720" || submitted.ResolutionName != "720p" {
		t.Fatalf("submitted options=%#v", submitted)
	}
	select {
	case payload := <-received:
		if util.ToInt(payload["seconds"], 0) != 8 || len(payload["reference_images"].([]any)) != 1 {
			t.Fatalf("payload=%#v", payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("video handler not invoked")
	}

	req = httptest.NewRequest(http.MethodGet, "/v1/videos/"+submitted.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	var status protocolVideo
	if err := json.Unmarshal(res.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status.Status != "completed" || status.TaskID != submitted.ID {
		t.Fatalf("status response=%#v", status)
	}
}

func TestProtocolVideoMultipartReferences(t *testing.T) {
	app := newTestApp(t)
	_, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "video multipart", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	received := make(chan map[string]any, 1)
	app.tasks.SetVideoHandler(func(_ context.Context, _ service.Identity, payload map[string]any) (map[string]any, error) {
		received <- payload
		return map[string]any{"data": []map[string]any{{"url": "/unused"}}}, nil
	})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("prompt", "animate")
	for index := 0; index < 2; index++ {
		part, createErr := writer.CreateFormFile("image[]", "ref.png")
		if createErr != nil {
			t.Fatal(createErr)
		}
		_, _ = part.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', byte(index), 0, 0, 0})
	}
	_ = writer.Close()
	req := httptest.NewRequest(http.MethodPost, "/v1/videos", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	select {
	case payload := <-received:
		if !strings.HasPrefix(util.Clean(payload["image_reference"]), "data:image/png;base64,") {
			t.Fatalf("image_reference=%#v", payload["image_reference"])
		}
		if refs, ok := payload["reference_images"].([]any); !ok || len(refs) != 1 {
			t.Fatalf("reference_images=%#v", payload["reference_images"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("video handler not invoked")
	}
}

func TestProtocolVideoContentRejectsOtherOwner(t *testing.T) {
	app := newTestApp(t)
	alice := service.AuthOwner{ID: "user:alice-protocol-video", Name: "Alice"}
	bob := service.AuthOwner{ID: "user:bob-protocol-video", Name: "Bob"}
	_, aliceToken, _ := app.auth.CreateAPIKey(service.AuthRoleUser, "alice", alice)
	_, bobToken, _ := app.auth.CreateAPIKey(service.AuthRoleUser, "bob", bob)
	asset := service.VideoAsset{TaskID: "owned-video", OwnerID: alice.ID, OwnerName: alice.Name, Visibility: service.VideoAssetVisibilityPublic}
	if err := storage.AtomicWriteFile(app.videos.ContentPath(asset.OwnerID, asset.TaskID), []byte("video-data"), 0o644); err != nil {
		t.Fatal(err)
	}
	recorded, err := app.videos.Record(asset)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		token string
		want  int
	}{{aliceToken, http.StatusOK}, {bobToken, http.StatusNotFound}} {
		req := httptest.NewRequest(http.MethodGet, "/v1/videos/"+recorded.ID+"/content", nil)
		req.Header.Set("Authorization", "Bearer "+tc.token)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != tc.want {
			t.Fatalf("content status=%d want=%d body=%s", res.Code, tc.want, res.Body.String())
		}
	}
}

func TestProtocolVideoListUsesCursorAndOwnerScope(t *testing.T) {
	app := newTestApp(t)
	alice := service.AuthOwner{ID: "user:video-list", Name: "Alice"}
	_, token, _ := app.auth.CreateAPIKey(service.AuthRoleUser, "video list", alice)
	for _, id := range []string{"video-a", "video-b", "video-c"} {
		if _, err := app.tasks.SubmitVideo(context.Background(), service.Identity{ID: alice.ID, OwnerID: alice.ID, Role: service.AuthRoleUser}, id, "prompt", "grok-imagine-video", "720x1280", 6, "720p", "custom", nil, nil); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/videos?limit=2", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", res.Code, res.Body.String())
	}
	var page protocolVideoList
	if err := json.Unmarshal(res.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.Object != "list" || len(page.Data) != 2 || !page.HasMore || page.NextCursor == "" || page.Total != 3 {
		t.Fatalf("page=%#v", page)
	}
	req = httptest.NewRequest(http.MethodGet, "/v1/videos?limit=2&after="+url.QueryEscape(page.NextCursor), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("second list status=%d body=%s", res.Code, res.Body.String())
	}
	var second protocolVideoList
	if err := json.Unmarshal(res.Body.Bytes(), &second); err != nil {
		t.Fatal(err)
	}
	if len(second.Data) != 1 || second.HasMore {
		t.Fatalf("second page=%#v", second)
	}
}

func TestProtocolVideoCancelAndIdempotencyConflict(t *testing.T) {
	app := newTestApp(t)
	app.tasks.SetVideoHandler(func(ctx context.Context, _ service.Identity, _ map[string]any) (map[string]any, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	})
	_, token, _ := app.auth.CreateAPIKey(service.AuthRoleUser, "video cancel", service.AuthOwner{ID: "user:video-cancel"})
	req := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"client_task_id":"stable-video","prompt":"one"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Idempotency-Key", "stable-video")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("first submit status=%d body=%s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"client_task_id":"stable-video","prompt":"one"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Idempotency-Key", "stable-video")
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("idempotent replay status=%d body=%s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"client_task_id":"stable-video","prompt":"different"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Idempotency-Key", "stable-video")
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusConflict {
		t.Fatalf("conflict status=%d body=%s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodDelete, "/v1/videos/stable-video", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("cancel status=%d body=%s", res.Code, res.Body.String())
	}
	var cancelled protocolVideo
	if err := json.Unmarshal(res.Body.Bytes(), &cancelled); err != nil {
		t.Fatal(err)
	}
	if cancelled.Status != "cancelled" {
		t.Fatalf("cancelled=%#v", cancelled)
	}
}
