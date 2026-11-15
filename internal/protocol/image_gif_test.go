package protocol

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/util"

	"github.com/HugoSmits86/nativewebp"
)

func encodeAnimatedGIFForTest(t *testing.T) []byte {
	t.Helper()
	palette := color.Palette{
		color.RGBA{R: 0, G: 0, B: 0, A: 255},
		color.RGBA{R: 255, G: 0, B: 0, A: 255},
		color.RGBA{R: 0, G: 0, B: 255, A: 255},
	}
	frame1 := image.NewPaletted(image.Rect(0, 0, 4, 4), palette)
	frame1.SetColorIndex(0, 0, 1)
	frame2 := image.NewPaletted(image.Rect(0, 0, 4, 4), palette)
	frame2.SetColorIndex(1, 1, 2)

	var buf bytes.Buffer
	err := gif.EncodeAll(&buf, &gif.GIF{
		Image: []*image.Paletted{frame1, frame2},
		Delay: []int{8, 8},
	})
	if err != nil {
		t.Fatalf("gif.EncodeAll() error = %v", err)
	}
	return buf.Bytes()
}

func TestFormatImageResultPreservesAnimatedGIFBytes(t *testing.T) {
	config := testProtocolImageConfig{root: t.TempDir()}
	engine := &Engine{Config: config}
	rawGIF := encodeAnimatedGIFForTest(t)

	result, err := engine.FormatImageResultWithOptions(
		[]map[string]any{{"b64_json": base64.StdEncoding.EncodeToString(rawGIF)}},
		"animate cat",
		"b64_json",
		"https://example.test",
		"owner-1",
		"Alice",
		123,
		"",
		ImageOutputOptions{Format: "gif"},
	)
	if err != nil {
		t.Fatalf("FormatImageResultWithOptions() error = %v", err)
	}
	items, _ := result["data"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("data = %#v", result["data"])
	}
	if items[0]["output_format"] != "gif" {
		t.Fatalf("output_format = %#v, want gif", items[0]["output_format"])
	}
	imageURL, _ := items[0]["url"].(string)
	if !strings.HasSuffix(imageURL, ".gif") {
		t.Fatalf("image url = %q, want .gif suffix", imageURL)
	}
	b64, _ := items[0]["b64_json"].(string)
	storedBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		t.Fatalf("DecodeString() error = %v", err)
	}
	if !bytes.Equal(storedBytes, rawGIF) {
		t.Fatal("animated GIF bytes were mutated instead of preserved")
	}
	decodedGIF, err := gif.DecodeAll(bytes.NewReader(storedBytes))
	if err != nil {
		t.Fatalf("gif.DecodeAll() error = %v", err)
	}
	if len(decodedGIF.Image) != 2 {
		t.Fatalf("decoded frame count = %d, want 2", len(decodedGIF.Image))
	}
	rel := strings.TrimPrefix(imageURL, "https://example.test/images/")
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))); err != nil {
		t.Fatalf("stored gif missing: %v", err)
	}
}

func TestBuildImagePromptWithOptionsIncludesGIFAndFrameHints(t *testing.T) {
	gotGIF := BuildImagePromptWithOptions("dancing cat", "1:1", "high", "gif", "16", "80")
	for _, want := range []string{"生成格式为 gif。", "frame_count: 16", "frame_duration_ms: 80"} {
		if !strings.Contains(gotGIF, want) {
			t.Fatalf("BuildImagePromptWithOptions(gif) = %q, missing %q", gotGIF, want)
		}
	}
	gotPNG := BuildImagePromptWithOptions("static cat", "1:1", "high", "png", "", "")
	if strings.Contains(gotPNG, "生成格式为") {
		t.Fatalf("BuildImagePromptWithOptions(png) unexpectedly contained format hint: %q", gotPNG)
	}
}

func TestHandleImageGenerationsValidatesGIFConstraints(t *testing.T) {
	engine := &Engine{}
	if _, _, err := engine.HandleImageGenerations(context.Background(), map[string]any{
		"prompt":        "dancing cat",
		"model":         util.ImageModelGPT26Flare,
		"output_format": "gif",
		"stream":        true,
	}); err == nil || !strings.Contains(err.Error(), "stream=true") {
		t.Fatalf("expected stream=true GIF rejection, got %v", err)
	}

	if _, _, err := engine.HandleImageGenerations(context.Background(), map[string]any{
		"prompt":        "dancing cat",
		"model":         util.ImageModelGPT25Flare,
		"output_format": "gif",
	}); err == nil || !strings.Contains(err.Error(), "GIF output is not enabled") {
		t.Fatalf("expected non-2.6 GIF rejection, got %v", err)
	}
}

func encodeStaticPNGForTest(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 3, 3))
	img.Set(1, 1, color.RGBA{R: 255, G: 64, B: 16, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	return buf.Bytes()
}

func encodeStaticWebPForTest(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 3, 3))
	img.Set(0, 0, color.RGBA{R: 20, G: 180, B: 90, A: 255})
	var buf bytes.Buffer
	if err := nativewebp.Encode(&buf, img, nil); err != nil {
		t.Fatalf("nativewebp.Encode() error = %v", err)
	}
	return buf.Bytes()
}

func TestEncodeImageBytesAndFormatImageResultFormatTransitions(t *testing.T) {
	config := testProtocolImageConfig{root: t.TempDir()}
	engine := &Engine{Config: config}
	rawGIF := encodeAnimatedGIFForTest(t)
	rawPNG := encodeStaticPNGForTest(t)
	rawWebP := encodeStaticWebPForTest(t)

	// 1) Static PNG -> valid GIF89a when output_format="gif"
	gifFromPNG, err := encodeImageBytes(rawPNG, ImageOutputOptions{Format: "gif"})
	if err != nil {
		t.Fatalf("encodeImageBytes(PNG -> gif) error = %v", err)
	}
	if !isGIFBytes(gifFromPNG) || !bytes.HasPrefix(gifFromPNG, []byte("GIF89a")) {
		t.Fatalf("expected GIF89a header from static PNG, got prefix %q", gifFromPNG[:min(len(gifFromPNG), 8)])
	}
	if _, err := gif.Decode(bytes.NewReader(gifFromPNG)); err != nil {
		t.Fatalf("gif.Decode(gifFromPNG) error = %v", err)
	}

	// 2) Omitted output_format ("") + GIF89a -> preserved verbatim & saved as .gif with output_format="gif"
	omittedGIFRes, err := engine.FormatImageResultWithOptions(
		[]map[string]any{{"b64_json": base64.StdEncoding.EncodeToString(rawGIF)}},
		"生成动图",
		"b64_json",
		"https://example.test",
		"owner-gif",
		"Alice",
		100,
		"",
		ImageOutputOptions{},
	)
	if err != nil {
		t.Fatalf("FormatImageResultWithOptions(omitted + GIF) error = %v", err)
	}
	omittedItems, _ := omittedGIFRes["data"].([]map[string]any)
	if len(omittedItems) != 1 || omittedItems[0]["output_format"] != "gif" {
		t.Fatalf("omitted + GIF item = %#v, want output_format=gif", omittedItems)
	}
	if urlVal, _ := omittedItems[0]["url"].(string); !strings.HasSuffix(urlVal, ".gif") {
		t.Fatalf("omitted + GIF url = %q, want .gif suffix", urlVal)
	}
	decodedOmittedGIF, _ := base64.StdEncoding.DecodeString(util.Clean(omittedItems[0]["b64_json"]))
	if !bytes.Equal(decodedOmittedGIF, rawGIF) {
		t.Fatal("omitted output_format mutated animated GIF bytes")
	}

	// 3) Explicit output_format="png" + GIF89a and WebP -> real PNG bytes
	for name, src := range map[string][]byte{"gif": rawGIF, "webp": rawWebP} {
		pngBytes, err := encodeImageBytes(src, ImageOutputOptions{Format: "png"})
		if err != nil {
			t.Fatalf("encodeImageBytes(%s -> png) error = %v", name, err)
		}
		if !isPNGBytes(pngBytes) {
			t.Fatalf("encodeImageBytes(%s -> png) did not produce PNG header", name)
		}
		if _, err := png.Decode(bytes.NewReader(pngBytes)); err != nil {
			t.Fatalf("png.Decode(%s -> png) error = %v", name, err)
		}
	}

	// 4) Invalid image bytes are not silently swallowed when all items fail
	if _, err := engine.FormatImageResultWithOptions(
		[]map[string]any{{"b64_json": base64.StdEncoding.EncodeToString([]byte("not-an-image"))}},
		"broken",
		"url",
		"https://example.test",
		"owner-1",
		"Alice",
		100,
		"",
		ImageOutputOptions{Format: "gif"},
	); err == nil {
		t.Fatal("expected FormatImageResultWithOptions to return error when all items fail encoding")
	}
}

func TestChatMarkdownAndResponsesOutputPreserveGIFFormat(t *testing.T) {
	md := BuildChatImageMarkdownContent(map[string]any{
		"data": []map[string]any{
			{"b64_json": "R0lGODlh", "output_format": "gif"},
		},
	})
	if !strings.Contains(md, "data:image/gif;base64,R0lGODlh") {
		t.Fatalf("BuildChatImageMarkdownContent() = %q, want data:image/gif;base64", md)
	}
	outputs := ImageOutputItems("cat", []map[string]any{
		{"b64_json": "R0lGODlh", "url": "https://example.test/images/a.gif", "revised_prompt": "cat", "output_format": "gif"},
	}, "ig_test")
	if len(outputs) != 1 || outputs[0]["output_format"] != "gif" {
		t.Fatalf("ImageOutputItems() = %#v, want output_format=gif", outputs)
	}
}
