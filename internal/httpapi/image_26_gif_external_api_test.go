package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func encodeTestAnimatedGIF(t *testing.T) []byte {
	t.Helper()
	palette := color.Palette{
		color.RGBA{R: 0, G: 0, B: 0, A: 255},
		color.RGBA{R: 255, G: 80, B: 20, A: 255},
		color.RGBA{R: 20, G: 160, B: 255, A: 255},
	}
	f1 := image.NewPaletted(image.Rect(0, 0, 4, 4), palette)
	f1.SetColorIndex(0, 0, 1)
	f2 := image.NewPaletted(image.Rect(0, 0, 4, 4), palette)
	f2.SetColorIndex(1, 1, 2)
	var out bytes.Buffer
	if err := gif.EncodeAll(&out, &gif.GIF{Image: []*image.Paletted{f1, f2}, Delay: []int{8, 8}}); err != nil {
		t.Fatalf("gif.EncodeAll() error = %v", err)
	}
	return out.Bytes()
}

func encodeTestStaticPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(2, 2, color.RGBA{R: 12, G: 200, B: 88, A: 255})
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	return out.Bytes()
}

// Verification 4: Multipart readMultipartImageBody reads frame_count and frame_duration_ms.
func TestReadMultipartImageBodyExtractsFrameCountAndDuration(t *testing.T) {
	var bodyBuf bytes.Buffer
	mw := multipart.NewWriter(&bodyBuf)
	_ = mw.WriteField("prompt", "animate this cat")
	_ = mw.WriteField("model", util.ImageModelGPT26Flare)
	_ = mw.WriteField("output_format", "gif")
	_ = mw.WriteField("frame_count", "16")
	_ = mw.WriteField("frame_duration_ms", "90")
	fw, err := mw.CreateFormFile("image", "cat.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = fw.Write(encodeTestStaticPNG(t))
	_ = mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/v1/images/edits", &bodyBuf)
	req.Header.Set("Content-Type", mw.FormDataContentType())

	body, images, err := readMultipartImageBody(httptest.NewRecorder(), req)
	if err != nil {
		t.Fatalf("readMultipartImageBody() error = %v", err)
	}
	if len(images) != 1 {
		t.Fatalf("len(images) = %d, want 1", len(images))
	}
	if got := util.Clean(body["frame_count"]); got != "16" {
		t.Fatalf("frame_count = %q, want 16", got)
	}
	if got := util.Clean(body["frame_duration_ms"]); got != "90" {
		t.Fatalf("frame_duration_ms = %q, want 90", got)
	}
	if got := util.Clean(body["output_format"]); got != "gif" {
		t.Fatalf("output_format = %q, want gif", got)
	}
}

// Verification 5 & 7:
// - /v1/images/generations omitting model or passing "model":"auto" charges 5 credits (gpt-image-2.6-flare),
//   enforces channel disable check, and allows "output_format":"gif".
// - /v1/images/generations with "response_format":"url" returns a signed /images/...?exp=...&sig=... URL
//   that returns 200 OK on unauthenticated GET while un-signed GET returns 401.
// - Proxy static PNG download when output_format="gif" transcodes to valid GIF89a bytes.
func TestExternalImageGenerationsAutoBillingGIFAndSignedImageURLs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rawGIF := encodeTestAnimatedGIF(t)
	rawPNG := encodeTestStaticPNG(t)

	// Verify local-account-pool metadata & disable check on omitted/"auto" model first.
	for _, rawModel := range []string{"", util.ImageModelAuto} {
		reqMap := map[string]any{"prompt": "dancing cat", "output_format": "gif"}
		if rawModel != "" {
			reqMap["model"] = rawModel
		}
		resolvedModel := app.resolveImageRequestModel(rawModel)
		if resolvedModel != util.ImageModelGPT26Flare {
			t.Fatalf("resolveImageRequestModel(%q) = %q, want %s", rawModel, resolvedModel, util.ImageModelGPT26Flare)
		}
		meta, err := app.imageTaskRequestMetadata(reqMap, resolvedModel, service.ImageCapabilityGenerate)
		if err != nil {
			t.Fatalf("imageTaskRequestMetadata(%q + gif) unexpected error: %v", rawModel, err)
		}
		if got := util.ToInt(meta["image_credit_cost"], 0); got != 5 {
			t.Fatalf("imageTaskRequestMetadata(%q) credit_cost = %d, want 5", rawModel, got)
		}
	}

	user, apiKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "ext-client", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if _, _, err := app.credits.Add(user.ID, 25, "test", "seed"); err != nil {
		t.Fatalf("credits.Add() error = %v", err)
	}

	// Disable built-in local-gpt-image-2-6-flare and confirm omitted/"auto" model respects the disable check!
	if _, err := app.imageChannels.UpdateModel("local-account-pool", "local-gpt-image-2-6-flare", service.ImageChannelModelInput{
		DisplayName:   util.ImageModelGPT26Flare,
		UpstreamModel: util.ImageModelGPT26Flare,
		Capabilities:  []string{service.ImageCapabilityGenerate, service.ImageCapabilityEdit},
		Resolutions:   []string{"1k"},
		Formats:       []string{"png", "jpeg", "webp", "gif"},
		CreditCost:    5,
		Enabled:       false,
		Sort:          10,
	}); err != nil {
		t.Fatalf("disable 2.6-flare error = %v", err)
	}
	disabledReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"cat","model":"auto"}`))
	disabledReq.Header.Set("Authorization", "Bearer "+apiKey)
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(disabledRes, disabledReq)
	if disabledRes.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when default 2.6-flare model is disabled, got %d body=%s", disabledRes.Code, disabledRes.Body.String())
	}

	// Add an enabled relay channel serving gpt-image-2.6-flare (5 credits, DownloadURLs=true, GIF enabled)
	// so end-to-end /v1/images/generations runs locally without touching external networks.
	serveStaticPNG := false
	var relayServer *httptest.Server
	relayServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/images/generations":
			assetPath := "/asset.gif"
			if serveStaticPNG {
				assetPath = "/asset.png"
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"created": 1731000000,
				"data":    []map[string]any{{"url": relayServer.URL + assetPath}},
			})
		case "/asset.gif":
			w.Header().Set("Content-Type", "image/gif")
			_, _ = w.Write(rawGIF)
		case "/asset.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(rawPNG)
		default:
			http.NotFound(w, r)
		}
	}))
	defer relayServer.Close()

	relayCh, err := app.imageChannels.CreateChannel(service.ImageChannelInput{
		Name:           "2.6 Relay",
		Type:           service.ImageChannelTypeOpenAICompatible,
		BaseURL:        relayServer.URL,
		APIKey:         "sk-relay-26",
		TimeoutSeconds: 30,
		MaxConcurrency: 4,
		DownloadURLs:   true,
		Enabled:        true,
		Sort:           20,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	if _, err := app.imageChannels.CreateModel(relayCh.ID, service.ImageChannelModelInput{
		DisplayName:   "2.6 Flare Relay",
		UpstreamModel: util.ImageModelGPT26Flare,
		Capabilities:  []string{service.ImageCapabilityGenerate},
		Resolutions:   []string{"1k"},
		Formats:       []string{"png", "jpeg", "webp", "gif"},
		CreditCost:    5,
		Enabled:       true,
		Sort:          10,
	}); err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}

	// 1) Omitted model + output_format="gif" + response_format="url" -> charges 5 credits (25 -> 20) & returns signed URL
	genReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"dancing cat","output_format":"gif","response_format":"url"}`))
	genReq.Header.Set("Authorization", "Bearer "+apiKey)
	genReq.Header.Set("Content-Type", "application/json")
	genRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(genRes, genReq)
	if genRes.Code != http.StatusOK {
		t.Fatalf("POST /v1/images/generations (omitted model) status = %d body = %s", genRes.Code, genRes.Body.String())
	}
	acctAfterFirst, err := app.credits.Account(user.ID)
	if err != nil || acctAfterFirst.Balance != 20 {
		t.Fatalf("balance after omitted model = %d (err=%v), want 20 (5 credits charged)", acctAfterFirst.Balance, err)
	}

	var genPayload map[string]any
	if err := json.Unmarshal(genRes.Body.Bytes(), &genPayload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	items := util.AsMapSlice(genPayload["data"])
	if len(items) != 1 {
		t.Fatalf("data = %#v, want 1 item", genPayload["data"])
	}
	signedURLStr := util.Clean(items[0]["url"])
	parsedSigned, err := url.Parse(signedURLStr)
	if err != nil {
		t.Fatalf("url.Parse(%q) error = %v", signedURLStr, err)
	}
	if parsedSigned.Query().Get("exp") == "" || parsedSigned.Query().Get("sig") == "" {
		t.Fatalf("returned url = %q, expected signed query params exp & sig", signedURLStr)
	}
	if !strings.HasSuffix(parsedSigned.Path, ".gif") {
		t.Fatalf("returned url path = %q, want .gif suffix", parsedSigned.Path)
	}

	// Unauthenticated GET with valid ?exp=...&sig=... MUST return 200 OK with animated GIF bytes!
	openSignedReq := httptest.NewRequest(http.MethodGet, parsedSigned.RequestURI(), nil)
	openSignedRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(openSignedRes, openSignedReq)
	if openSignedRes.Code != http.StatusOK {
		t.Fatalf("unauthenticated GET signed URL status = %d body = %s, want 200", openSignedRes.Code, openSignedRes.Body.String())
	}
	if !bytes.Equal(openSignedRes.Body.Bytes(), rawGIF) {
		t.Fatal("signed URL did not return verbatim animated GIF bytes")
	}

	// Unauthenticated GET on un-signed /images/<rel> MUST still return 401!
	openUnsignedReq := httptest.NewRequest(http.MethodGet, parsedSigned.Path, nil)
	openUnsignedRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(openUnsignedRes, openUnsignedReq)
	if openUnsignedRes.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated GET unsigned URL status = %d, want 401", openUnsignedRes.Code)
	}

	// Unauthenticated GET with tampered signature MUST return 401!
	openTamperedReq := httptest.NewRequest(http.MethodGet, parsedSigned.Path+"?exp="+parsedSigned.Query().Get("exp")+"&sig="+strings.Repeat("0", 64), nil)
	openTamperedRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(openTamperedRes, openTamperedReq)
	if openTamperedRes.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated GET tampered sig status = %d, want 401", openTamperedRes.Code)
	}

	// 2) Explicit "model":"auto" + upstream returns static PNG while output_format="gif" ->
	//    charges 5 credits (20 -> 15) and transcodes downloaded file to valid GIF89a!
	serveStaticPNG = true
	autoReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"model":"auto","prompt":"static fallback","output_format":"gif","response_format":"url"}`))
	autoReq.Header.Set("Authorization", "Bearer "+apiKey)
	autoReq.Header.Set("Content-Type", "application/json")
	autoRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(autoRes, autoReq)
	if autoRes.Code != http.StatusOK {
		t.Fatalf("POST /v1/images/generations (model=auto) status = %d body = %s", autoRes.Code, autoRes.Body.String())
	}
	acctAfterSecond, err := app.credits.Account(user.ID)
	if err != nil || acctAfterSecond.Balance != 15 {
		t.Fatalf("balance after model=auto = %d (err=%v), want 15 (5 credits charged)", acctAfterSecond.Balance, err)
	}
	var autoPayload map[string]any
	_ = json.Unmarshal(autoRes.Body.Bytes(), &autoPayload)
	autoItems := util.AsMapSlice(autoPayload["data"])
	autoURL, _ := url.Parse(util.Clean(autoItems[0]["url"]))
	rel := strings.TrimPrefix(autoURL.Path, "/images/")
	storedTranscoded, err := os.ReadFile(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("ReadFile(transcoded gif) error = %v", err)
	}
	if !bytes.HasPrefix(storedTranscoded, []byte("GIF89a")) {
		t.Fatalf("expected downloaded static PNG to be transcoded to GIF89a, got prefix %q", storedTranscoded[:min(len(storedTranscoded), 8)])
	}
	if _, err := gif.Decode(bytes.NewReader(storedTranscoded)); err != nil {
		t.Fatalf("gif.Decode(storedTranscoded) error = %v", err)
	}

	// Verify /v1/responses rejects stream=true with output_format="gif" on model="auto"
	respStreamReq := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{"model":"auto","input":"draw cat","stream":true,"tools":[{"type":"image_generation","output_format":"gif"}]}`))
	respStreamReq.Header.Set("Authorization", "Bearer "+apiKey)
	respStreamReq.Header.Set("Content-Type", "application/json")
	respStreamRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(respStreamRes, respStreamReq)
	if respStreamRes.Code != http.StatusBadRequest {
		t.Fatalf("POST /v1/responses stream=true + gif status = %d body = %s, want 400", respStreamRes.Code, respStreamRes.Body.String())
	}
}

// Verification 6:
// - GET /v1/models succeeds with 200 OK even when upstream anon models endpoint fails,
//   returns gpt-image-2.6* + custom relay channel models even with 0 local ChatGPT accounts,
//   and excludes disabled system models.
// - External /v1/images/generations can invoke custom relay model by model name alone (without channel_model_id)
//   and bills that relay model's credit_cost.
func TestModelsResilienceAndCustomRelayRoutingByModelName(t *testing.T) {
	var relayServer *httptest.Server
	relayServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"created": 1731000001,
			"data":    []map[string]any{{"url": "https://cdn.relay.example/flux-1.png"}},
		})
	}))
	defer relayServer.Close()

	app := newTestApp(t)
	defer app.Close()

	// Simulate upstream public models failing with Cloudflare / network error & 0 local accounts.
	app.engine.ListModelsFunc = func(context.Context) (map[string]any, error) {
		return nil, errors.New("upstream 403 cloudflare challenge")
	}

	// Disable built-in gpt-image-2 so we can verify /v1/models excludes disabled system models.
	if _, err := app.imageChannels.UpdateModel("local-account-pool", "local-gpt-image-2", service.ImageChannelModelInput{
		DisplayName:   util.ImageModelGPT,
		UpstreamModel: util.ImageModelGPT,
		Capabilities:  []string{service.ImageCapabilityGenerate, service.ImageCapabilityEdit},
		Resolutions:   []string{"1k"},
		Formats:       []string{"png", "jpeg", "webp"},
		CreditCost:    1,
		Enabled:       false,
		Sort:          40,
	}); err != nil {
		t.Fatalf("disable gpt-image-2 error = %v", err)
	}

	// Add custom openai_compatible relay channel serving flux-pro at 7 credits.
	relayCh, err := app.imageChannels.CreateChannel(service.ImageChannelInput{
		Name:           "Flux Relay",
		Type:           service.ImageChannelTypeOpenAICompatible,
		BaseURL:        relayServer.URL,
		APIKey:         "sk-flux-relay",
		TimeoutSeconds: 30,
		MaxConcurrency: 4,
		DownloadURLs:   false,
		Enabled:        true,
		Sort:           30,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	if _, err := app.imageChannels.CreateModel(relayCh.ID, service.ImageChannelModelInput{
		DisplayName:   "Flux Pro",
		UpstreamModel: "flux-pro",
		Capabilities:  []string{service.ImageCapabilityGenerate},
		Resolutions:   []string{"1k"},
		Formats:       []string{"png", "jpeg", "webp"},
		CreditCost:    7,
		Enabled:       true,
		Sort:           10,
	}); err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}

	user, apiKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "models-client", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if _, _, err := app.credits.Add(user.ID, 30, "test", "seed"); err != nil {
		t.Fatalf("credits.Add() error = %v", err)
	}

	modelsReq := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	modelsReq.Header.Set("Authorization", "Bearer "+apiKey)
	modelsRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(modelsRes, modelsReq)
	if modelsRes.Code != http.StatusOK {
		t.Fatalf("GET /v1/models status = %d body = %s, want 200", modelsRes.Code, modelsRes.Body.String())
	}
	var modelsPayload map[string]any
	if err := json.Unmarshal(modelsRes.Body.Bytes(), &modelsPayload); err != nil {
		t.Fatalf("unmarshal /v1/models: %v", err)
	}
	if modelsPayload["object"] != "list" {
		t.Fatalf("object = %#v, want list", modelsPayload["object"])
	}
	seenIDs := map[string]int{}
	for _, item := range util.AsMapSlice(modelsPayload["data"]) {
		seenIDs[util.Clean(item["id"])]++
	}
	for _, mustHave := range []string{util.ImageModelGPT26Flare, util.ImageModelGPT26, util.ImageModelGPT26Sunburst, "flux-pro", "gpt-4o"} {
		if seenIDs[mustHave] != 1 {
			t.Fatalf("expected model %q exactly once in /v1/models, count=%d", mustHave, seenIDs[mustHave])
		}
	}
	if seenIDs[util.ImageModelGPT] != 0 {
		t.Fatalf("disabled system model %q should be excluded from /v1/models", util.ImageModelGPT)
	}

	// Invoke custom relay model by "model":"flux-pro" alone (no channel_model_id) -> routes & charges 7 credits!
	fluxReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"model":"flux-pro","prompt":"cyberpunk skyline","n":1}`))
	fluxReq.Header.Set("Authorization", "Bearer "+apiKey)
	fluxReq.Header.Set("Content-Type", "application/json")
	fluxRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(fluxRes, fluxReq)
	if fluxRes.Code != http.StatusOK {
		t.Fatalf("POST /v1/images/generations (flux-pro) status = %d body = %s, want 200", fluxRes.Code, fluxRes.Body.String())
	}
	acct, err := app.credits.Account(user.ID)
	if err != nil || acct.Balance != 23 {
		t.Fatalf("balance after flux-pro = %d (err=%v), want 23 (7 credits charged)", acct.Balance, err)
	}
}
