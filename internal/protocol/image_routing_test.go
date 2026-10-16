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

func TestApplyPictureModelRoutingForcesImages25Auto(t *testing.T) {
	engine := &Engine{Config: imageRoutingConfigStub{fallbackEnabled: true, fallbackModels: []string{"gpt-5-3"}}}
	request := &ConversationRequest{Model: util.ImageModelGPT25Flare}
	engine.applyPictureModelRouting(request)
	if request.UpstreamModel != util.ImageModelAuto {
		t.Fatalf("UpstreamModel = %q, want %q", request.UpstreamModel, util.ImageModelAuto)
	}
	if len(request.FallbackModels) != 0 {
		t.Fatalf("FallbackModels = %#v, want no model switching for Images 2.5", request.FallbackModels)
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
