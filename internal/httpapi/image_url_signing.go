package httpapi

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const (
	defaultSignedImageURLTTL  = 30 * 24 * time.Hour
	imageURLSigningSecretFile = "image_url_signing.secret"
	imageURLSigningKeySalt    = "chatgpt2api:image-url-signing:v1:"
	thumbnailURLSuffix        = ".jpg"
)

var markdownImageURLPattern = regexp.MustCompile(`(!\[[^\]]*\]\()([^)\s]+)(\))`)

type imageSigningAuth struct {
	identity    service.Identity
	hasIdentity bool
	tracker     *protocol.GeneratedImageTracker
	requestHost string
}

func (a *App) imageURLSigningKey() []byte {
	if a != nil && a.config != nil {
		if secret := strings.TrimSpace(a.config.SessionSecret()); secret != "" {
			sum := sha256.Sum256([]byte(imageURLSigningKeySalt + secret))
			return sum[:]
		}
	}
	if a == nil {
		sum := sha256.Sum256([]byte(imageURLSigningKeySalt + "ephemeral-nil-app"))
		return sum[:]
	}
	a.imageURLSigningOnce.Do(func() {
		if a.config != nil && strings.TrimSpace(a.config.DataDir) != "" {
			secretPath := filepath.Join(a.config.DataDir, imageURLSigningSecretFile)
			if raw, err := os.ReadFile(secretPath); err == nil {
				if decoded, decErr := hex.DecodeString(strings.TrimSpace(string(raw))); decErr == nil && len(decoded) >= 32 {
					a.imageURLSigningSecret = decoded[:32]
					return
				}
			}
			buf := make([]byte, 32)
			if _, err := rand.Read(buf); err == nil {
				_ = os.MkdirAll(a.config.DataDir, 0o755)
				_ = os.WriteFile(secretPath, []byte(hex.EncodeToString(buf)), 0o600)
				a.imageURLSigningSecret = buf
				return
			}
		}
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			sum := sha256.Sum256([]byte(imageURLSigningKeySalt + strconv.FormatInt(time.Now().UnixNano(), 10)))
			buf = sum[:]
		}
		a.imageURLSigningSecret = buf
	})
	return a.imageURLSigningSecret
}

func normalizeSignedImageRel(rel string) (string, bool) {
	rel = strings.TrimSpace(filepath.ToSlash(rel))
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" {
		return "", false
	}
	cleaned := path.Clean(rel)
	if cleaned == "." || cleaned == "/" || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", false
	}
	for _, seg := range strings.Split(cleaned, "/") {
		if seg == "" || seg == "." || seg == ".." || strings.HasPrefix(seg, ".") {
			return "", false
		}
	}
	return cleaned, true
}

func baseURLPathPrefix(rawBase string) string {
	trimmed := strings.TrimSpace(rawBase)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	escaped := parsed.EscapedPath()
	if escaped == "" {
		escaped = parsed.Path
	}
	escaped = strings.TrimRight(escaped, "/")
	if escaped == "" || escaped == "/" {
		return ""
	}
	if !strings.HasPrefix(escaped, "/") {
		escaped = "/" + escaped
	}
	return escaped
}

func managedRouteSuffixFromEscapedPath(escapedPath, routePrefix, basePathPrefix string) (string, bool) {
	if strings.HasPrefix(escapedPath, routePrefix) {
		return strings.TrimPrefix(escapedPath, routePrefix), true
	}
	if basePathPrefix != "" {
		prefixed := basePathPrefix + routePrefix
		if strings.HasPrefix(escapedPath, prefixed) {
			return strings.TrimPrefix(escapedPath, prefixed), true
		}
	}
	return "", false
}

func managedImageRelFromEscapedPath(escapedPath, basePathPrefix string) (string, bool) {
	rawSuffix, ok := managedRouteSuffixFromEscapedPath(escapedPath, "/images/", basePathPrefix)
	if !ok {
		return "", false
	}
	rawRel, err := url.PathUnescape(rawSuffix)
	if err != nil {
		return "", false
	}
	return normalizeSignedImageRel(rawRel)
}

func managedThumbnailSourceRelFromEscapedPath(escapedPath, basePathPrefix string) (string, bool) {
	rawSuffix, ok := managedRouteSuffixFromEscapedPath(escapedPath, "/image-thumbnails/", basePathPrefix)
	if !ok {
		return "", false
	}
	rawThumbRel, err := url.PathUnescape(rawSuffix)
	if err != nil {
		return "", false
	}
	thumbRel, ok := normalizeSignedImageRel(rawThumbRel)
	if !ok || !strings.HasSuffix(strings.ToLower(thumbRel), thumbnailURLSuffix) {
		return "", false
	}
	sourceRaw := thumbRel[:len(thumbRel)-len(thumbnailURLSuffix)]
	return normalizeSignedImageRel(sourceRaw)
}

func extractManagedImageRelFromURLWithBase(rawURL, rawBase string) (*url.URL, string, bool) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" || strings.HasPrefix(trimmed, "data:") {
		return nil, "", false
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, "", false
	}
	if parsed.Scheme != "" && parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, "", false
	}
	escapedPath := parsed.EscapedPath()
	if escapedPath == "" {
		escapedPath = parsed.Path
	}
	rel, ok := managedImageRelFromEscapedPath(escapedPath, baseURLPathPrefix(rawBase))
	if !ok {
		return nil, "", false
	}
	return parsed, rel, true
}

func extractManagedImageRelFromURL(rawURL string) (*url.URL, string, bool) {
	return extractManagedImageRelFromURLWithBase(rawURL, "")
}

func extractManagedThumbnailSourceRelWithBase(rawURL, rawBase string) (*url.URL, string, bool) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" || strings.HasPrefix(trimmed, "data:") {
		return nil, "", false
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, "", false
	}
	if parsed.Scheme != "" && parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, "", false
	}
	escapedPath := parsed.EscapedPath()
	if escapedPath == "" {
		escapedPath = parsed.Path
	}
	sourceRel, ok := managedThumbnailSourceRelFromEscapedPath(escapedPath, baseURLPathPrefix(rawBase))
	if !ok {
		return nil, "", false
	}
	return parsed, sourceRel, true
}

func computeImageURLHMAC(key []byte, rel string, exp int64) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(rel))
	_, _ = mac.Write([]byte{'\n'})
	_, _ = mac.Write([]byte(strconv.FormatInt(exp, 10)))
	return mac.Sum(nil)
}

func sameURLOriginHost(parsed *url.URL, rawBase string) bool {
	if parsed == nil || strings.TrimSpace(rawBase) == "" {
		return false
	}
	baseParsed, err := url.Parse(strings.TrimSpace(rawBase))
	if err != nil || baseParsed.Host == "" {
		return false
	}
	return strings.EqualFold(parsed.Host, baseParsed.Host)
}

func (a *App) configuredBaseURL() string {
	if a == nil || a.config == nil {
		return ""
	}
	return strings.TrimSpace(a.config.BaseURL())
}

func (a *App) isManagedURLOrigin(parsed *url.URL, rel string, auth imageSigningAuth) bool {
	if parsed == nil {
		return false
	}
	if parsed.Host == "" {
		return true
	}
	if auth.tracker != nil && auth.tracker.HasLocalRel(rel) {
		return true
	}
	if auth.requestHost != "" && strings.EqualFold(parsed.Host, auth.requestHost) {
		return true
	}
	baseURL := a.configuredBaseURL()
	if baseURL != "" {
		return sameURLOriginHost(parsed, baseURL)
	}
	if a == nil || a.images == nil {
		return false
	}
	return a.canSignImageRel(rel, auth)
}

func (a *App) canSignImageRel(rel string, auth imageSigningAuth) bool {
	if auth.tracker != nil && auth.tracker.HasLocalRel(rel) {
		return true
	}
	if a == nil || a.images == nil {
		return false
	}
	scope := service.ImageAccessScope{}
	if auth.hasIdentity {
		scope = imageAccessScope(auth.identity)
	}
	_, err := a.images.ImageFileAccess(rel, scope)
	return err == nil
}

func (a *App) signParsedURLWithRel(rawURL string, parsed *url.URL, rel string, ttl time.Duration) string {
	query := parsed.Query()
	if query.Get("sig") != "" && query.Get("exp") != "" {
		return rawURL
	}
	if ttl <= 0 {
		ttl = defaultSignedImageURLTTL
	}
	exp := time.Now().Add(ttl).Unix()
	sig := hex.EncodeToString(computeImageURLHMAC(a.imageURLSigningKey(), rel, exp))
	query.Set("exp", strconv.FormatInt(exp, 10))
	query.Set("sig", sig)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func (a *App) signManagedImageURLWithAuth(rawURL string, ttl time.Duration, auth imageSigningAuth) string {
	parsed, rel, ok := extractManagedImageRelFromURLWithBase(rawURL, a.configuredBaseURL())
	if !ok {
		return rawURL
	}
	if !a.isManagedURLOrigin(parsed, rel, auth) || !a.canSignImageRel(rel, auth) {
		return rawURL
	}
	return a.signParsedURLWithRel(rawURL, parsed, rel, ttl)
}

func (a *App) signManagedThumbnailURLWithAuth(rawURL string, ttl time.Duration, auth imageSigningAuth) string {
	parsed, sourceRel, ok := extractManagedThumbnailSourceRelWithBase(rawURL, a.configuredBaseURL())
	if !ok {
		return rawURL
	}
	if !a.isManagedURLOrigin(parsed, sourceRel, auth) || !a.canSignImageRel(sourceRel, auth) {
		return rawURL
	}
	return a.signParsedURLWithRel(rawURL, parsed, sourceRel, ttl)
}

func (a *App) signManagedImageURL(rawURL string, ttl time.Duration) string {
	return a.signManagedImageURLWithAuth(rawURL, ttl, imageSigningAuth{})
}

func (a *App) verifySignedImageRequest(r *http.Request, rel string) bool {
	if a == nil || r == nil || r.URL == nil {
		return false
	}
	normalizedRel, ok := normalizeSignedImageRel(rel)
	if !ok {
		return false
	}
	query := r.URL.Query()
	expRaw := strings.TrimSpace(query.Get("exp"))
	sigRaw := strings.ToLower(strings.TrimSpace(query.Get("sig")))
	if expRaw == "" || sigRaw == "" {
		return false
	}
	exp, err := strconv.ParseInt(expRaw, 10, 64)
	if err != nil || exp < time.Now().Unix() {
		return false
	}
	gotSig, err := hex.DecodeString(sigRaw)
	if err != nil || len(gotSig) != sha256.Size {
		return false
	}
	wantSig := computeImageURLHMAC(a.imageURLSigningKey(), normalizedRel, exp)
	return hmac.Equal(gotSig, wantSig)
}

func (a *App) signMarkdownImageURLsWithAuth(content string, ttl time.Duration, auth imageSigningAuth) string {
	if !strings.Contains(content, "/images/") {
		return content
	}
	return markdownImageURLPattern.ReplaceAllStringFunc(content, func(match string) string {
		parts := markdownImageURLPattern.FindStringSubmatch(match)
		if len(parts) != 4 {
			return match
		}
		return parts[1] + a.signManagedImageURLWithAuth(parts[2], ttl, auth) + parts[3]
	})
}

func (a *App) signProtocolResultImageURLs(result map[string]any) {
	if a == nil || len(result) == 0 {
		return
	}
	a.signProtocolMapImageURLsWithAuth(result, defaultSignedImageURLTTL, imageSigningAuth{})
}

func (a *App) signProtocolResultImageURLsForRequest(r *http.Request, identity service.Identity, result map[string]any) {
	if a == nil || len(result) == 0 {
		return
	}
	auth := imageSigningAuth{
		identity:    identity,
		hasIdentity: strings.TrimSpace(identity.ID) != "" || strings.TrimSpace(identity.OwnerID) != "" || strings.TrimSpace(identity.Role) != "",
	}
	if r != nil {
		auth.tracker = protocol.GeneratedImageTrackerFromContext(r.Context())
		auth.requestHost = strings.TrimSpace(r.Host)
	}
	a.signProtocolMapImageURLsWithAuth(result, defaultSignedImageURLTTL, auth)
}

func (a *App) signProtocolMapImageURLsWithAuth(node map[string]any, ttl time.Duration, auth imageSigningAuth) {
	if len(node) == 0 {
		return
	}
	if rawURL, ok := node["url"].(string); ok && rawURL != "" {
		node["url"] = a.signManagedImageURLWithAuth(rawURL, ttl, auth)
	}
	if util.Clean(node["type"]) == "image_generation_call" {
		if rawResult, ok := node["result"].(string); ok && rawResult != "" {
			node["result"] = a.signManagedImageURLWithAuth(rawResult, ttl, auth)
		}
	}
	for _, item := range util.AsMapSlice(node["data"]) {
		if rawURL := util.Clean(item["url"]); rawURL != "" {
			item["url"] = a.signManagedImageURLWithAuth(rawURL, ttl, auth)
		}
		if rawThumb := util.Clean(item["thumbnail_url"]); rawThumb != "" {
			item["thumbnail_url"] = a.signManagedThumbnailURLWithAuth(rawThumb, ttl, auth)
		}
	}
	for _, choice := range util.AsMapSlice(node["choices"]) {
		if msg, ok := choice["message"].(map[string]any); ok {
			if content, ok := msg["content"].(string); ok && content != "" {
				msg["content"] = a.signMarkdownImageURLsWithAuth(content, ttl, auth)
			}
		}
		if delta, ok := choice["delta"].(map[string]any); ok {
			if content, ok := delta["content"].(string); ok && content != "" {
				delta["content"] = a.signMarkdownImageURLsWithAuth(content, ttl, auth)
			}
		}
	}
	for _, outputItem := range util.AsMapSlice(node["output"]) {
		a.signProtocolMapImageURLsWithAuth(outputItem, ttl, auth)
	}
	if respMap, ok := node["response"].(map[string]any); ok {
		a.signProtocolMapImageURLsWithAuth(respMap, ttl, auth)
	}
	if itemMap, ok := node["item"].(map[string]any); ok {
		a.signProtocolMapImageURLsWithAuth(itemMap, ttl, auth)
	}
}

func (a *App) signImageItemURLs(r *http.Request, identity service.Identity, item map[string]any) {
	if a == nil || item == nil {
		return
	}
	auth := imageSigningAuth{
		identity:    identity,
		hasIdentity: true,
	}
	if r != nil {
		auth.requestHost = strings.TrimSpace(r.Host)
	}
	if rawURL := util.Clean(item["url"]); rawURL != "" {
		item["url"] = a.signManagedImageURLWithAuth(rawURL, defaultSignedImageURLTTL, auth)
	}
	if rawThumb := util.Clean(item["thumbnail_url"]); rawThumb != "" {
		item["thumbnail_url"] = a.signManagedThumbnailURLWithAuth(rawThumb, defaultSignedImageURLTTL, auth)
	}
}

func (a *App) signImageListPayload(r *http.Request, identity service.Identity, payload map[string]any) {
	if a == nil || payload == nil {
		return
	}
	for _, item := range util.AsMapSlice(payload["items"]) {
		a.signImageItemURLs(r, identity, item)
	}
	for _, group := range util.AsMapSlice(payload["groups"]) {
		for _, item := range util.AsMapSlice(group["items"]) {
			a.signImageItemURLs(r, identity, item)
		}
	}
}

func (a *App) signImageTaskPublic(r *http.Request, identity service.Identity, task service.ImageTaskPublic) service.ImageTaskPublic {
	if a == nil || task.Data == nil {
		return task
	}
	auth := imageSigningAuth{
		identity:    identity,
		hasIdentity: true,
	}
	if r != nil {
		auth.requestHost = strings.TrimSpace(r.Host)
	}
	task.Data = a.cloneAndSignTaskData(task.Data, auth)
	return task
}

func (a *App) signImageTaskListResponse(r *http.Request, identity service.Identity, resp service.ImageTaskListResponse) service.ImageTaskListResponse {
	if a == nil || len(resp.Items) == 0 {
		return resp
	}
	signedItems := make([]service.ImageTaskPublic, len(resp.Items))
	for i, item := range resp.Items {
		signedItems[i] = a.signImageTaskPublic(r, identity, item)
	}
	resp.Items = signedItems
	return resp
}

func (a *App) cloneAndSignTaskData(raw any, auth imageSigningAuth) any {
	switch v := raw.(type) {
	case []map[string]any:
		out := make([]map[string]any, len(v))
		for i, entry := range v {
			cloned := util.CopyMap(entry)
			a.signTaskDataMap(cloned, auth)
			out[i] = cloned
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, entry := range v {
			if m, ok := entry.(map[string]any); ok {
				cloned := util.CopyMap(m)
				a.signTaskDataMap(cloned, auth)
				out[i] = cloned
			} else {
				out[i] = entry
			}
		}
		return out
	case map[string]any:
		cloned := util.CopyMap(v)
		a.signTaskDataMap(cloned, auth)
		return cloned
	default:
		return raw
	}
}

func (a *App) signTaskDataMap(entry map[string]any, auth imageSigningAuth) {
	if entry == nil {
		return
	}
	if rawURL := util.Clean(entry["url"]); rawURL != "" {
		entry["url"] = a.signManagedImageURLWithAuth(rawURL, defaultSignedImageURLTTL, auth)
	}
	if rawThumb := util.Clean(entry["thumbnail_url"]); rawThumb != "" {
		entry["thumbnail_url"] = a.signManagedThumbnailURLWithAuth(rawThumb, defaultSignedImageURLTTL, auth)
	}
}
