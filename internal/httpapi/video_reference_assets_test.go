package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
)

func TestVideoReferenceAssetsArePrivateAndPersisted(t *testing.T) {
	app := newTestApp(t)
	_, aliceToken, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice video", service.AuthOwner{ID: "user:alice", Name: "Alice", Provider: service.AuthProviderLocal})
	if err != nil {
		t.Fatal(err)
	}
	_, bobToken, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob video", service.AuthOwner{ID: "user:bob", Name: "Bob", Provider: service.AuthProviderLocal})
	if err != nil {
		t.Fatal(err)
	}
	body, contentType := referenceAssetMultipart(t)
	req := httptest.NewRequest(http.MethodPost, "/api/video-reference-assets", body)
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	req.Header.Set("Content-Type", contentType)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
	var asset service.VideoReferenceAsset
	if err := json.Unmarshal(res.Body.Bytes(), &asset); err != nil || asset.ID == "" || asset.URL == "" {
		t.Fatalf("upload response = %#v, %v", asset, err)
	}

	list := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets", aliceToken, nil)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), asset.ID) {
		t.Fatalf("alice list status = %d body = %s", list.Code, list.Body.String())
	}
	bobList := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets", bobToken, nil)
	if bobList.Code != http.StatusOK || strings.Contains(bobList.Body.String(), asset.ID) {
		t.Fatalf("bob list status = %d body = %s", bobList.Code, bobList.Body.String())
	}
	bobContent := performVideoReferenceRequest(t, app, http.MethodGet, asset.URL, bobToken, nil)
	if bobContent.Code != http.StatusNotFound {
		t.Fatalf("cross-owner content status = %d body = %s", bobContent.Code, bobContent.Body.String())
	}
	aliceContent := performVideoReferenceRequest(t, app, http.MethodGet, asset.URL, aliceToken, nil)
	if aliceContent.Code != http.StatusOK || aliceContent.Body.Len() == 0 {
		t.Fatalf("owner content status = %d body length = %d", aliceContent.Code, aliceContent.Body.Len())
	}
	deleted := performVideoReferenceRequest(t, app, http.MethodDelete, "/api/video-reference-assets/"+asset.ID, aliceToken, nil)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status = %d body = %s", deleted.Code, deleted.Body.String())
	}
}

func TestVideoReferenceAssetsRequireLoginAndRejectNonImages(t *testing.T) {
	app := newTestApp(t)
	unauthenticated := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets", "", nil)
	if unauthenticated.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d", unauthenticated.Code)
	}
	_, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "asset user", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("image", "notes.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("not an image"))
	_ = writer.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/video-reference-assets", body)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("non-image status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestVideoReferenceAssetsCursorPaginationIsStableAndPrivate(t *testing.T) {
	app := newTestApp(t)
	alice := service.AuthOwner{ID: "user:reference-page-alice", Name: "Alice", Provider: service.AuthProviderLocal}
	bob := service.AuthOwner{ID: "user:reference-page-bob", Name: "Bob", Provider: service.AuthProviderLocal}
	_, aliceToken, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice reference page", alice)
	if err != nil {
		t.Fatal(err)
	}
	_, bobToken, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob reference page", bob)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 3; index++ {
		if _, err := app.videoRefs.New(alice.ID, fmt.Sprintf("alice-%d.png", index), "image/png", []byte{byte(index + 1)}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := app.videoRefs.New(bob.ID, "bob.png", "image/png", []byte("bob")); err != nil {
		t.Fatal(err)
	}

	first := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets?limit=2", aliceToken, nil)
	var firstPage struct {
		Items      []service.VideoReferenceAsset `json:"items"`
		Total      int                           `json:"total"`
		HasMore    bool                          `json:"has_more"`
		NextCursor string                        `json:"next_cursor"`
		Limit      int                           `json:"limit"`
	}
	if first.Code != http.StatusOK || json.Unmarshal(first.Body.Bytes(), &firstPage) != nil {
		t.Fatalf("first page status=%d body=%s", first.Code, first.Body.String())
	}
	if len(firstPage.Items) != 2 || firstPage.Total != 3 || !firstPage.HasMore || firstPage.NextCursor == "" || firstPage.Limit != 2 {
		t.Fatalf("first page = %#v", firstPage)
	}
	second := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets?limit=2&cursor="+url.QueryEscape(firstPage.NextCursor), aliceToken, nil)
	var secondPage struct {
		Items   []service.VideoReferenceAsset `json:"items"`
		Total   int                           `json:"total"`
		HasMore bool                          `json:"has_more"`
	}
	if second.Code != http.StatusOK || json.Unmarshal(second.Body.Bytes(), &secondPage) != nil {
		t.Fatalf("second page status=%d body=%s", second.Code, second.Body.String())
	}
	if len(secondPage.Items) != 1 || secondPage.Total != 3 || secondPage.HasMore || secondPage.Items[0].ID == firstPage.Items[0].ID || secondPage.Items[0].ID == firstPage.Items[1].ID {
		t.Fatalf("second page = %#v", secondPage)
	}
	bobList := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets?limit=2", bobToken, nil)
	if bobList.Code != http.StatusOK || strings.Contains(bobList.Body.String(), firstPage.Items[0].ID) {
		t.Fatalf("bob list status=%d body=%s", bobList.Code, bobList.Body.String())
	}
	if invalid := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets?cursor=not-a-cursor", aliceToken, nil); invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid cursor status=%d body=%s", invalid.Code, invalid.Body.String())
	}
}

func referenceAssetMultipart(t *testing.T) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("image", "portrait.png")
	if err != nil {
		t.Fatal(err)
	}
	frame := image.NewRGBA(image.Rect(0, 0, 2, 2))
	frame.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(part, frame); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body, writer.FormDataContentType()
}

func TestVideoReferenceAssetsEmptyPageReturnsArray(t *testing.T) {
	app := newTestApp(t)
	_, token, err := app.auth.CreateAPIKey(service.AuthRoleUser, "empty reference page", service.AuthOwner{ID: "user:empty-reference-page", Name: "Empty", Provider: service.AuthProviderLocal})
	if err != nil {
		t.Fatal(err)
	}
	res := performVideoReferenceRequest(t, app, http.MethodGet, "/api/video-reference-assets", token, nil)
	var payload struct {
		Items json.RawMessage `json:"items"`
	}
	if res.Code != http.StatusOK || json.Unmarshal(res.Body.Bytes(), &payload) != nil {
		t.Fatalf("empty page status=%d body=%s", res.Code, res.Body.String())
	}
	if string(bytes.TrimSpace(payload.Items)) != "[]" {
		t.Fatalf("empty page items=%s, want []", payload.Items)
	}
}

func performVideoReferenceRequest(t *testing.T, app *App, method, path, token string, body *bytes.Buffer) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Buffer
	if body == nil {
		reader = bytes.NewBuffer(nil)
	} else {
		reader = body
	}
	req := httptest.NewRequest(method, path, reader)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	return res
}
