package httpapi

import (
	"crypto/sha256"
	"regexp"
	"strings"

	"chatgpt2api/internal/util"
)

var markdownImageTargetPattern = regexp.MustCompile(`!\[[^\]]*\]\(([^)\s]+)\)`)

// Stream chunks and final envelopes can repeat the same image across events
// (e.g. response.output_item.added, output_item.done, and response.completed).
// Keep only SHA-256 fingerprints for inline payloads so memory stays constant.
type inlineImageCounter map[[32]byte]struct{}

func (counter inlineImageCounter) recordInline(encoded string) {
	encoded = strings.TrimSpace(encoded)
	if encoded == "" {
		return
	}
	counter[sha256.Sum256([]byte(encoded))] = struct{}{}
}

func isHTTPOrMediaURL(raw string) bool {
	lower := strings.ToLower(strings.TrimSpace(raw))
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "/images/") || strings.HasPrefix(lower, "/api/media/")
}

func extractMarkdownImageTargets(text string) []string {
	if !strings.Contains(text, "![") {
		return nil
	}
	matches := markdownImageTargetPattern.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}
	out := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) > 1 {
			if target := strings.TrimSpace(match[1]); target != "" {
				out = append(out, target)
			}
		}
	}
	return out
}

func observeContentMarkdownImages(counter inlineImageCounter, content any) {
	switch x := content.(type) {
	case string:
		for _, target := range extractMarkdownImageTargets(x) {
			if !isHTTPOrMediaURL(target) {
				counter.recordInline(target)
			}
		}
	case []any:
		for _, part := range x {
			if m, ok := part.(map[string]any); ok {
				observeContentMarkdownImages(counter, m["text"])
			}
		}
	case []map[string]any:
		for _, part := range x {
			observeContentMarkdownImages(counter, part["text"])
		}
	}
}

func observeResponseOutputItem(counter inlineImageCounter, item map[string]any) {
	if item == nil {
		return
	}
	if util.Clean(item["type"]) == "image_generation_call" {
		raw := firstNonEmpty(util.Clean(item["result"]), util.Clean(item["b64_json"]), util.Clean(item["url"]))
		if raw != "" && !isHTTPOrMediaURL(raw) {
			counter.recordInline(raw)
		}
	}
}

func (counter inlineImageCounter) observe(item map[string]any) {
	if item == nil {
		return
	}
	// 1. /v1/images/* top-level data[] or b64_json
	for _, row := range util.AsMapSlice(item["data"]) {
		if util.Clean(row["url"]) != "" {
			continue
		}
		if encoded := util.Clean(row["b64_json"]); encoded != "" {
			counter.recordInline(encoded)
		}
	}
	if util.Clean(item["url"]) == "" {
		if encoded := util.Clean(item["b64_json"]); encoded != "" {
			counter.recordInline(encoded)
		}
	}

	// 2. /v1/chat/completions choices[].message.content or choices[].delta.content
	for _, choice := range util.AsMapSlice(item["choices"]) {
		if msg, ok := choice["message"].(map[string]any); ok {
			observeContentMarkdownImages(counter, msg["content"])
		}
		if delta, ok := choice["delta"].(map[string]any); ok {
			observeContentMarkdownImages(counter, delta["content"])
		}
	}

	// 3. /v1/responses output[] / item / response.output[]
	observeResponseOutputItem(counter, item)
	if subItem, ok := item["item"].(map[string]any); ok {
		observeResponseOutputItem(counter, subItem)
	}
	for _, outItem := range util.AsMapSlice(item["output"]) {
		observeResponseOutputItem(counter, outItem)
	}
	if respObj, ok := item["response"].(map[string]any); ok {
		for _, outItem := range util.AsMapSlice(respObj["output"]) {
			observeResponseOutputItem(counter, outItem)
		}
	}
}

func (counter inlineImageCounter) hasAny(urls []string, hasExplicitData bool) bool {
	return len(urls) > 0 || len(counter) > 0 || hasExplicitData
}

func (counter inlineImageCounter) count(urls []string, hasData bool, billed int) int {
	count := len(dedupe(urls)) + len(counter)
	if count == 0 {
		count = countStreamImageResults(urls, hasData, billed)
	}
	if billed > 0 && count > billed {
		count = billed
	}
	return count
}

func countDeliveredProtocolImages(result map[string]any, urls []string, billed int) int {
	counter := inlineImageCounter{}
	counter.observe(result)
	hasExplicit := len(util.AsMapSlice(result["data"])) > 0
	return counter.count(urls, hasExplicit, billed)
}
