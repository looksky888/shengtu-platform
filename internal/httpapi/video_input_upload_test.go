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
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/util"
)

func TestVideoInputUploadAndResolve(t *testing.T) {
	app := newTestApp(t)
	identity, _, err := app.auth.LoginPassword(testAdminUsername, testAdminPassword)
	if err != nil {
		t.Fatalf("LoginPassword() error = %v", err)
	}
	auth := adminAuthHeader(t, app)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("image", "first-frame.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	frame := image.NewRGBA(image.Rect(0, 0, 2, 2))
	frame.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(part, frame); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/video-inputs", body)
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
	var uploaded videoInputUploadResponse
	if err := json.Unmarshal(res.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if !strings.HasPrefix(uploaded.InputReference, videoInputReferencePrefix) || uploaded.MIMEType != "image/png" || uploaded.SizeBytes == 0 {
		t.Fatalf("upload response = %#v", uploaded)
	}

	payload := map[string]any{
		"owner_id":        identityScope(*identity),
		"image_reference": uploaded.InputReference,
		"prompt":          "animate this frame",
	}
	resolved, err := app.resolveVideoInputPayload(payload)
	if err != nil {
		t.Fatalf("resolveVideoInputPayload() error = %v", err)
	}
	imageValue, _ := resolved["image"].(map[string]any)
	dataURI, _ := imageValue["url"].(string)
	if !strings.HasPrefix(dataURI, "data:image/png;base64,") {
		t.Fatalf("resolved input_reference = %.40q", dataURI)
	}
	if payload["image_reference"] != uploaded.InputReference {
		t.Fatal("resolveVideoInputPayload mutated the stored task payload")
	}
}

func TestResolveVideoInputPayloadSeparatesFirstFrameAndReferences(t *testing.T) {
	app := newTestApp(t)
	ownerID := "video-user"
	dir := videoInputOwnerDir(app.config.DataDir, ownerID)
	frame := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for _, id := range []string{strings.Repeat("a", 32), strings.Repeat("b", 32)} {
		var data bytes.Buffer
		if err := png.Encode(&data, frame); err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, id), data.Bytes(), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	payload := map[string]any{
		"owner_id":         ownerID,
		"image_reference":  videoInputReferencePrefix + strings.Repeat("a", 32),
		"reference_images": []any{videoInputReferencePrefix + strings.Repeat("b", 32), "https://example.test/style.png"},
	}
	resolved, err := app.resolveVideoInputPayload(payload)
	if err != nil {
		t.Fatalf("resolveVideoInputPayload() error = %v", err)
	}
	if imageValue, ok := resolved["image"].(map[string]any); !ok || !strings.HasPrefix(util.Clean(imageValue["url"]), "data:image/png;base64,") {
		t.Fatalf("image = %#v", resolved["image"])
	}
	refs := resolved["reference_images"].([]any)
	if len(refs) != 2 {
		t.Fatalf("reference_images = %#v", refs)
	}
}

func TestResolveVideoInputPayloadExpandsPersistentReferenceAssets(t *testing.T) {
	app := newTestApp(t)
	ownerID := "video-user"
	asset, err := app.videoRefs.New(ownerID, "style.png", "image/png", []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	if err != nil {
		t.Fatalf("videoRefs.New() error = %v", err)
	}
	payload := map[string]any{
		"owner_id":         ownerID,
		"reference_images": []any{videoAssetReferencePrefix + asset.ID},
	}
	resolved, err := app.resolveVideoInputPayload(payload)
	if err != nil {
		t.Fatalf("resolveVideoInputPayload() error = %v", err)
	}
	refs, ok := resolved["reference_images"].([]any)
	if !ok || len(refs) != 1 {
		t.Fatalf("reference_images = %#v", resolved["reference_images"])
	}
	item, ok := refs[0].(map[string]any)
	if !ok || !strings.HasPrefix(util.Clean(item["url"]), "data:image/png;base64,") {
		t.Fatalf("resolved reference = %#v", refs[0])
	}
}

func TestVideoInputUploadRejectsNonImage(t *testing.T) {
	app := newTestApp(t)
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("image", "notes.txt")
	_, _ = part.Write([]byte("not an image"))
	_ = writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/video-inputs", body)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestVideoInputUploadRequiresLogin(t *testing.T) {
	app := newTestApp(t)
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/video-inputs", strings.NewReader(""))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestCleanupVideoInputsKeepsRoomForNextUpload(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	for index := 0; index < maxVideoInputsPerOwner+5; index++ {
		name := fmt.Sprintf("%032x", index)
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("input"), 0o600); err != nil {
			t.Fatalf("WriteFile() error = %v", err)
		}
		stamp := now.Add(-time.Duration(index) * time.Minute)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatalf("Chtimes() error = %v", err)
		}
	}

	cleanupVideoInputs(dir, now)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir() error = %v", err)
	}
	if len(entries) != maxVideoInputsPerOwner-1 {
		t.Fatalf("retained inputs = %d, want %d", len(entries), maxVideoInputsPerOwner-1)
	}
}
