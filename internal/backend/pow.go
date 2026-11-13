package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"

	"chatgpt2api/internal/util"
	"golang.org/x/crypto/sha3"
)

const defaultPOWScript = "https://chatgpt.com/backend-api/sentinel/sdk.js"

var (
	scriptSrcRE     = regexp.MustCompile(`(?is)<script[^>]+src=["']([^"']+)["']`)
	scriptBuildIDRE = regexp.MustCompile(`c/[^/]*/_`)
	htmlDataBuildRE = regexp.MustCompile(`<html[^>]*data-build=["']([^"']*)["']`)

	powCores             = []int{8, 16, 24, 32}
	powDocumentKeys      = []string{"__reactContainer$fzelfjyxej8", "_reactListening5dehydibo78", "location"}
	powScreenResolutions = [][2]int{{1920, 1080}, {1440, 900}, {2560, 1440}, {3840, 2160}}
	powNavigatorKeys     = []string{
		"registerProtocolHandler−function registerProtocolHandler() { [native code] }",
		"storage−[object StorageManager]",
		"locks−[object LockManager]",
		"appCodeName−Mozilla",
		"permissions−[object Permissions]",
		"share−function share() { [native code] }",
		"webdriver−false",
		"managed−[object NavigatorManagedData]",
		"canShare−function canShare() { [native code] }",
		"vendor−Google Inc.",
		"mediaDevices−[object MediaDevices]",
		"vibrate−function vibrate() { [native code] }",
		"storageBuckets−[object StorageBucketManager]",
		"mediaCapabilities−[object MediaCapabilities]",
		"cookieEnabled−true",
		"virtualKeyboard−[object VirtualKeyboard]",
		"product−Gecko",
		"presentation−[object Presentation]",
		"onLine−true",
		"mimeTypes−[object MimeTypeArray]",
		"credentials−[object CredentialsContainer]",
		"serviceWorker−[object ServiceWorkerContainer]",
		"keyboard−[object Keyboard]",
		"gpu−[object GPU]",
		"doNotTrack",
		"serial−[object Serial]",
		"pdfViewerEnabled−true",
		"language−zh-CN",
		"geolocation−[object Geolocation]",
		"userAgentData−[object NavigatorUAData]",
		"getUserMedia−function getUserMedia() { [native code] }",
		"sendBeacon−function sendBeacon() { [native code] }",
		"hardwareConcurrency−32",
		"windowControlsOverlay−[object WindowControlsOverlay]",
	}
	powWindowKeys = []string{
		"0", "window", "self", "document", "name", "location",
		"customElements", "history", "navigation", "innerWidth", "innerHeight",
		"scrollX", "scrollY", "visualViewport", "screenX", "screenY",
		"outerWidth", "outerHeight", "devicePixelRatio", "screen", "chrome",
		"navigator", "onresize", "performance", "crypto", "indexedDB",
		"sessionStorage", "localStorage", "scheduler", "alert", "atob",
		"btoa", "fetch", "matchMedia", "postMessage", "queueMicrotask",
		"requestAnimationFrame", "setInterval", "setTimeout", "caches",
		"__NEXT_DATA__", "__BUILD_MANIFEST", "__NEXT_PRELOADREADY",
	}
)

func parsePOWResources(html string) ([]string, string) {
	matches := scriptSrcRE.FindAllStringSubmatch(html, -1)
	sources := make([]string, 0, len(matches))
	dataBuild := ""
	for _, match := range matches {
		src := match[1]
		sources = append(sources, src)
		if dataBuild == "" {
			if hit := scriptBuildIDRE.FindString(src); hit != "" {
				dataBuild = hit
			}
		}
	}
	if len(sources) == 0 {
		sources = []string{defaultPOWScript}
	}
	if dataBuild == "" {
		if match := htmlDataBuildRE.FindStringSubmatch(html); len(match) > 1 {
			dataBuild = match[1]
		}
	}
	return sources, dataBuild
}

func powLegacyParseTime() string {
	est := time.FixedZone("EST", -5*3600)
	return time.Now().In(est).Format("Mon Jan 02 2006 15:04:05") + " GMT-0500 (Eastern Standard Time)"
}

func buildPOWConfig(userAgent string, scriptSources []string, dataBuild, language string) []any {
	if strings.TrimSpace(userAgent) == "" {
		userAgent = browserUserAgent
	}
	if strings.TrimSpace(language) == "" {
		language = "en-US"
	}
	scriptSource := defaultPOWScript
	if len(scriptSources) > 0 {
		if candidate := strings.TrimSpace(scriptSources[rand.Intn(len(scriptSources))]); candidate != "" {
			scriptSource = candidate
		}
	}
	if strings.TrimSpace(dataBuild) == "" {
		dataBuild = DefaultClientVersion
	}
	screen := powScreenResolutions[rand.Intn(len(powScreenResolutions))]
	perfMs := 120.0 + rand.Float64()*850.0
	nowMs := float64(time.Now().UnixNano()) / 1e6
	return []any{
		screen[0] + screen[1],
		powLegacyParseTime(),
		int64(4294705152),
		1,
		userAgent,
		scriptSource,
		dataBuild,
		language,
		language + ",es-US,en,es",
		rand.Float64(),
		powNavigatorKeys[rand.Intn(len(powNavigatorKeys))],
		powDocumentKeys[rand.Intn(len(powDocumentKeys))],
		powWindowKeys[rand.Intn(len(powWindowKeys))],
		perfMs,
		util.NewUUID(),
		"",
		powCores[rand.Intn(len(powCores))],
		nowMs - perfMs,
		0, 0, 0, 0, 0, 0,
		0,
	}
}

func encodePOWConfigBase64(config []any) (string, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(config); err != nil {
		return "", fmt.Errorf("encode pow config: %w", err)
	}
	return base64.StdEncoding.EncodeToString(bytes.TrimSuffix(buf.Bytes(), []byte("\n"))), nil
}

// buildLegacyRequirementsToken builds the in-process gAAAAAC Sentinel requirements token
// matching yukkcat/chatgpt2api utils/pow.py without requiring an external browser container.
func buildLegacyRequirementsToken(userAgent string, scriptSources []string, dataBuild, language string) (string, error) {
	config := buildPOWConfig(userAgent, scriptSources, dataBuild, language)
	encoded, err := encodePOWConfigBase64(config)
	if err != nil {
		return "", err
	}
	return "gAAAAAC" + encoded, nil
}

// decodeRequirementsConfig validates the 25-field requirements format before using it
// as proof input.
func decodeRequirementsConfig(p string) ([]any, error) {
	if !strings.HasPrefix(p, "gAAAAAC") || len(p) > 16384 {
		return nil, fmt.Errorf("invalid requirements token")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(p, "gAAAAAC"))
	if err != nil {
		return nil, fmt.Errorf("invalid requirements encoding")
	}
	var config []any
	if err := json.Unmarshal(raw, &config); err != nil || len(config) != 25 {
		return nil, fmt.Errorf("requirements must contain 25 fields")
	}
	return config, nil
}

// fnv1aAvalanche matches JavaScript charCodeAt (UTF-16), including non-ASCII seeds.
func fnv1aAvalanche(text string) uint32 {
	h := uint32(2166136261)
	for _, ch := range utf16.Encode([]rune(text)) {
		h ^= uint32(ch)
		h *= 16777619
	}
	h ^= h >> 16
	h *= 2246822507
	h ^= h >> 13
	h *= 3266489909
	return h ^ (h >> 16)
}

func buildProofToken(ctx context.Context, seed, difficulty, sourceP string) (string, error) {
	if seed == "" || len(seed) > 4096 || len(difficulty) < 1 || len(difficulty) > 8 {
		return "", fmt.Errorf("invalid proof challenge")
	}
	for _, ch := range difficulty {
		if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f') {
			return "", fmt.Errorf("invalid proof difficulty")
		}
	}
	config, err := decodeRequirementsConfig(sourceP)
	if err != nil {
		return "", err
	}
	started := time.Now()
	for i := 0; i < 500000; i++ {
		if i%256 == 0 {
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}
		config[3], config[9] = i, time.Since(started).Milliseconds()
		payload, err := encodePOWConfigBase64(config)
		if err != nil {
			return "", err
		}
		digest := fmt.Sprintf("%08x", fnv1aAvalanche(seed+payload))
		if digest[:len(difficulty)] <= difficulty {
			return "gAAAAAB" + payload + "~S", nil
		}
	}
	return "", fmt.Errorf("proof attempt budget exhausted")
}

// buildSHA3ProofToken solves SHA3-512 proof challenges (used when difficulty exceeds 32-bit FNV-1a).
func buildSHA3ProofToken(ctx context.Context, seed, difficulty, sourceP string) (string, error) {
	if seed == "" || len(seed) > 4096 || len(difficulty) < 1 || len(difficulty) > 128 {
		return "", fmt.Errorf("invalid sha3 proof challenge")
	}
	for _, ch := range difficulty {
		if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f') {
			return "", fmt.Errorf("invalid proof difficulty")
		}
	}
	config, err := decodeRequirementsConfig(sourceP)
	if err != nil {
		return "", err
	}
	for i := 0; i < 500000; i++ {
		if i%256 == 0 {
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}
		config[3], config[9] = i, i>>1
		payload, err := encodePOWConfigBase64(config)
		if err != nil {
			return "", err
		}
		sum := sha3.Sum512([]byte(seed + payload))
		digest := hex.EncodeToString(sum[:])
		if digest[:len(difficulty)] <= difficulty {
			return "gAAAAAB" + payload, nil
		}
	}
	return "", fmt.Errorf("sha3 proof attempt budget exhausted")
}
