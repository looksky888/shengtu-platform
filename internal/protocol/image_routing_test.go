package protocol

import (
	"testing"

	"chatgpt2api/internal/util"
)

type imageRoutingConfigStub struct {
	fallbackEnabled bool
	fallbackModels  []string
}

func (imageRoutingConfigStub) ImagesDir() string              { return "" }
func (imageRoutingConfigStub) ImageMetadataDir() string       { return "" }
func (imageRoutingConfigStub) BaseURL() string                { return "" }
func (imageRoutingConfigStub) CleanupOldImages() int          { return 0 }
func (imageRoutingConfigStub) ImageDefaultModel() string      { return util.ImageModelGPT25Flare }
func (imageRoutingConfigStub) ImageInternalModelSlug() string { return "gpt-5-5-thinking" }
func (s imageRoutingConfigStub) ImageFallbackModelEnabled() bool {
	return s.fallbackEnabled
}
func (s imageRoutingConfigStub) ImageFallbackModelSlugs() []string {
	return append([]string(nil), s.fallbackModels...)
}

func TestApplyPictureModelRoutingPreservesImages25Slug(t *testing.T) {
	engine := &Engine{Config: imageRoutingConfigStub{fallbackEnabled: true, fallbackModels: []string{"gpt-5-3"}}}
	for _, tc := range []struct {
		requested string
		want      string
	}{
		{requested: util.ImageModelGPT25, want: util.ImageModelGPT25Flare},
		{requested: util.ImageModelGPT25Flare, want: util.ImageModelGPT25Flare},
		{requested: util.ImageModelGPT25Sunburst, want: util.ImageModelGPT25Sunburst},
	} {
		t.Run(tc.requested, func(t *testing.T) {
			request := &ConversationRequest{Model: tc.requested}
			engine.applyPictureModelRouting(request)
			if request.UpstreamModel != tc.want {
				t.Fatalf("UpstreamModel = %q, want %q", request.UpstreamModel, tc.want)
			}
			if len(request.FallbackModels) != 0 {
				t.Fatalf("FallbackModels = %#v, want no model switching for Images 2.5", request.FallbackModels)
			}
		})
	}
}

func TestApplyPictureModelRoutingKeepsLegacyConfigForGPTImage2(t *testing.T) {
	engine := &Engine{Config: imageRoutingConfigStub{fallbackEnabled: true, fallbackModels: []string{"auto"}}}
	request := &ConversationRequest{Model: util.ImageModelGPT}
	engine.applyPictureModelRouting(request)
	if request.UpstreamModel != "gpt-5-5-thinking" {
		t.Fatalf("UpstreamModel = %q, want configured legacy route", request.UpstreamModel)
	}
}
