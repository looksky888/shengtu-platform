package httpapi

import (
	"testing"

	"chatgpt2api/internal/protocol"
)

func TestNormalizeTaskImagesFromTypedSlice(t *testing.T) {
	in := []protocol.UploadedImage{{Data: []byte("png"), Filename: "a.png", ContentType: "image/png"}}
	got := normalizeTaskImages(in)
	if len(got) != 1 || string(got[0].Data) != "png" {
		t.Fatalf("typed slice = %#v", got)
	}
}

func TestNormalizeTaskImagesFromDataURLStrings(t *testing.T) {
	// "cG5n" is base64 for "png"
	raw := []any{"data:image/png;base64,cG5n"}
	got := normalizeTaskImages(raw)
	if len(got) != 1 || string(got[0].Data) != "png" {
		t.Fatalf("data url list = %#v", got)
	}
}

func TestNormalizeTaskImagesEmpty(t *testing.T) {
	if got := normalizeTaskImages(nil); len(got) != 0 {
		t.Fatalf("nil = %#v", got)
	}
	if got := normalizeTaskImages([]any{}); len(got) != 0 {
		t.Fatalf("empty = %#v", got)
	}
}
