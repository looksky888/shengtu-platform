package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/HugoSmits86/nativewebp"
)

func TestAutoImage404OnlyActualConversation(t *testing.T) {
	for _, tc := range []struct {
		name, model, body string
		status            int
		match             bool
	}{
		{"exact", "auto", `{"detail":"Model not found"}`, 404, true},
		{"other model", "gpt-5.5", `{"detail":"Model not found"}`, 404, false},
		{"explicit image 2.5", "gpt-image-2.5-flare", `{"detail":"Model not found"}`, 404, true},
		{"explicit image 2.6", "gpt-image-2.6-flare", `{"detail":"Model not found"}`, 404, true},
		{"other status", "auto", `{"detail":"Model not found"}`, 403, false},
		{"whitespace detail", "auto", `{"detail":"Model not found "}`, 404, false},
		{"nested detail", "auto", `{"detail":{"message":"Model not found"}}`, 404, false},
		{"different key", "auto", `{"error":"Model not found"}`, 404, false},
		{"html", "auto", "<h1>Model not found</h1>", 404, false},
		{"trailing data", "auto", `{"detail":"Model not found"}oops`, 404, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				w.Write([]byte(tc.body))
			}))
			defer server.Close()
			client := NewClient("test-account", nil, nil)
			client.BaseURL = server.URL
			_, err := client.startImageGeneration(context.Background(), "fixture", ChatRequirements{}, "", tc.model, nil, "trace-fixture")
			if errors.Is(err, ErrAutoImageModelNotFound) != tc.match {
				t.Fatalf("unexpected classification: %v", err)
			}
			_, err = client.prepareImageConversation(context.Background(), "fixture", ChatRequirements{}, tc.model, "trace-fixture")
			if errors.Is(err, ErrAutoImageModelNotFound) {
				t.Fatal("prepare must not classify as actual conversation failure")
			}
		})
	}
}

func TestUploadReferenceImagesDetectsGIFWebPAndJPEGExtensions(t *testing.T) {
	palette := color.Palette{color.RGBA{A: 255}, color.RGBA{R: 255, A: 255}}
	var gifBuf bytes.Buffer
	frame := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	if err := gif.EncodeAll(&gifBuf, &gif.GIF{Image: []*image.Paletted{frame}, Delay: []int{5}}); err != nil {
		t.Fatal(err)
	}
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 10, G: 20, B: 30, A: 255})
	var webpBuf, jpgBuf bytes.Buffer
	if err := nativewebp.Encode(&webpBuf, img, nil); err != nil {
		t.Fatal(err)
	}
	if err := jpeg.Encode(&jpgBuf, img, nil); err != nil {
		t.Fatal(err)
	}

	var (
		mu            sync.Mutex
		recordedNames = map[string]string{}
		recordedMimes = map[string]string{}
	)
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/backend-api/files":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			fileName, _ := body["file_name"].(string)
			fileID := "file-" + strings.ReplaceAll(fileName, ".", "_")
			mu.Lock()
			recordedNames[fileID] = fileName
			mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"file_id":    fileID,
				"upload_url": server.URL + "/upload/" + fileID,
			})
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/upload/"):
			fileID := strings.TrimPrefix(r.URL.Path, "/upload/")
			mu.Lock()
			recordedMimes[fileID] = r.Header.Get("Content-Type")
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/uploaded"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"success"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewClient("test-token", nil, nil)
	client.BaseURL = server.URL

	refs, err := client.uploadReferenceImages(context.Background(), []string{
		"data:image/gif;base64," + base64.StdEncoding.EncodeToString(gifBuf.Bytes()),
		"data:image/webp;base64," + base64.StdEncoding.EncodeToString(webpBuf.Bytes()),
		"data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(jpgBuf.Bytes()),
	})
	if err != nil {
		t.Fatalf("uploadReferenceImages() error = %v", err)
	}
	if len(refs) != 3 {
		t.Fatalf("len(refs) = %d, want 3", len(refs))
	}
	expected := []struct {
		name string
		mime string
	}{
		{"image_1.gif", "image/gif"},
		{"image_2.webp", "image/webp"},
		{"image_3.jpg", "image/jpeg"},
	}
	for i, want := range expected {
		if refs[i].FileName != want.name || refs[i].MimeType != want.mime {
			t.Fatalf("refs[%d] = %#v, want name=%s mime=%s", i, refs[i], want.name, want.mime)
		}
		if recordedMimes[refs[i].FileID] != want.mime {
			t.Fatalf("PUT Content-Type for %s = %q, want %q", refs[i].FileID, recordedMimes[refs[i].FileID], want.mime)
		}
	}
}
