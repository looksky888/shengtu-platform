package service

import (
	"bytes"
	"chatgpt2api/internal/util"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	mathrand "math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var registerSentinelSOObserverDelay = 5 * time.Second

type registerSentinelTokens struct {
	Token        string
	SOToken      string
	SDK          string
	Source       string
	SODiagnostic string
	OAISCValue   string
}

func (w *registerWorker) buildSentinelToken(ctx context.Context, flow string) (string, error) {
	tokens, err := w.buildSentinelTokens(ctx, flow)
	if err != nil {
		return "", err
	}
	return tokens.Token, nil
}

func (w *registerWorker) buildSentinelTokens(ctx context.Context, flow string) (registerSentinelTokens, error) {
	if registerSentinelOfficialSDKEnabled && flow == "oauth_create_account" {
		tokens, err := w.buildSentinelTokensWithOfficialSDK(ctx, flow)
		if err == nil && tokens.Token != "" {
			w.applySentinelCookie(tokens.OAISCValue)
			return tokens, nil
		}
		if err != nil {
			w.step("Sentinel 官方 SDK 生成失败，回退兼容逻辑: " + registerSentinelShortText(err.Error(), 180))
		}
	}
	ua := firstNonEmpty(strings.TrimSpace(w.clearanceUserAgent), registerUserAgent)
	generator := newRegisterSentinelTokenGenerator(w.deviceID, ua)
	reqPayload := map[string]any{
		"p":    generator.generateRequirementsToken(),
		"id":   w.deviceID,
		"flow": flow,
	}
	body, err := registerCompactJSONBytes(reqPayload)
	if err != nil {
		return registerSentinelTokens{}, err
	}
	headers := registerSentinelHeaders()
	headers["User-Agent"] = ua
	status, payload, err := w.requestRawJSON(ctx, http.MethodPost, registerSentinelBase+"/backend-api/sentinel/req", body, headers)
	if err != nil {
		return registerSentinelTokens{}, err
	}
	challengeToken := util.Clean(payload["token"])
	if status != http.StatusOK || challengeToken == "" {
		return registerSentinelTokens{}, fmt.Errorf("sentinel_req_failed_%d", status)
	}
	proof := registerSentinelRequirementSpec(payload, "proofofwork", "proof_of_work", "pow")
	var pValue string
	if util.ToBool(proof["required"]) && util.Clean(proof["seed"]) != "" {
		pValue = generator.generateToken(util.Clean(proof["seed"]), firstNonEmpty(util.Clean(proof["difficulty"]), "0"))
	} else {
		pValue = generator.generateRequirementsToken()
	}
	tokenPayload := map[string]any{
		"p":    pValue,
		"t":    "",
		"c":    challengeToken,
		"id":   w.deviceID,
		"flow": flow,
	}
	data, err := registerCompactJSONBytes(tokenPayload)
	if err != nil {
		return registerSentinelTokens{}, err
	}
	soToken := ""
	if flow == "oauth_create_account" {
		soToken = registerSentinelSOToken(payload, generator)
		if soToken == "" && registerSentinelSOObserverDelay > 0 {
			timer := time.NewTimer(registerSentinelSOObserverDelay)
			select {
			case <-ctx.Done():
				if !timer.Stop() {
					<-timer.C
				}
				return registerSentinelTokens{}, ctx.Err()
			case <-timer.C:
			}
			soToken = registerSentinelSOToken(payload, generator)
		}
	}
	tokens := registerSentinelTokens{
		Token:        string(data),
		SOToken:      soToken,
		SDK:          registerSentinelSDK,
		Source:       "sentinel_req",
		SODiagnostic: registerSentinelSODiagnostic(payload),
		OAISCValue:   "0" + challengeToken,
	}
	w.applySentinelCookie(tokens.OAISCValue)
	return tokens, nil
}

func registerSentinelSOToken(payload map[string]any, generator *registerSentinelTokenGenerator) string {
	if value := registerSentinelDirectToken(payload, "so_token", "soToken"); value != "" {
		return value
	}
	requirements := util.StringMap(payload["requirements"])
	if value := registerSentinelDirectToken(requirements, "so_token", "soToken"); value != "" {
		return value
	}
	if value := registerSentinelScalarString(payload["so"]); value != "" {
		return value
	}
	if value := registerSentinelScalarString(requirements["so"]); value != "" {
		return value
	}
	if value := registerSentinelSolveRequirementToken(util.StringMap(payload["so"]), generator); value != "" {
		return value
	}
	return registerSentinelSolveRequirementToken(util.StringMap(requirements["so"]), generator)
}

func registerSentinelDirectToken(node map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := registerSentinelScalarString(node[key]); value != "" {
			return value
		}
	}
	for _, value := range node {
		child := util.StringMap(value)
		if len(child) == 0 {
			continue
		}
		if token := registerSentinelDirectToken(child, keys...); token != "" {
			return token
		}
	}
	return ""
}

func registerSentinelScalarString(value any) string {
	switch value.(type) {
	case map[string]any, []any, []map[string]any:
		return ""
	default:
		return util.Clean(value)
	}
}

func registerSentinelRequirementSpec(payload map[string]any, keys ...string) map[string]any {
	for _, key := range keys {
		if value := util.StringMap(payload[key]); len(value) > 0 {
			return value
		}
	}
	requirements := util.StringMap(payload["requirements"])
	for _, key := range keys {
		if value := util.StringMap(requirements[key]); len(value) > 0 {
			return value
		}
	}
	return nil
}

func registerSentinelSolveRequirementToken(spec map[string]any, generator *registerSentinelTokenGenerator) string {
	if len(spec) == 0 || generator == nil {
		return ""
	}
	for _, key := range []string{"token", "value", "result"} {
		if value := util.Clean(spec[key]); value != "" {
			return value
		}
	}
	if !util.ToBool(spec["required"]) {
		return ""
	}
	seed := util.Clean(spec["seed"])
	if seed == "" {
		return ""
	}
	return generator.generateToken(seed, firstNonEmpty(util.Clean(spec["difficulty"]), "0"))
}

func registerSentinelSODiagnostic(payload map[string]any) string {
	requirements := util.StringMap(payload["requirements"])
	spec := util.StringMap(payload["so"])
	if len(spec) == 0 {
		spec = util.StringMap(requirements["so"])
	}
	if len(spec) == 0 {
		if util.Clean(payload["so"]) != "" || util.Clean(requirements["so"]) != "" {
			return "so=string"
		}
		return "so=missing"
	}
	parts := []string{"so=object"}
	for _, key := range []string{"required", "seed", "difficulty", "collector_dx", "snapshot_dx", "token", "value", "result"} {
		if _, ok := spec[key]; ok {
			parts = append(parts, key+"=yes")
		}
	}
	return strings.Join(parts, ",")
}

func newRegisterSentinelTokenGenerator(deviceID, userAgent string) *registerSentinelTokenGenerator {
	return &registerSentinelTokenGenerator{
		deviceID:  deviceID,
		userAgent: userAgent,
		sid:       util.NewUUID(),
	}
}

func (g *registerSentinelTokenGenerator) config() []any {
	perfNow := 1000 + mathrand.Float64()*49000
	return []any{
		"1920x1080",
		time.Now().UTC().Format("Mon Jan 02 2006 15:04:05 GMT+0000 (Coordinated Universal Time)"),
		int64(4294705152),
		mathrand.Float64(),
		g.userAgent,
		registerSentinelSDK,
		nil,
		nil,
		"en-US",
		mathrand.Float64(),
		registerRandomChoice([]string{"vendorSub-undefined", "plugins-undefined", "mimeTypes-undefined", "hardwareConcurrency-undefined"}),
		registerRandomChoice([]string{"location", "implementation", "URL", "documentURI", "compatMode"}),
		registerRandomChoice([]string{"Object", "Function", "Array", "Number", "parseFloat", "undefined"}),
		perfNow,
		g.sid,
		"",
		registerRandomChoiceInt([]int{4, 8, 12, 16}),
		float64(time.Now().UnixMilli()) - perfNow,
	}
}

func (g *registerSentinelTokenGenerator) generateRequirementsToken() string {
	data := g.config()
	data[3] = 1
	data[9] = math.Round(5 + mathrand.Float64()*45)
	return "gAAAAAC" + registerBase64JSON(data)
}

func (g *registerSentinelTokenGenerator) generateToken(seed, difficulty string) string {
	start := time.Now()
	data := g.config()
	if difficulty == "" {
		difficulty = "0"
	}
	for i := 0; i < registerSentinelMaxAttempts; i++ {
		data[3] = i
		data[9] = math.Round(float64(time.Since(start).Milliseconds()))
		payload := registerBase64JSON(data)
		hash := registerFNV1A32(seed + payload)
		prefixLen := minInt(len(difficulty), len(hash))
		if hash[:prefixLen] <= difficulty[:prefixLen] {
			return "gAAAAAB" + payload + "~S"
		}
	}
	return "gAAAAAB" + registerSentinelErrorPrefix + registerBase64JSON("None")
}

func registerBase64JSON(value any) string {
	data, err := registerCompactJSONBytes(value)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

func registerCompactJSONBytes(value any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSpace(buf.Bytes()), nil
}

func registerFNV1A32(text string) string {
	hash := uint32(2166136261)
	for _, ch := range text {
		hash ^= uint32(ch)
		hash *= 16777619
	}
	hash ^= hash >> 16
	hash *= 2246822507
	hash ^= hash >> 13
	hash *= 3266489909
	hash ^= hash >> 16
	return fmt.Sprintf("%08x", hash)
}

func registerSentinelHeaders() map[string]string {
	return map[string]string{
		"Content-Type":       "text/plain;charset=UTF-8",
		"Referer":            registerSentinelBase + "/backend-api/sentinel/frame.html",
		"Origin":             registerSentinelBase,
		"User-Agent":         registerUserAgent,
		"sec-ch-ua":          registerSecCHUA,
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": `"Windows"`,
		"sec-fetch-dest":     "empty",
		"sec-fetch-mode":     "cors",
		"sec-fetch-site":     "same-origin",
	}
}

func registerTraceHeaders() map[string]string {
	traceID := util.NewHex(32)
	parentID := registerRandomUint64()
	parentHex := fmt.Sprintf("%016x", parentID)
	parentText := strconv.FormatUint(parentID, 10)
	return map[string]string{
		"traceparent":                 "00-" + traceID + "-" + parentHex + "-01",
		"tracestate":                  "dd=s:1;o:rum",
		"x-datadog-origin":            "rum",
		"x-datadog-parent-id":         parentText,
		"x-datadog-sampling-priority": "1",
		"x-datadog-trace-id":          strconv.FormatUint(registerRandomUint64(), 10),
	}
}
