package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
)

func tinyValidPNGBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestSecurityPreventOwnershipHijackSigningOracleAndMarkdownFalseBilling(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	victim, _, err := app.auth.CreateAPIKey(service.AuthRoleUser, "victim-user", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	attacker, _, err := app.auth.CreateAPIKey(service.AuthRoleUser, "attacker-user", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := app.credits.Add(attacker.ID, 50, "test", "seed-attacker"); err != nil {
		t.Fatal(err)
	}

	// Store a private image owned by victim with a double-dot filename to also test signing path rules.
	victimRel := "2026/11/15/v1..2.png"
	victimDiskPath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(victimRel))
	if err := os.MkdirAll(filepath.Dir(victimDiskPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(victimDiskPath, tinyValidPNGBytes(t), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.images.RecordGeneratedImages([]string{victimRel}, victim.ID, victim.Name, service.ImageVisibilityPrivate); err != nil {
		t.Fatalf("RecordGeneratedImages(victim): %v", err)
	}
	victimURL := "https://example.test/images/" + victimRel
	victimIdentity := service.Identity{ID: victim.ID, Role: service.AuthRoleUser, Name: victim.Name}
	attackerIdentity := service.Identity{ID: attacker.ID, Role: service.AuthRoleUser, Name: attacker.Name}

	// 1. Direct RecordGeneratedImages / RecordImageOwners by another user must refuse to overwrite owner/visibility.
	_ = app.images.RecordGeneratedImages([]string{victimRel}, attacker.ID, attacker.Name, service.ImageVisibilityPublic)
	_ = app.images.RecordImageOwners([]string{victimRel}, attacker.ID)
	if _, resolveErr := app.images.ImageFileAccess(victimRel, service.ImageAccessScope{OwnerID: attacker.ID}); resolveErr == nil {
		t.Fatal("attacker gained access to victim private image via RecordGeneratedImages/RecordImageOwners")
	}

	// 2. Billed image-chat response where assistant refuses and echoes victim's private URL + third-party CDN URL:
	//    - MUST refund 100% of attacker's credits (delivered == 0 -> 502)
	//    - MUST NOT hijack ownership of victim's image
	//    - MUST NOT sign victim's URL for attacker or corrupt third-party CDN URLs containing "/images/".
	charge, err := app.deductImageCredits(
		attackerIdentity,
		map[string]any{"model": "gpt-image-2", "n": 1, "client_task_id": "echo-refusal-1"},
		service.CreditReasonImageGeneration,
		"/v1/chat/completions",
	)
	if err != nil {
		t.Fatal(err)
	}
	reqEcho, _ := withGeneratedImageTracker(httptest.NewRequest(http.MethodPost, "https://example.test/v1/chat/completions", nil))
	resEcho := httptest.NewRecorder()
	echoPayload := map[string]any{
		"id":     "chatcmpl-echo",
		"object": "chat.completion",
		"choices": []map[string]any{{
			"index": 0,
			"message": map[string]any{
				"role":    "assistant",
				"content": "Sorry, I cannot edit ![victim](" + victimURL + ") or ![cdn](https://cdn.vendor.com/v1/images/out.png).",
			},
		}},
	}
	app.writeProtocol(resEcho, reqEcho, echoPayload, nil, nil, "openai", "/v1/chat/completions", "gpt-image-2", attackerIdentity, "文生图", service.ImageVisibilityPrivate, charge)
	if resEcho.Code != http.StatusBadGateway {
		t.Fatalf("echo refusal status = %d body = %s, want 502 with full credit refund", resEcho.Code, resEcho.Body.String())
	}
	acctAfter, _ := app.credits.Account(attacker.ID)
	if acctAfter.Balance != 50 {
		t.Fatalf("attacker balance after echoed markdown refusal = %d, want full refund to 50", acctAfter.Balance)
	}
	if _, resolveErr := app.images.ImageFileAccess(victimRel, service.ImageAccessScope{OwnerID: attacker.ID}); resolveErr == nil {
		t.Fatal("victim image ownership hijacked via assistant markdown echo")
	}

	// 3. Pure text chat (charge == nil) echoing victim URL + CDN URL:
	//    - Victim URL must NOT be signed for attacker
	//    - Third-party CDN URL with /v1/images/out.png must NOT be rewritten or signed
	reqText, _ := withGeneratedImageTracker(httptest.NewRequest(http.MethodPost, "https://example.test/v1/chat/completions", nil))
	resText := httptest.NewRecorder()
	textPayload := map[string]any{
		"id":     "chatcmpl-text",
		"object": "chat.completion",
		"choices": []map[string]any{{
			"index": 0,
			"message": map[string]any{
				"role":    "assistant",
				"content": "Echo ![v](" + victimURL + ") and ![cdn](https://cdn.vendor.com/v1/images/out.png)",
			},
		}},
	}
	app.writeProtocol(resText, reqText, textPayload, nil, nil, "openai", "/v1/chat/completions", "gpt-5", attackerIdentity, "文本生成", service.ImageVisibilityPrivate, nil)
	if resText.Code != http.StatusOK {
		t.Fatalf("text chat status = %d", resText.Code)
	}
	bodyStr := resText.Body.String()
	if strings.Contains(bodyStr, "sig=") {
		t.Fatalf("unauthorized echoed URL or CDN URL was signed: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, "https://cdn.vendor.com/v1/images/out.png") {
		t.Fatalf("third-party CDN URL was corrupted: %s", bodyStr)
	}

	// 4. Victim CAN sign their own double-dot filename (v1..2.png), and delivery verifies it.
	signedForVictim := app.signManagedImageURLWithAuth(victimURL, defaultSignedImageURLTTL, imageSigningAuth{
		identity:    victimIdentity,
		hasIdentity: true,
		requestHost: "example.test",
	})
	parsedSigned, err := url.Parse(signedForVictim)
	if err != nil || parsedSigned.Query().Get("sig") == "" {
		t.Fatalf("expected victim's v1..2.png URL to be signed, got %q (err=%v)", signedForVictim, err)
	}
	deliveryReq := httptest.NewRequest(http.MethodGet, signedForVictim, nil)
	if !app.verifySignedImageRequest(deliveryReq, victimRel) {
		t.Fatalf("verifySignedImageRequest failed for valid signed v1..2.png URL %q", signedForVictim)
	}
}

func TestSize2048PricingGrokEditValidationResponsesToolBillingAndSignedGalleryURLs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, apiKeySecret, err := app.auth.CreateAPIKey(service.AuthRoleUser, "api-sdk-user", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := app.credits.Add(user.ID, 100, "test", "seed"); err != nil {
		t.Fatal(err)
	}
	identity := service.Identity{ID: user.ID, Kind: service.AuthKindAPIKey, CredentialID: user.ID, Role: service.AuthRoleUser, Name: user.Name}

	// 1. "size": "2048x2048" without "image_resolution" must bill Grok at 2K credit tier (not 1K).
	cost1K := app.imageCreditBaseAmount(map[string]any{"model": "grok-imagine-1.0", "size": "1024x1024"})
	cost2K := app.imageCreditBaseAmount(map[string]any{"model": "grok-imagine-1.0", "size": "2048x2048"})
	if cost2K != app.config.GrokImageCreditCost2K() || cost2K <= cost1K {
		t.Fatalf("size=2048x2048 cost = %d (1K=%d, cfg2K=%d), want 2K tier", cost2K, cost1K, app.config.GrokImageCreditCost2K())
	}

	// 2. POST /v1/images/edits with Grok + size=2048x2048 must reject with 400 BEFORE deducting credits.
	var mpBuf bytes.Buffer
	mw := multipart.NewWriter(&mpBuf)
	_ = mw.WriteField("model", "grok-imagine-1.0")
	_ = mw.WriteField("prompt", "upscale")
	_ = mw.WriteField("size", "2048x2048")
	fw, err := mw.CreateFormFile("image", "in.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = fw.Write(tinyValidPNGBytes(t))
	_ = mw.Close()

	editReq := httptest.NewRequest(http.MethodPost, "/v1/images/edits", &mpBuf)
	editReq.Header.Set("Content-Type", mw.FormDataContentType())
	editReq.Header.Set("Authorization", "Bearer "+apiKeySecret)
	editRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(editRes, editReq)
	if editRes.Code != http.StatusBadRequest {
		t.Fatalf("POST /v1/images/edits Grok 2048x2048 status = %d body = %s, want 400", editRes.Code, editRes.Body.String())
	}
	acctAfterEdit, _ := app.credits.Account(user.ID)
	if acctAfterEdit.Balance != 100 {
		t.Fatalf("credits deducted on rejected Grok 2K edit: got %d, want 100", acctAfterEdit.Balance)
	}

	// 3. protocol.ImageOutputItems must preserve URL format when b64_json is empty, and signProtocolResultImageURLsForRequest signs image_generation_call.result!
	items := protocol.ImageOutputItems("draw a cat", []map[string]any{{"url": "http://example.com/images/2026/11/15/resp.png"}}, "rsp_1")
	if len(items) != 1 || items[0]["result"] != "http://example.com/images/2026/11/15/resp.png" {
		t.Fatalf("ImageOutputItems(url) = %#v, want preserved URL result", items)
	}
	respReq, tracker := withGeneratedImageTracker(httptest.NewRequest(http.MethodPost, "http://example.com/v1/responses", nil))
	tracker.AddLocalImageURL("http://example.com/images/2026/11/15/resp.png")
	respPayload := map[string]any{"output": items}
	app.signProtocolResultImageURLsForRequest(respReq, identity, respPayload)
	signedOutput := respPayload["output"].([]map[string]any)[0]["result"].(string)
	if !strings.Contains(signedOutput, "sig=") {
		t.Fatalf("expected image_generation_call.result URL to be signed, got %q", signedOutput)
	}

	// 4. /v1/responses with chat model "gpt-5" + image_generation tool (no tool.model) must price at defaultImageModel (5 credits), not 1 credit!
	//    Set balance to 4 credits so a 5-credit deduction returns 402 Insufficient Credits (proving it tried to bill 5, not 1!).
	_, _, _ = app.credits.Deduct(user.ID, 96, "test", "drain-to-4")
	respBody := `{"model":"gpt-5","input":"draw a cat","tools":[{"type":"image_generation"}]}`
	rReq := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(respBody))
	rReq.Header.Set("Content-Type", "application/json")
	rReq.Header.Set("Authorization", "Bearer "+apiKeySecret)
	rRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(rRes, rReq)
	if rRes.Code != http.StatusPaymentRequired {
		t.Fatalf("/v1/responses gpt-5 + image_generation with 4 credits returned %d (%s), want 402 (5 credits required)", rRes.Code, rRes.Body.String())
	}

	// 5. GET /api/images returns signed url & thumbnail_url (valid against verifyImageDeliverySignature for sourceRel).
	storedURL, err := app.engine.SaveImageBytesForOwnerWithFormatContext(context.Background(), tinyValidPNGBytes(t), "http://example.com", user.ID, user.Name, "png")
	if err != nil {
		t.Fatal(err)
	}
	if err := app.images.RecordGeneratedImages([]string{storedURL}, user.ID, user.Name, service.ImageVisibilityPrivate); err != nil {
		t.Fatal(err)
	}

	imgReq := httptest.NewRequest(http.MethodGet, "http://example.com/api/images", nil)
	imgReq.Header.Set("Authorization", "Bearer "+apiKeySecret)
	imgRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(imgRes, imgReq)
	if imgRes.Code != http.StatusOK {
		t.Fatalf("GET /api/images status = %d body = %s", imgRes.Code, imgRes.Body.String())
	}
	var listResp service.ImageListResponse
	if err := json.Unmarshal(imgRes.Body.Bytes(), &listResp); err != nil || len(listResp.Items) != 1 {
		t.Fatalf("GET /api/images items = %+v err = %v", listResp, err)
	}
	gotItem := listResp.Items[0]
	if !strings.Contains(gotItem.URL, "sig=") || !strings.Contains(gotItem.ThumbnailURL, "sig=") || !strings.Contains(gotItem.ThumbnailURL, "v=") {
		t.Fatalf("expected signed url and thumbnail_url (preserving v=), got url=%q thumb=%q", gotItem.URL, gotItem.ThumbnailURL)
	}
	thumbFetchReq := httptest.NewRequest(http.MethodGet, gotItem.ThumbnailURL, nil)
	if !app.verifySignedImageRequest(thumbFetchReq, gotItem.Path) {
		t.Fatalf("thumbnail signature did not verify against sourceRel %q: %s", gotItem.Path, gotItem.ThumbnailURL)
	}
}
