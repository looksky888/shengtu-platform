package protocol

import (
	"context"
	"net/url"
	"path"
	"strings"
	"sync"
)

type generatedImageTrackerKey struct{}

// GeneratedImageTracker records image URLs and local relative /images/<rel> paths
// actually produced during a single HTTP request or task execution.
type GeneratedImageTracker struct {
	mu            sync.RWMutex
	localRels     map[string]struct{}
	localURLs     []string
	localURLSet   map[string]struct{}
	generatedURLs map[string]struct{}
}

func NewGeneratedImageTracker() *GeneratedImageTracker {
	return &GeneratedImageTracker{
		localRels:     make(map[string]struct{}),
		localURLSet:   make(map[string]struct{}),
		generatedURLs: make(map[string]struct{}),
	}
}

func WithGeneratedImageTracker(ctx context.Context) (context.Context, *GeneratedImageTracker) {
	if ctx == nil {
		ctx = context.Background()
	}
	if existing := GeneratedImageTrackerFromContext(ctx); existing != nil {
		return ctx, existing
	}
	tracker := NewGeneratedImageTracker()
	return context.WithValue(ctx, generatedImageTrackerKey{}, tracker), tracker
}

func GeneratedImageTrackerFromContext(ctx context.Context) *GeneratedImageTracker {
	if ctx == nil {
		return nil
	}
	tracker, _ := ctx.Value(generatedImageTrackerKey{}).(*GeneratedImageTracker)
	return tracker
}

func RecordGeneratedImageURL(ctx context.Context, rawURL string) {
	if tracker := GeneratedImageTrackerFromContext(ctx); tracker != nil {
		tracker.AddGeneratedURL(rawURL)
	}
}

func RecordLocalGeneratedImage(ctx context.Context, rawURL string) {
	if tracker := GeneratedImageTrackerFromContext(ctx); tracker != nil {
		tracker.AddLocalImageURL(rawURL)
	}
}

func (t *GeneratedImageTracker) AddLocalImageURL(rawURL string) {
	if t == nil {
		return
	}
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return
	}
	rel := extractLocalImagesRel(trimmed)
	t.mu.Lock()
	defer t.mu.Unlock()
	t.generatedURLs[trimmed] = struct{}{}
	if stripped := stripURLQueryAndFragment(trimmed); stripped != "" {
		t.generatedURLs[stripped] = struct{}{}
	}
	if rel != "" {
		t.localRels[rel] = struct{}{}
		t.generatedURLs["/images/"+rel] = struct{}{}
		if _, exists := t.localURLSet[trimmed]; !exists {
			t.localURLSet[trimmed] = struct{}{}
			t.localURLs = append(t.localURLs, trimmed)
		}
	}
}

func (t *GeneratedImageTracker) AddGeneratedURL(rawURL string) {
	if t == nil {
		return
	}
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return
	}
	if rel := extractLocalImagesRel(trimmed); rel != "" {
		t.AddLocalImageURL(trimmed)
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.generatedURLs[trimmed] = struct{}{}
	if stripped := stripURLQueryAndFragment(trimmed); stripped != "" {
		t.generatedURLs[stripped] = struct{}{}
	}
}

func (t *GeneratedImageTracker) HasLocalRel(rel string) bool {
	if t == nil {
		return false
	}
	cleaned := normalizeTrackerRel(rel)
	if cleaned == "" {
		return false
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	_, ok := t.localRels[cleaned]
	return ok
}

func (t *GeneratedImageTracker) HasURL(rawURL string) bool {
	if t == nil {
		return false
	}
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return false
	}
	if strings.HasPrefix(strings.ToLower(trimmed), "data:image/") {
		return true
	}
	rel := extractLocalImagesRel(trimmed)
	stripped := stripURLQueryAndFragment(trimmed)
	t.mu.RLock()
	defer t.mu.RUnlock()
	if _, ok := t.generatedURLs[trimmed]; ok {
		return true
	}
	if stripped != "" {
		if _, ok := t.generatedURLs[stripped]; ok {
			return true
		}
	}
	if rel != "" {
		if _, ok := t.localRels[rel]; ok {
			return true
		}
	}
	return false
}

func (t *GeneratedImageTracker) LocalURLs() []string {
	if t == nil {
		return nil
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	if len(t.localURLs) == 0 {
		return nil
	}
	out := make([]string, len(t.localURLs))
	copy(out, t.localURLs)
	return out
}

func stripURLQueryAndFragment(rawURL string) string {
	idx := strings.IndexAny(rawURL, "?#")
	if idx < 0 {
		return rawURL
	}
	return rawURL[:idx]
}

func extractLocalImagesRel(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}
	rawPath := trimmed
	if strings.Contains(trimmed, "://") {
		parsed, err := url.Parse(trimmed)
		if err != nil {
			return ""
		}
		rawPath = parsed.Path
	} else {
		rawPath = stripURLQueryAndFragment(trimmed)
		if unescaped, err := url.PathUnescape(rawPath); err == nil {
			rawPath = unescaped
		}
	}
	rawPath = strings.ReplaceAll(rawPath, "\\", "/")
	const marker = "/images/"
	if strings.HasPrefix(rawPath, marker) {
		return normalizeTrackerRel(strings.TrimPrefix(rawPath, marker))
	}
	if strings.HasPrefix(rawPath, "images/") {
		return normalizeTrackerRel(strings.TrimPrefix(rawPath, "images/"))
	}
	if idx := strings.Index(rawPath, marker); idx > 0 {
		// Support optional reverse-proxy subpath prefix when recording local URLs
		// produced by StoreImage(baseURL, ...), while rejecting .. segments.
		return normalizeTrackerRel(rawPath[idx+len(marker):])
	}
	return ""
}

func normalizeTrackerRel(rel string) string {
	rel = strings.TrimSpace(strings.ReplaceAll(rel, "\\", "/"))
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" {
		return ""
	}
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return ""
		}
	}
	cleaned := path.Clean(rel)
	if cleaned == "." || cleaned == "" || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return ""
	}
	return cleaned
}
